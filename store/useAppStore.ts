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
  hasCompletedOnboarding: boolean;

  // ── Saved / wishlisted ──
  savedProducts: SavedProduct[];

  // ── Compare tray: at most two products at a time ──
  compareIds: string[];

  setSkinType: (skinType: SkinType) => void;
  toggleConcern: (concern: Concern) => void;
  completeOnboarding: () => void;

  toggleSaved: (id: string) => void;
  isSaved: (id: string) => boolean;

  toggleCompare: (id: string) => void;
  clearCompare: () => void;

  resetProfile: () => void;
};

const MAX_COMPARE = 2;

const initialState = {
  skinType: null,
  concerns: [],
  hasCompletedOnboarding: false,
  savedProducts: [],
  compareIds: [],
} satisfies Partial<AppState>;

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  setSkinType: (skinType) => set({ skinType }),

  toggleConcern: (concern) =>
    set((state) => ({
      concerns: state.concerns.includes(concern)
        ? state.concerns.filter((c) => c !== concern)
        : [...state.concerns, concern],
    })),

  completeOnboarding: () => set({ hasCompletedOnboarding: true }),

  toggleSaved: (id) =>
    set((state) => ({
      savedProducts: state.savedProducts.some((p) => p.id === id)
        ? state.savedProducts.filter((p) => p.id !== id)
        : [...state.savedProducts, { id, savedAt: Date.now() }],
    })),

  isSaved: (id) => get().savedProducts.some((p) => p.id === id),

  /** Selecting a third product drops the oldest, so the tray always holds ≤ 2. */
  toggleCompare: (id) =>
    set((state) => {
      if (state.compareIds.includes(id)) {
        return { compareIds: state.compareIds.filter((c) => c !== id) };
      }
      return {
        compareIds: [...state.compareIds, id].slice(-MAX_COMPARE),
      };
    }),

  clearCompare: () => set({ compareIds: [] }),

  resetProfile: () => set(initialState),
}));
