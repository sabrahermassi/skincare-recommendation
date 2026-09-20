import { analyseLabel } from "@/data/api";
import { stripBase64ImageMetadata } from "@/lib/image-metadata";

/** What to open once a photo has been read: the result screen's params. */
export type LabelResultParams = { id: string; offerBarcode?: string; scanToken?: string };

/** Why a photo did not become a result, and what the person can do about it. */
export type LabelReadFailure = {
  message: string;
  hint?: string;
  /** Required, not optional: a failure whose retryability nobody decided defaults to "retryable" by accident. */
  retryable: boolean;
};

export type LabelReadOutcome = { kind: "result"; params: LabelResultParams } | ({ kind: "failed" } & LabelReadFailure);

/**
 * Clean a photographed or chosen ingredient list, send it to be read, and say
 * what should happen next. The one place this is decided, so the label camera
 * and the permission screens that offer a chosen photo cannot give different
 * answers for the same picture.
 *
 * `imageBase64` is whatever is about to be sent — already cropped to the frame
 * for a camera photo, scaled down for a chosen one. `barcode` is the one handed
 * over by whoever sent the user here after a miss; the product read is saved
 * under it. A rejected request throws: the caller owns the generic
 * "something went wrong" message.
 */
export async function readLabelPhoto(imageBase64: string, barcode?: string): Promise<LabelReadOutcome> {
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

  const result = await analyseLabel(clean.base64, { barcode });

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
    // No barcode was in hand for this scan — the row `label-ocr` just
    // wrote is on a grace timer and nobody else can ever find it (see
    // migration 0014 and resolve-scan). Flagging it here is what lets
    // the product screen offer the "scan the barcode too?" follow-up
    // only on the visit that just created the row, not on every later
    // visit to it. `scanToken` is threaded along too — without it
    // there is nothing safe to resolve the offer with (see
    // resolve-scan's ownership check), so the product screen treats a
    // missing token the same as no offer at all.
    return {
      kind: "result",
      params:
        barcode || !result.scanToken
          ? { id: result.product.id }
          : { id: result.product.id, offerBarcode: "1", scanToken: result.scanToken },
    };
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
  reason: "not_configured" | "server_unavailable" | "unreadable" | "too_little_text" | "rate_limited",
  hasBarcode: boolean
): LabelReadFailure {
  switch (reason) {
    case "too_little_text":
      return {
        message: "We couldn't find an ingredient list in that photo.",
        hint: "Get closer so the small print fills the frame, and avoid glare.",
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
      // `LabelAnalysis`'s comment in `data/api.ts`. Permanent for this
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
