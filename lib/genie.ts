/**
 * Shared between the tab bar's scan button and the scanner screen, so the
 * scanner can open out of the button and close back into it.
 */
export const genie = {
  /** Centre of the scan button in window coordinates, measured when it is pressed. */
  origin: null as { x: number; y: number } | null,
  /** Set by the scan button just before it opens the scanner; read and cleared by the scanner. */
  opening: false,
};
