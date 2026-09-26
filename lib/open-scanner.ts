import { router } from "expo-router";

/**
 * How long after opening the scanner a repeat call is ignored — about as long
 * as the slide-up takes. A second tap on the same button before the first
 * open lands is not a second request.
 */
const REPEAT_GUARD_MS = 800;

let lastOpenedAt = 0;

/**
 * Opens the full-screen scanner — from the tab bar's scan button, a "Scan a
 * product" card, or a "Scan another" button. It slides up from the bottom
 * like any iOS full-screen modal (`app/_layout.tsx`), and slides back down
 * when closed (#313).
 *
 * `push`, so every open is a fresh scanner that slides up, and the repeat
 * guard is what stops a double tap from pushing two (#315 review). With the
 * installed expo-router, `navigate` would only have absorbed a repeat while a
 * scanner was already on top; it never goes back to one lower in the stack.
 */
export function openScanner() {
  openScannerAt(Date.now());
}

/**
 * Opens straight into Photo mode, with the barcode a list read there will be
 * saved under — Saved's recorded miss (#204). A function of its own, not an
 * argument to `openScanner`, which is handed straight to `onPress` and would
 * take the press event for one.
 */
export function openPhotoScanner(photo: PhotoFor) {
  openScannerAt(Date.now(), photo);
}

export type PhotoFor = { barcode?: string };

/** The scanner route in Photo mode for `photo`, for `router.dismissTo` as well as a push. */
export function photoScannerHref(photo: PhotoFor) {
  return { pathname: "/scanner", params: { mode: "photo", ...(photo.barcode ? { barcode: photo.barcode } : {}) } } as const;
}

/** `openScanner` with the clock passed in — exported for the test. */
export function openScannerAt(now: number, photo?: PhotoFor) {
  if (now - lastOpenedAt < REPEAT_GUARD_MS) return;
  lastOpenedAt = now;
  router.push(photo ? photoScannerHref(photo) : "/scanner");
}
