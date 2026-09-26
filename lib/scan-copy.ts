import type { FetchFailure } from "@/data/api";

/**
 * Every state the scan flow can be in, and the words for each (#204).
 *
 * Before this, the same failures were described in four places with four
 * vocabularies: `failureMessage` in `data/api.ts`, `failureCopy` in
 * `lib/read-label-photo.ts`, add-product's save table and a catch-all in the
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
  /** A second quiet way out: look the product up by the name on the pack (#323). */
  byName?: string;
  /** A small line of scope under the rest. */
  note?: string;
};

const SEARCH_LINK = "Find it in Search";
const BY_NAME = "Search by name";

export function scanStateCopy(state: ScanState): ScanCopy {
  switch (state.kind) {
    case "ready":
      return state.mode === "barcode"
        ? {
            line: "Point the camera at a barcode",
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
          ? { title: "Reading the ingredients…", line: "This takes a few seconds.", link: "Cancel" }
          : { title: "Saving…" };
    case "found":
      return { action: "See full result" };
    case "not-ours-yet":
      return {
        title: "We don't have this product yet",
        line: "Photograph its ingredient list and we'll add it.",
        action: "Photograph the ingredients",
        link: "Scan something else",
        byName: BY_NAME,
        note: "Only skincare and body care can be added.",
      };
    case "couldnt-read":
      switch (state.why) {
        case "not-a-product-code":
          return {
            title: "That's not a product barcode",
            line: "Look for the striped barcode on the packaging.",
            action: "Scan again",
            byName: BY_NAME,
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
            link: SEARCH_LINK,
          }
        : {
            title: "We couldn't check that just now",
            line: "It's us or the connection, not your scan.",
            action: "Try again",
            link: SEARCH_LINK,
          };
    case "camera-off":
      return state.refused
        ? {
            title: "The camera is turned off",
            line: "Turn it back on for for.me in your settings, then come back.",
            action: "Open settings",
            link: SEARCH_LINK,
          }
        : state.mode === "barcode"
          ? {
              title: "Scan a product",
              line: "Point your camera at a barcode and we'll read the ingredients for you. Nothing leaves your phone except the barcode number.",
              action: "Turn on the camera",
              link: SEARCH_LINK,
            }
          : {
              title: "Photograph the ingredient list",
              line: "Take a photo of the list on the back and we'll read it. We crop to the frame, send it to Google to read the text, and never store the image.",
              action: "Turn on the camera",
              link: SEARCH_LINK,
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
