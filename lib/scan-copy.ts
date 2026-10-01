import type { FetchFailure } from "@/data/api";

/**
 * Every state the scan flow can be in, and the words for each (#204).
 *
 * Before this, the same failures were described in four places with four
 * vocabularies: `failureMessage` in `data/api.ts`, `failureCopy` in
 * `lib/read-label-photo.ts`, a save-failure table and a catch-all in the
 * label camera. A rate limit was worded three ways, and "our catalogue" was
 * named in some failures and not others. Now there are seven states and one
 * table.
 *
 * Two of them must never be confused: **Couldn't read it** means the thing
 * pointed at was the problem (retake it), **Couldn't reach us** means the
 * network, a timeout, a rate limit or our server (it isn't the scan). The
 * three main messages are fixed in `FOR_ME_MVP.md` §22. One sentence per
 * state; `not_configured` (a build with no backend) is a developer's message
 * and stays outside this set.
 */
export type ScanState =
  | { kind: "ready"; mode: "barcode" | "photo" }
  | { kind: "working"; step: "lookup" | "photo" | "save" }
  | { kind: "found" }
  | { kind: "not-ours-yet" }
  | {
      kind: "couldnt-read";
      why:
        | "not-a-product-code" // a QR code or a non-retail barcode
        | "photo" // blurred, too little text, too large, not an image
        | "not-a-list" // text was read, but none of it is an ingredient
        | "unrecognised" // an ingredient list, in names we don't know yet
        | "retake"; // the read is too old to save, or its list was refused at save
    }
  | { kind: "couldnt-reach"; why: "default" | "rate-limit" }
  | { kind: "camera-off"; mode: "barcode" | "photo"; refused: boolean };

export type ScanCopy = {
  title?: string;
  line?: string;
  /** The button, when the state has one. */
  action?: string;
  /** The quiet underlined way out, when there is one. */
  link?: string;
  /** A small line of scope under the rest. */
  note?: string;
};

/** Clears a panel and puts the camera back to scanning. */
export const SCAN_SOMETHING_ELSE = "Scan something else";

export function scanStateCopy(state: ScanState): ScanCopy {
  switch (state.kind) {
    case "ready":
      return state.mode === "barcode"
        ? {
            line: "Point your camera at the barcode",
            // Shown after about eight seconds with nothing read.
            link: "Barcode not scanning? Photograph the ingredients instead.",
          }
        : {
            title: "Fill the frame with the ingredient list",
            line: "Hold steady. The photo is sent to Google to read the text, then discarded.",
          };
    case "working":
      return state.step === "lookup"
        ? { title: "Got it", line: "Looking this one up…" }
        : state.step === "photo"
          ? { title: "Checking our database…", line: "Hang on, this takes a few seconds.", link: "Cancel" }
          : { title: "Saving…" };
    case "found":
      return { action: "See full result" };
    case "not-ours-yet":
      // v9: the ingredient list is the way on.
      return {
        title: "Not in our catalogue yet",
        line: "Scan its ingredient list instead. We'll read it and score it for your skin.",
        action: "Scan the ingredient list",
      };
    case "couldnt-read":
      switch (state.why) {
        case "not-a-product-code":
          return {
            title: "That's not a product barcode",
            line: "Look for the striped barcode on the packaging.",
            action: "Scan again",
          };
        case "photo":
          return {
            title: "We couldn't read the ingredients",
            line: "Get closer so the small print fills the frame, and tilt away from any glare.",
            action: "Try again",
            link: "Choose a photo instead",
          };
        case "not-a-list":
          return {
            title: "That doesn't look like an ingredient list",
            line: 'Find the panel that starts with "Ingredients" and fill the frame with it.',
            action: "Try again",
          };
        case "unrecognised":
          // The photo was good enough — the names were read (#185) — but too
          // few match what we know. "Get closer" would be a lie here.
          return {
            title: "We don't know enough of these names yet",
            line: "This happens with formulas we don't have full translations for yet.",
            action: "Try again",
          };
        case "retake":
          return {
            title: "Let's take that photo again",
            line: "We need a fresh photo of the ingredient list to save this product.",
            action: "Retake the photo",
          };
      }
      break;
    case "couldnt-reach":
      return state.why === "rate-limit"
        ? {
            title: "Let's take a short break",
            line: "That was a lot of scans at once. Try again in a minute or two.",
            action: "Try again",
          }
        : {
            title: "We couldn't check that just now",
            line: "It's us or the connection, not your scan.",
            action: "Try again",
          };
    case "camera-off":
      // v9 (read off the hand-off). Photo mode's "Choose a
      // photo instead" is the way on without a camera.
      return state.refused
        ? {
            title: "The camera is off",
            line: "Turn it on in Settings to scan products.",
            action: "Open Settings",
          }
        : state.mode === "barcode"
          ? {
              title: "Scan a barcode",
              line: "Point your camera at the barcode on the pack. We only use it while you scan.",
              action: "Turn on the camera",
            }
          : {
              title: "Scan the ingredient list",
              line: "Take a photo of the list on the back and we'll read it for you.",
              action: "Turn on the camera",
            };
  }
}

/** One sentence for a screen reader: the title and the line together. */
export function scanStateSpeech(copy: ScanCopy): string {
  return [copy.title, copy.line].filter(Boolean).join(". ").replace(/\.\./g, ".").replace(/…\./g, "…");
}

/** A barcode lookup that could not be made. */
export function lookupFailureState(failure: FetchFailure): ScanState {
  return { kind: "couldnt-reach", why: failure.kind === "rate-limited" ? "rate-limit" : "default" };
}

/** Why a label read failed (`LabelRead`'s reasons), as a scan state. */
export type LabelFailureReason =
  | "server_unavailable"
  | "unreadable"
  | "too_little_text"
  | "unrecognised_names"
  | "rate_limited"
  | "network_error"
  | "not_a_list"
  | "too_large";

export function labelFailureState(reason: LabelFailureReason): ScanState {
  switch (reason) {
    case "unreadable":
    case "too_little_text":
    case "too_large":
      return { kind: "couldnt-read", why: "photo" };
    case "not_a_list":
      return { kind: "couldnt-read", why: "not-a-list" };
    case "unrecognised_names":
      return { kind: "couldnt-read", why: "unrecognised" };
    case "rate_limited":
      return { kind: "couldnt-reach", why: "rate-limit" };
    // A 503 is ours (Vision's key, or the day's ceiling), never the photo's.
    case "server_unavailable":
    case "network_error":
      return { kind: "couldnt-reach", why: "default" };
  }
}

/** Why a save failed, when it is a scan state rather than the name the person typed. */
export type SaveFailureReason = "unreadable_list" | "expired" | "rate_limited" | "failed" | "network_error";

export function saveFailureState(reason: SaveFailureReason): ScanState {
  switch (reason) {
    case "unreadable_list":
    case "expired":
      return { kind: "couldnt-read", why: "retake" };
    case "rate_limited":
      return { kind: "couldnt-reach", why: "rate-limit" };
    case "failed":
    case "network_error":
      return { kind: "couldnt-reach", why: "default" };
  }
}

/** The developer's message for a build with no backend: not a state a real person meets. */
export const NOT_CONFIGURED_COPY = "Reading ingredient lists isn't available in this build.";
