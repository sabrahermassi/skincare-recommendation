/**
 * Suppresses the camera re-reading a barcode that was *just* dismissed.
 *
 * The camera never stops between reads: closing the found sheet or clearing
 * a miss panel puts the screen back to `idle`, and the same code is still
 * sitting in frame, so the very next camera frame reads it again — the sheet
 * or panel pops straight back up with another haptic, and for a miss,
 * `recordView` runs a second time. See issue #190.
 *
 * Deliberately narrow: this only ever suppresses the *camera* re-reading a
 * code inside the dismiss window. A deliberate re-ask of the same code (the
 * "Try again" button on the unreachable panel, or `BarcodeStage`'s
 * `onBarcode` prop) goes through `handleBarcode` directly and never calls
 * `shouldIgnoreScan` — see `onScanned` in `app/scanner.tsx` for where
 * the line is drawn.
 *
 * Time is injected rather than read from `Date.now()` internally, so the
 * decision stays a plain, testable function of its inputs — no live clock,
 * no test has to sleep.
 */

/**
 * Long enough to cover the dismiss-to-refire gap (closing a sheet and the
 * camera reading the very next frame), short enough that a deliberate
 * re-scan of the same bottle a moment later isn't mysteriously dead.
 */
export const DISMISS_WINDOW_MS = 2000;

export function createScanDismissGuard() {
  let dismissedCode: string | null = null;
  let dismissedAt = 0;

  return {
    /**
     * Whether the camera reading `code` right now should be ignored outright
     * — no lookup, no haptic, no `recordView`.
     *
     * A different code always clears the window immediately: there is no
     * reason to keep suppressing a code nobody is looking at any more, and
     * the next read of a *different* product should never wait one out.
     */
    shouldIgnoreScan(code: string, now: number): boolean {
      if (dismissedCode === null) return false;
      if (code !== dismissedCode) {
        dismissedCode = null;
        return false;
      }
      return now - dismissedAt < DISMISS_WINDOW_MS;
    },

    /** Call where a result is dismissed — the found sheet's close, or a miss/unreachable panel clearing. */
    noteDismissal(code: string, now: number): void {
      dismissedCode = code;
      dismissedAt = now;
    },

    /** Leaving the scanner: the next read of any code, including one just dismissed, is a fresh scan. */
    reset(): void {
      dismissedCode = null;
    },
  };
}
