import { create } from "zustand";

import type { Concern, SkinType } from "@/data/types";

export type SavedProduct = {
  /** Product id, or a raw barcode for something scanned but not in the catalog. */
  id: string;
  savedAt: number;
};

type AppState = {
  // ── Skin profile (captured in onboarding) ──
  skinType: SkinType | null;
  concerns: Concern[];

  /**
   * Whether onboarding has been shown, NOT whether a profile was filled in.
   * Skipping counts. Browsing without a profile is a supported state — the
   * list falls back to unpersonalised scores.
   */
  hasSeenOnboarding: boolean;

  // ── Saved / wishlisted ──
  savedProducts: SavedProduct[];

  // ── Compare tray: at most two products at a time ──
  compareIds: string[];

  setSkinType: (skinType: SkinType) => void;
  toggleConcern: (concern: Concern) => void;
  completeOnboarding: () => void;
  skipOnboarding: () => void;
  editProfile: () => void;

  /** Idempotent add. Use for scans, where re-scanning must not un-save. */
  saveProduct: (id: string) => void;
  /** Add/remove. Use for the wishlist control, where toggling is the intent. */
  toggleSaved: (id: string) => void;

  toggleCompare: (id: string) => void;
  clearCompare: () => void;
};

const MAX_COMPARE = 2;

export const useAppStore = create<AppState>((set) => ({
  skinType: null,
  concerns: [],
  hasSeenOnboarding: false,
  savedProducts: [],
  compareIds: [],

  setSkinType: (skinType) => set({ skinType }),

  toggleConcern: (concern) =>
    set((state) => ({
      concerns: state.concerns.includes(concern)
        ? state.concerns.filter((c) => c !== concern)
        : [...state.concerns, concern],
    })),

  completeOnboarding: () => set({ hasSeenOnboarding: true }),

  /** Dismiss onboarding without answering. Leaves the profile empty. */
  skipOnboarding: () => set({ hasSeenOnboarding: true }),

  /**
   * Re-enter onboarding to change the profile.
   *
   * Deliberately keeps skinType and concerns so the steps arrive pre-filled
   * with the previous answers, and deliberately keeps savedProducts and
   * compareIds — this is reached from a control labelled "Edit", which must
   * not destroy the wishlist.
   */
  editProfile: () => set({ hasSeenOnboarding: false }),

  saveProduct: (id) =>
    set((state) =>
      state.savedProducts.some((p) => p.id === id)
        ? state
        : { savedProducts: [...state.savedProducts, { id, savedAt: Date.now() }] }
    ),

  toggleSaved: (id) =>
    set((state) => ({
      savedProducts: state.savedProducts.some((p) => p.id === id)
        ? state.savedProducts.filter((p) => p.id !== id)
        : [...state.savedProducts, { id, savedAt: Date.now() }],
    })),

  /** Selecting a third product drops the oldest, so the tray always holds ≤ 2. */
  toggleCompare: (id) =>
    set((state) => {
      if (state.compareIds.includes(id)) {
        return { compareIds: state.compareIds.filter((c) => c !== id) };
      }
      return { compareIds: [...state.compareIds, id].slice(-MAX_COMPARE) };
    }),

  clearCompare: () => set({ compareIds: [] }),
}));
