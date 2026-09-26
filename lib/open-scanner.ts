import { router } from "expo-router";

/**
 * Opens the full-screen scanner — from the tab bar's scan button, a "Scan a
 * product" card, or a "Scan another" button. It slides up from the bottom
 * like any iOS full-screen modal (`app/_layout.tsx`), and slides back down
 * when closed (#313).
 */
export function openScanner() {
  router.push("/scanner");
}
