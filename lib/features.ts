import { useMemo } from "react";

import type { Ingredient } from "@/data/types";
import { safetyNoticeFor, safetyNoticeHits, type SafetyNoticeEntry, type SafetyNoticeHit } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * Feature flags (#403). One today: the regulatory-safety notice (#404, #405).
 *
 * Off by default, so with it off every screen is exactly what it was. It is a
 * persisted boolean in the store (`safetyNoticeEnabled`), switched by a
 * development-only row on Profile (next to "Fill with test data"): a release
 * build has no way to turn it on until the owner makes it the default.
 * Tests flip it with `useAppStore.setState({ safetyNoticeEnabled: true })`;
 * when nothing sets it, it is off, so a test that never mentions it is
 * hermetic.
 */

/** For render code: re-renders when the flag changes. */
export function useSafetyNoticeEnabled(): boolean {
  return useAppStore((state) => state.safetyNoticeEnabled);
}

/** For code outside a component (scoring helpers, share text): reads the flag now. */
export function safetyNoticeEnabled(): boolean {
  return useAppStore.getState().safetyNoticeEnabled;
}

/** The ingredients of a product the safety notice applies to: none with the flag off. */
export function useSafetyNoticeHits(ingredients: readonly Ingredient[]): SafetyNoticeHit[] {
  const enabled = useSafetyNoticeEnabled();
  return useMemo(() => safetyNoticeHits(ingredients, enabled), [ingredients, enabled]);
}

/** The notice for one ingredient: null with the flag off. */
export function useSafetyNoticeFor(ingredient: Ingredient): SafetyNoticeEntry | null {
  return safetyNoticeFor(ingredient, useSafetyNoticeEnabled());
}

/** The same outside a component (#405's share text): reads the flag now. */
export function safetyNoticeHitsNow(ingredients: readonly Ingredient[]): SafetyNoticeHit[] {
  return safetyNoticeHits(ingredients, safetyNoticeEnabled());
}
