import { create } from "zustand";

import type { SkinProfile } from "@/data/types";
import { isPersonalized } from "@/lib/profile";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The skincare finder's own answers, kept apart from the skin profile (owner):
 * choosing here ranks the finder's results and nothing else, and the skin
 * profile (the quiz, the routine, every other score) never changes it either.
 * Held for the session, like a search, not saved to the phone.
 */
export const useFinderChoices = create<{ choices: SkinProfile; setChoices: (choices: SkinProfile) => void }>((set) => ({
  choices: EMPTY_PROFILE,
  setChoices: (choices) => set({ choices }),
}));

/** The `from` a product or ingredient page is opened with from the finder's results. */
export const FROM_FINDER = "finder";

/**
 * The answers a page scores with. Opened from the finder's results, the
 * finder's own answers, so the product shows the number its row showed and
 * speaks only to what was chosen there (owner: "If it's 55 outside and I tap
 * it, I should see 55"). Opened from anywhere else, the skin profile.
 */
export function useScoringProfile(from: string | undefined): SkinProfile {
  const own = useAppStore((s) => s.profile);
  const finder = useFinderChoices((s) => s.choices);
  // Only answers that score: with neither a concern nor a skin type the row
  // showed no number, and the page's "Find my match" opens the skin quiz,
  // which could never change a page held to the finder's answers.
  return from === FROM_FINDER && isPersonalized(finder) ? withOwnPregnancy(finder, own) : own;
}

/**
 * The finder's answers, keeping the person's own pregnancy answer where the
 * finder left that question unanswered: a pregnancy caution is a safety note
 * for the person holding the phone, and it never changes a score, so the
 * number still matches the row tapped.
 */
function withOwnPregnancy(finder: SkinProfile, own: SkinProfile): SkinProfile {
  return finder.pregnancyStatus === null && own.pregnancyStatus !== null ? { ...finder, pregnancyStatus: own.pregnancyStatus } : finder;
}
