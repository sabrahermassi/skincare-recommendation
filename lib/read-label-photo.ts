import { readLabel } from "@/data/api";
import { stripBase64ImageMetadata } from "@/lib/image-metadata";
import { clearLabelRead, holdLabelRead } from "@/lib/pending-label";

/** Why a photo did not become a result, and what the person can do about it. */
export type LabelReadFailure = {
  message: string;
  hint?: string;
  /** Required, not optional: a failure whose retryability nobody decided defaults to "retryable" by accident. */
  retryable: boolean;
};

/** `read`: the list is held for the add-product screen, which the caller now opens. */
export type LabelReadOutcome = { kind: "read" } | ({ kind: "failed" } & LabelReadFailure);

/**
 * Clean a photographed or chosen ingredient list, send it to be read, and say
 * what should happen next. The one place this is decided, so the label camera
 * and the permission screens that offer a chosen photo cannot give different
 * answers for the same picture. Reading stores nothing: a good read is held in
 * memory (`lib/pending-label.ts`) for the add-product screen to save with a
 * barcode and a name.
 *
 * `imageBase64` is whatever is about to be sent — already cropped to the frame
 * for a camera photo, scaled down for a chosen one. `barcode` is the one handed
 * over by whoever sent the user here after a miss; the product is saved under it. A rejected request throws: the caller owns the generic
 * "something went wrong" message.
 *
 * `isStillWanted`, checked only once the read has actually succeeded: a read
 * takes seconds, and the caller may no longer want it by the time it lands
 * (the user switched away and back, or left entirely — see issue #191). This
 * function has no way to *stop* navigation on its own — that decision lives
 * with the caller, which already has its own stale-read guard — but it is
 * the only place that knows a hold is about to happen, so it is the only
 * place that can keep a dropped read from leaving a stale list and a live,
 * single-use read token sitting in `lib/pending-label` for nobody to use.
 * Omitted, every read is always wanted — the existing behaviour for every
 * caller that has no such staleness concept (`app/scan-label.tsx`).
 */
export async function readLabelPhoto(
  imageBase64: string,
  barcode?: string,
  isStillWanted?: () => boolean
): Promise<LabelReadOutcome> {
  // A phone photo carries GPS coordinates, a device identifier and a
  // capture timestamp in its EXIF block, and this image is on its way to
  // Google Vision — so a home address would cross a third-party boundary
  // attached to a picture of a bottle. `skipProcessing: true` on the camera
  // makes that worse on Android, where it hands back the raw sensor JPEG.
  // `expo-image-manipulator` re-encodes as part of cropping and could
  // reintroduce its own metadata, so this still runs unconditionally on
  // whichever image — cropped or not — is about to be sent.
  //
  // `label-ocr` strips again on ingest and that is the actual control;
  // this pass is what keeps the coordinates from leaving the handset in
  // the first place. Failing closed rather than falling back to the
  // original: an image we cannot parse is an image we should not forward.
  const clean = stripBase64ImageMetadata(imageBase64);
  if (!clean.ok) {
    return {
      kind: "failed",
      message: clean.reason === "too_large" ? "That photo is too large to read." : "We couldn't read that image.",
      hint:
        clean.reason === "too_large"
          ? "Try again — the ingredient panel alone is enough, it doesn't need the whole box."
          : "Try again with steadier hands or better light.",
      retryable: true,
    };
  }

  const result = await readLabel(clean.base64);

  // The server's "did we find enough text to try" check happens before it
  // knows whether any of that text is actually an ingredient. A photo of
  // something else entirely — a wall, a receipt, a face — can still clear
  // that bar if the OCR returns a handful of comma-separated words, and
  // this is what let a random photo through to a product screen showing
  // "Can't tell yet" instead of an honest failure: recognising literally
  // nothing is not a product, it's a label we couldn't read, and it
  // deserves the same message as one, not a page that looks like a scan
  // succeeded.
  if (result.ok && (result.total === 0 || result.recognised === 0)) {
    return {
      kind: "failed",
      message: "That doesn't look like an ingredient list.",
      hint: "Make sure the ingredient panel fills the frame, then try again.",
      retryable: true,
    };
  }

  if (result.ok) {
    if (isStillWanted && !isStillWanted()) {
      // Nothing should navigate for this — the caller's own guard already
      // refuses that — but without this, the list and the single-use read
      // token this call just produced would sit in `lib/pending-label`
      // until the next read overwrites them. Cleared defensively rather
      // than simply skipping `holdLabelRead`: an earlier, still-wanted read
      // could theoretically still be sitting there if this one raced ahead
      // of it, and a dropped read must not leave *anything* behind for the
      // add-product screen to find, wanted or not.
      clearLabelRead();
      return { kind: "read" };
    }
    holdLabelRead({ ingredients: result.ingredients, barcode, readToken: result.readToken });
    return { kind: "read" };
  }

  return { kind: "failed", ...failureCopy(result.reason, !!barcode) };
}

