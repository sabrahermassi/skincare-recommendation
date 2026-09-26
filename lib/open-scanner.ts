import { router } from "expo-router";

/**
 * Opens the full-screen scanner — from the tab bar's scan button, a "Scan a
 * product" card, or a "Scan another" button. It slides up from the bottom
 * like any iOS full-screen modal (`app/_layout.tsx`), and slides back down
 * when closed (#313).
 */
export function openScanner() {
  // `navigate`, not `push`: a second tap before the first slide-up lands would
  // push a second scanner, and the X would then close only the top one
  // (#315 review). `navigate` reuses a scanner already in the stack.
  router.navigate("/scanner");
}
