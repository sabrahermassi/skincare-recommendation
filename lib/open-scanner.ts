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
 * `push`, not `navigate`: `navigate` reuses any scanner already in the stack,
 * so "Scan another" on a result opened from the scanner would slide *back* to
 * that old scanner instead of opening a fresh one (#315 review). The repeat
 * guard is what stops a double tap from pushing two.
 */
export function openScanner() {
  openScannerAt(Date.now());
}

/** `openScanner` with the clock passed in — exported for the test. */
export function openScannerAt(now: number) {
  if (now - lastOpenedAt < REPEAT_GUARD_MS) return;
  lastOpenedAt = now;
  router.push("/scanner");
}
