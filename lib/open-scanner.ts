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
export function openScanner(context?: ScanContext) {
  // Wired straight to `onPress`, this receives the tap event: that is not a
  // context, and must not become route params.
  openScannerAt(Date.now(), context && !("nativeEvent" in context) ? context : undefined);
}

/**
 * Where a scan started, carried through the scanner to the product result as
 * route params, so the result can answer that question (v9): from the
 * Skin needs journey (`from: "journey"`, with what was picked there as
 * `need`), or for one routine step. Opened any other way, the scanner gets
 * none, so no earlier context leaks into an unrelated scan.
 */
export type ScanContext = { mode?: "photo"; from?: "journey"; need?: string; step?: string };

/** The scanner route in Photo mode, for `router.dismissTo` as well as a push. */
export function photoScannerHref() {
  return { pathname: "/scanner", params: { mode: "photo" } } as const;
}

/** `openScanner` with the clock passed in — exported for the test. */
export function openScannerAt(now: number, context?: ScanContext) {
  if (now - lastOpenedAt < REPEAT_GUARD_MS) return;
  lastOpenedAt = now;
  if (context) router.push({ pathname: "/scanner", params: context });
  else router.push("/scanner");
}
