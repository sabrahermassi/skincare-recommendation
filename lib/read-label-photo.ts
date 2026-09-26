import { readLabel } from "@/data/api";
import { stripBase64ImageMetadata } from "@/lib/image-metadata";
import { clearLabelRead, heldLabelRead, holdLabelRead } from "@/lib/pending-label";
import {
  labelFailureState,
  NOT_CONFIGURED_COPY,
  scanStateCopy,
  type LabelFailureReason,
  type ScanState,
} from "@/lib/scan-copy";

/** Why a photo did not become a result, and what the person can do about it. */
export type LabelReadFailure = {
  message: string;
  hint?: string;
  /** The button that fixes it (`scanStateCopy`'s action), when there is one. */
  action?: string;
  /** Required, not optional: a failure whose retryability nobody decided defaults to "retryable" by accident. */
  retryable: boolean;
};

/** A scan state's words as a failure to show under the shutter (#204). */
export function failureFromState(state: ScanState): LabelReadFailure {
  const copy = scanStateCopy(state);
  return { message: copy.title ?? "", hint: copy.line, action: copy.action, retryable: true };
}

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
  // Snapshotted before the read is sent, so the cleanup below can tell "still
  // whatever was there before I started" from "someone else has since held a
  // newer, still-wanted read here" — see the comment at the clear below.
  const heldBeforeSend = heldLabelRead();

  const clean = stripBase64ImageMetadata(imageBase64);
  if (!clean.ok) {
    return { kind: "failed", ...failureFromState(labelFailureState(clean.reason === "too_large" ? "too_large" : "unreadable")) };
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
    return { kind: "failed", ...failureFromState(labelFailureState("not_a_list")) };
  }

  if (result.ok) {
    if (isStillWanted && !isStillWanted()) {
      // Nothing should navigate for this — the caller's own guard already
      // refuses that — but without this, an abandoned read that got here
      // first would sit in `lib/pending-label` forever, since nothing else
      // is watching it. Only cleared if nothing has changed there since
      // this read was sent: a newer, still-wanted read can finish and hold
      // its own result while this one is still in flight (switch away, then
      // back, then a second, faster photo — see issue #191's PR review),
      // and this being unwanted must not reach across and clear *that* one
      // out from under the add-product screen. This call never held its
      // own result in the first place, so there is nothing of its own to
      // protect — only someone else's to avoid touching.
      if (heldLabelRead() === heldBeforeSend) clearLabelRead();
      return { kind: "read" };
    }
    holdLabelRead({ ingredients: result.ingredients, barcode, readToken: result.readToken });
    return { kind: "read" };
  }

  return { kind: "failed", ...failureCopy(result.reason, !!barcode) };
}

/**
 * The words for a failed read: `scanStateCopy`'s, through `labelFailureState`
 * (#204), except `not_configured` — a build with no backend, which a real
 * person never meets. It alone can't be retried: retaking the photo would run
 * the same check and fail the same way (#121).
 *
 * `hasBarcode` is whoever navigated here having already handed one over — a
 * catalogue miss, a recorded miss in Saved, or a recognised product with no
 * formula yet. Telling that person to "try the barcode" sends them straight
 * back through the same loop, so only the bare entry point is pointed at it.
 */
export function failureCopy(reason: LabelFailureReason | "not_configured", hasBarcode: boolean): LabelReadFailure {
  if (reason === "not_configured") {
    console.warn("[label-read] label-ocr not available: this app has no Supabase credentials configured");
    return {
      message: NOT_CONFIGURED_COPY,
      hint: hasBarcode ? "Look the product up in Search instead." : "Try the barcode instead, or look the product up in Search.",
      retryable: false,
    };
  }
  if (reason === "server_unavailable") {
    // Kept out of the words on screen per #96, which are the ordinary
    // "couldn't reach us" ones.
    console.warn("[label-read] label-ocr unavailable: Vision key unset or daily ceiling reached");
  }
  return failureFromState(labelFailureState(reason));
}