/**
 * Each failure gets a different next action, because they have different
 * fixes.
 *
 * `hasBarcode` is whoever navigated here having already handed one over —
 * from a catalogue miss (`(tabs)/index.tsx`), a recorded miss in Saved, or a
 * recognised product with no formula yet (`product/[id].tsx`). In all three,
 * the barcode already ran and either missed or led here; telling that user
 * to "try the barcode" sends them straight back through the same loop. Only
 * the bare "photograph a label" entry point (no barcode in hand at all) can
 * usefully be pointed at it. Found in review on #121.
 */
export function failureCopy(
  reason:
    | "not_configured"
    | "server_unavailable"
    | "unreadable"
    | "too_little_text"
    | "unrecognised_names"
    | "rate_limited",
  hasBarcode: boolean
): LabelReadFailure {
  switch (reason) {
    case "too_little_text":
      return {
        message: "We couldn't find an ingredient list in that photo.",
        hint: "Get closer so the small print fills the frame, and avoid glare.",
        retryable: true,
      };
    // The photo was good enough — the names were read (#185 keeps a
    // Korean/Japanese name instead of discarding it) — but too few matched
    // what we know to score. "Get closer" would be a lie here: a better
    // photo of the same label reads the same names. Retaking only helps if
    // the label genuinely has more Latin/English text further down.
    case "unrecognised_names":
      return {
        message: "We read this list, but don't recognise enough of these ingredient names yet.",
        hint: "This can happen with formulas we don't have full translations for yet.",
        retryable: true,
      };
    case "rate_limited":
      return {
        message: "That's a lot of ingredient photos in a short time.",
        hint: "Give it a few minutes and try again.",
        retryable: true,
      };
    case "not_configured":
      // This install has no Supabase credentials at all — see
      // `LabelRead`'s comment in `data/api.ts`. Permanent for this
      // build, so no "temporarily", no "try again", and — per Codex's next
      // finding on #121 — no retry button either: retaking the photo would
      // run the exact same check and fail the exact same way.
      console.warn("[scan-label] label-ocr not available: this app has no Supabase credentials configured");
      return {
        message: "Reading ingredient lists isn't available in this build.",
        hint: hasBarcode
          ? "Look the product up in Browse instead."
          : "Try the barcode instead, or look the product up in Browse.",
        retryable: false,
      };
    case "server_unavailable":
      // The server answered 503 because its Vision API key is unset — an
      // ops problem, genuinely temporary and worth retrying later, unlike
      // `not_configured` above. Kept out of the user-facing copy per #96.
      console.warn("[scan-label] label-ocr unavailable: server's Vision API key is unset");
      return {
        message: "Reading ingredient lists is temporarily unavailable.",
        hint: hasBarcode
          ? "Look the product up in Browse, or try again later."
          : "Try the barcode instead, or look the product up in Browse.",
        retryable: true,
      };
    case "unreadable":
      return {
        message: "We couldn't read that image.",
        hint: "Try again with steadier hands or better light.",
        retryable: true,
      };
  }
}
