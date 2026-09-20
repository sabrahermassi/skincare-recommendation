import { router } from "expo-router";

/**
 * Shared between the tab bar's scan button and the scanner screen, so the
 * scanner can open out of the button and close back into it.
 */
export const genie = {
  /** Centre of the scan button in window coordinates, measured when it is pressed. */
  origin: null as { x: number; y: number } | null,
  /** Set by whatever opens the scanner just before it does; read and cleared by the scanner. */
  opening: false,
};

/**
 * Opens the full-screen scanner from anywhere other than the scan button
 * itself (a "Scan a product" card or button), growing it out of the tab bar's
 * scan button all the same.
 */
export function openScanner() {
  genie.opening = true;
  router.navigate("/scanner");
}
