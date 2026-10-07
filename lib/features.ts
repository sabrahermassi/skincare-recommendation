import { useMemo } from "react";

import type { Ingredient } from "@/data/types";
import { safetyNoticeHits, type SafetyNoticeHit } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * Feature flags (#403). Two today: the regulatory-safety notice (#404, #405)
 * and Skin needs (#467, at the foot of this file).
 *
 * Off by default, so with it off every screen is exactly what it was. It is a
 * persisted boolean in the store (`safetyNoticeEnabled`), switched by a
 * development-only row on Profile (next to "Fill with test data"): a release
 * build has no way to turn it on until the owner makes it the default. A
 * release build also ignores a saved "On" (a phone that had it on in a
 * development build keeps the value on disk), so the flag reads as
 * `__DEV__ && saved`. Remove the `__DEV__` guard when it becomes the default.
 * Tests flip it with `useAppStore.setState({ safetyNoticeEnabled: true })`;
 * when nothing sets it, it is off, so a test that never mentions it is
 * hermetic.
 */

/** For render code: re-renders when the flag changes. */
export function useSafetyNoticeEnabled(): boolean {
  return useAppStore((state) => __DEV__ && state.safetyNoticeEnabled);
}

/** For code outside a component (scoring helpers, share text): reads the flag now. */
export function safetyNoticeEnabled(): boolean {
  return __DEV__ && useAppStore.getState().safetyNoticeEnabled;
}

/** The ingredients of a product the safety notice applies to: none with the flag off. */
export function useSafetyNoticeHits(ingredients: readonly Ingredient[]): SafetyNoticeHit[] {
  const enabled = useSafetyNoticeEnabled();
  return useMemo(() => safetyNoticeHits(ingredients, enabled), [ingredients, enabled]);
}

/** The same outside a component (#405's share text): reads the flag now. */
export function safetyNoticeHitsNow(ingredients: readonly Ingredient[]): SafetyNoticeHit[] {
  return safetyNoticeHits(ingredients, safetyNoticeEnabled());
}

/**
 * Skin needs (#467): hidden until an expert has checked its advice. The copy
 * in `lib/skin-needs-data.ts` is placeholder, and it used to tell pregnant
 * people which actives were "safe". Same shape as the flag above: a persisted
 * boolean (`skinNeedsEnabled`), a development-only Profile row, and
 * `__DEV__ && saved`, so a release build has no Skin needs at all. Home drops
 * its tile and both routes send anyone who reaches them back to Home.
 */
export function useSkinNeedsEnabled(): boolean {
  return useAppStore((state) => __DEV__ && state.skinNeedsEnabled);
}

/**
 * Whether a link's `from` says it came from Skin needs, which counts only
 * while Skin needs is shown: a result opened by an old or hand-written
 * `?from=journey&need=…` link is then an ordinary result, read against the
 * skin profile (Codex review on #479).
 */
export function useFromSkinNeeds(from: string | undefined): boolean {
  return useSkinNeedsEnabled() && from === "journey";
}
