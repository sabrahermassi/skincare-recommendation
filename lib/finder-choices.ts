import { create } from "zustand";

import type { SkinProfile } from "@/data/types";
import { EMPTY_PROFILE } from "@/store/useAppStore";

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
