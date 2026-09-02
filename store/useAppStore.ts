import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Concern, SkinProfile } from "@/data/types";

export type SavedProduct = {
  /** Product id, or a raw barcode for something scanned but not in the catalog. */
  id: string;
  savedAt: number;
};

/**
 * One line in the automatic "what have I already checked?" log.
 *
 * The verdict fields are a SNAPSHOT taken when the product was last opened,
 * and are never recomputed. Saved products are re-scored live against the
 * current profile, because a shelf should reflect what you think today; a log
 * that silently rewrites its own past entries is worse than no log.
 */
export type HistoryEntry = {
  /** Product id, or a raw barcode for something scanned that isn't in the catalog. */
  id: string;
  /** False when `id` is an unrecognised barcode rather than a catalog product. */
  known: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  seenCount: number;
  /** Match score as it stood at `lastSeenAt`. `null` for an unpersonalised profile. */
  scoreAtView: number | null;
  /** Contraindication count as it stood at `lastSeenAt`. */
  warningsAtView: number;
};

const MAX_CONCERNS = 3;
const MAX_COMPARE = 2;

/** Oldest entries fall off the end. Long enough to cover months of casual use. */
export const HISTORY_LIMIT = 50;

export const EMPTY_PROFILE: SkinProfile = {
  gender: null,
  ageGroup: null,
  area: null,
  concerns: [],
  baseSkinType: null,
  skinTypeSource: null,
  sensitive: false,
};

type AppState = {
  // ── Skin profile (captured in the onboarding quiz) ──
  profile: SkinProfile;

  /**
   * Whether onboarding has been shown, NOT whether a profile was filled in.
   * Skipping counts. Browsing without a profile is a supported state — the
   * list falls back to unpersonalised, unsorted results.
   */
  hasSeenOnboarding: boolean;

  // ── Saved shelf: explicit, user-curated ──
  savedProducts: SavedProduct[];

  // ── History: automatic, written on every product view and scan ──
  history: HistoryEntry[];

  // ── Compare tray: at most two products at a time ──
  compareIds: string[];

  /** Shallow-merges into the profile. Used by every quiz step and by /profile. */
  setProfile: (patch: Partial<SkinProfile>) => void;
  /** Enforces the cap of `MAX_CONCERNS`. */
  toggleConcern: (concern: Concern) => void;

  completeOnboarding: () => void;
  skipOnboarding: () => void;

  /** Idempotent add. Use where re-triggering must not un-save. */
  saveProduct: (id: string) => void;
  /** Add/remove. Use for the wishlist control, where toggling is the intent. */
  toggleSaved: (id: string) => void;

  /** Upserts a history entry, moving it to the front. Never touches the shelf. */
  recordView: (view: {
    id: string;
    known: boolean;
    score: number | null;
    warnings: number;
  }) => void;
  clearHistory: () => void;

  toggleCompare: (id: string) => void;
  clearCompare: () => void;

  /**
   * Back to a first-run state: empty profile, closed onboarding gate, empty
   * shelf and log. Needed because persistence works — once onboarding is
   * completed it stays completed, and without this there is no way back to it
   * short of deleting the app.
   */
  resetApp: () => void;
};

/**
 * What survives an app restart. `compareIds` is deliberately absent: the
 * compare tray is an in-session selection, and restoring "2 selected" from
 * three weeks ago would put a floating bar over the browse list for no reason.
 */
export const PERSISTED_KEYS = [
  "profile",
  "hasSeenOnboarding",
  "savedProducts",
  "history",
] as const;

export type PersistedState = Pick<AppState, (typeof PERSISTED_KEYS)[number]>;

/** Exported so a test can pin the key set rather than trusting a comment. */
export function partializeState(state: AppState): PersistedState {
  return {
    profile: state.profile,
    hasSeenOnboarding: state.hasSeenOnboarding,
    savedProducts: state.savedProducts,
    history: state.history,
  };
}

/** First-run values. Exported so `resetApp` and the tests share one source. */
export const INITIAL_STATE = {
  profile: EMPTY_PROFILE,
  hasSeenOnboarding: false,
  savedProducts: [] as SavedProduct[],
  history: [] as HistoryEntry[],
  compareIds: [] as string[],
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setProfile: (patch) =>
        set((state) => ({ profile: { ...state.profile, ...patch } })),

      toggleConcern: (concern) =>
        set((state) => {
          const { concerns } = state.profile;
          if (concerns.includes(concern)) {
            return {
              profile: { ...state.profile, concerns: concerns.filter((c) => c !== concern) },
            };
          }
          if (concerns.length >= MAX_CONCERNS) return state;
          return { profile: { ...state.profile, concerns: [...concerns, concern] } };
        }),

      completeOnboarding: () => set({ hasSeenOnboarding: true }),

      /** Dismiss onboarding without answering. Leaves the profile empty. */
      skipOnboarding: () => set({ hasSeenOnboarding: true }),

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

      recordView: ({ id, known, score, warnings }) =>
        set((state) => {
          const now = Date.now();
          const previous = state.history.find((h) => h.id === id);
          const entry: HistoryEntry = {
            id,
            known,
            firstSeenAt: previous?.firstSeenAt ?? now,
            lastSeenAt: now,
            seenCount: (previous?.seenCount ?? 0) + 1,
            scoreAtView: score,
            warningsAtView: warnings,
          };
          return {
            history: [entry, ...state.history.filter((h) => h.id !== id)].slice(
              0,
              HISTORY_LIMIT
            ),
          };
        }),

      clearHistory: () => set({ history: [] }),

      /** Selecting a third product drops the oldest, so the tray always holds <= 2. */
      toggleCompare: (id) =>
        set((state) => {
          if (state.compareIds.includes(id)) {
            return { compareIds: state.compareIds.filter((c) => c !== id) };
          }
          return { compareIds: [...state.compareIds, id].slice(-MAX_COMPARE) };
        }),

      clearCompare: () => set({ compareIds: [] }),

      resetApp: () => {
        set({ ...INITIAL_STATE });
        // Also wipe what is on disk. Without this the in-memory reset is
        // undone by the next rehydration and the app "forgets" the reset.
        void useAppStore.persist.clearStorage();
      },
    }),
    {
      name: "skintel-store",
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: partializeState,
      /*
        v1 profiles predate `skinTypeSource`. Without this they rehydrate with
        the field `undefined` while the type says otherwise, and the profile
        screen would read that as "no answer" and drop a skin type the user
        had actually given. Anything already stored was picked by hand, so it
        is `declared`.
      */
      migrate: (persisted, version) => {
        const state = persisted as PersistedState | undefined;
        if (!state) return state;
        if (version < 2) {
          return {
            ...state,
            profile: {
              ...state.profile,
              skinTypeSource: state.profile.baseSkinType ? "declared" : null,
            },
          } satisfies PersistedState;
        }
        return state;
      },
    }
  )
);
