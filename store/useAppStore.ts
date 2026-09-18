import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { forgetScannedBarcodes } from "@/data/catalogue-cache";
import { resetScoreCache } from "@/lib/matching";

import type { Concern, SkinProfile } from "@/data/types";

export type SavedProduct = {
  /** Product id, or a raw barcode for something scanned but not in the catalog. */
  id: string;
  savedAt: number;
  /**
   * The product's own `fetchedAt` at the moment it was saved — which formula
   * version was actually on screen, not just when the tap happened. Step 8's
   * "this formula changed since you saved it" notice needs this, not
   * `savedAt`: a device can save an old, disk-cached formula and only
   * install the reconciled one afterward, so `savedAt` can land *after* a
   * change the user never actually saw. Found by Codex on PR #122. Optional
   * because a row saved before this field existed has none — the notice
   * falls back to comparing against `savedAt` for those.
   */
  formulaFetchedAt?: string;
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

// "Eczema-prone" was dropped from the quiz's own concerns screen — it isn't
// offered as an option there any more, though `atopic`'s scoring rules stay
// intact for any profile that already carries it from before that change.
// toggleConcern's cap has to know about that: without this, a profile
// holding `["atopic", ...2 visible picks]` reads as already at MAX_CONCERNS,
// and a user who can see only 2 chosen concerns gets silently refused a 3rd
// they can actually see and tap. Concerns.tsx's own OPTIONS list is the
// other half of this — it excludes atopic from what a user can toggle at
// all, so the two lists agree on what "visible" means without importing
// from each other across the store/screen boundary.
const CAP_EXCLUDED_CONCERNS = new Set<Concern>(["atopic"]);

function visibleConcernCount(concerns: Concern[]): number {
  return concerns.filter((c) => !CAP_EXCLUDED_CONCERNS.has(c)).length;
}

/** Oldest entries fall off the end. Long enough to cover months of casual use. */
export const HISTORY_LIMIT = 50;

export const EMPTY_PROFILE: SkinProfile = {
  concerns: [],
  baseSkinType: null,
  sensitivity: null,
  pregnancyStatus: null,
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

  /**
   * Set only by actually finishing the quiz's 4th question — not by
   * skipping, which has nothing to acknowledge. Deliberately session-only:
   * it names the one scanner visit right after the quiz, not a persisted
   * fact about the account, so it is intentionally absent from
   * `PERSISTED_KEYS`/`partializeState` below and needs no migration. See
   * issue #95.
   */
  justFinishedQuiz: boolean;

  // ── Saved shelf: explicit, user-curated ──
  savedProducts: SavedProduct[];

  /** Ingredient names starred from the ingredient-detail screen. */
  savedIngredients: string[];

  // ── History: automatic, written on every product view and scan ──
  history: HistoryEntry[];

  /** Shallow-merges into the profile. Used by every quiz step and by /profile. */
  setProfile: (patch: Partial<SkinProfile>) => void;
  /** Enforces the cap of `MAX_CONCERNS`. */
  toggleConcern: (concern: Concern) => void;

  completeOnboarding: () => void;

  /** Called only from the quiz's real finish, alongside `completeOnboarding` —
   *  see `justFinishedQuiz`. */
  markQuizJustFinished: () => void;
  /** Clears `justFinishedQuiz` — the scanner's acknowledgement banner calls
   *  this on dismiss, and also the moment a scan actually starts, so it
   *  cannot linger unread indefinitely. */
  dismissQuizAcknowledgement: () => void;

  /** Idempotent add. Use where re-triggering must not un-save. */
  saveProduct: (id: string, formulaFetchedAt?: string) => void;
  /** Add/remove. Use for the wishlist control, where toggling is the intent. */
  toggleSaved: (id: string, formulaFetchedAt?: string) => void;
  /**
   * Puts back a saved-shelf row exactly as it was — same `savedAt`, not a
   * fresh one — for the Saved screen's remove-then-undo affordance.
   * `toggleSaved` would re-add with today's timestamp and jump the row to
   * the top of the newest-first sort; this restores its original position.
   * A no-op if the id is already present, so a stale/duplicate Undo tap
   * can't create a second row.
   */
  restoreSavedProduct: (product: SavedProduct) => void;

  /** Add/remove an ingredient name from the starred list. */
  toggleSavedIngredient: (name: string) => void;

  /** Upserts a history entry, moving it to the front. Never touches the shelf. */
  recordView: (view: {
    id: string;
    known: boolean;
    score: number | null;
    warnings: number;
  }) => void;
  /**
   * Fills in the score on an entry that was logged without one.
   *
   * `recordView` captures the score as it stood when the screen opened, which
   * for someone with no profile is no score at all. The inline prompt on the
   * result screen then collects the two answers that produce one, and the log
   * would otherwise keep the blank forever.
   *
   * Deliberately only fills a blank, never corrects a number. The log is a
   * record of what the user was told at the time, and rewriting a score
   * because the profile changed later would make it a record of nothing —
   * see the "does not rewrite a recorded score" test, which this must not
   * break. An entry that never had a score has no such history to protect.
   *
   * Leaves `seenCount`, both timestamps and the list order alone: this is the
   * same visit, better informed.
   */
  fillInViewScore: (id: string, view: { score: number | null; warnings: number }) => void;
  clearHistory: () => void;
  /** Removes one entry from the log — the per-row "x" on the History tab,
   *  as opposed to `clearHistory`'s wipe-everything action. */
  removeHistoryEntry: (id: string) => void;
  /**
   * Puts back a removed history entry for the same remove-then-undo
   * affordance `restoreSavedProduct` gives the shelf. Re-sorted by
   * `lastSeenAt` rather than reinserted at a remembered index — the log is
   * always kept newest-first, so sorting is what actually restores its
   * original position rather than assuming nothing else changed in
   * between. A no-op if the id is already present.
   */
  restoreHistoryEntry: (entry: HistoryEntry) => void;

  /**
   * Back to a first-run state: empty profile, closed onboarding gate, empty
   * shelf and log, and the barcodes looked up this session forgotten. Needed
   * because persistence works — once onboarding is completed it stays
   * completed, and without this there is no way back to it short of deleting
   * the app.
   */
  resetApp: () => void;
};

/**
 * What survives an app restart.
 */
export const PERSISTED_KEYS = [
  "profile",
  "hasSeenOnboarding",
  "savedProducts",
  "savedIngredients",
  "history",
] as const;

export type PersistedState = Pick<AppState, (typeof PERSISTED_KEYS)[number]>;

/** Exported so a test can pin the key set rather than trusting a comment. */
export function partializeState(state: AppState): PersistedState {
  return {
    profile: state.profile,
    hasSeenOnboarding: state.hasSeenOnboarding,
    savedProducts: state.savedProducts,
    savedIngredients: state.savedIngredients,
    history: state.history,
  };
}

/** First-run values. Exported so `resetApp` and the tests share one source. */
export const INITIAL_STATE = {
  profile: EMPTY_PROFILE,
  hasSeenOnboarding: false,
  justFinishedQuiz: false,
  savedProducts: [] as SavedProduct[],
  savedIngredients: [] as string[],
  history: [] as HistoryEntry[],
};

/**
 * Storage schema upgrades. Exported so the riskiest thing in this file is
 * testable: a migration that quietly drops a key resets a real person's
 * profile, and they find out by watching every score change.
 *
 * v2 carried `skinTypeSource`, which existed only to tell a hand-picked skin
 * type apart from one the two-question diagnostic worked out. That screen is
 * gone, so the field is dropped rather than left to rot in storage — a stored
 * key with no reader is a trap for the next person to read the type.
 *
 * v3 -> v4 drops `gender` and `ageGroup`, which the app collected and never
 * read, and widens the `sensitive` boolean into the three-level
 * `sensitivity`. An existing `true` becomes "some", not "high": the old
 * toggle asked "is your skin also sensitive", which is the middle answer, and
 * promoting everyone to the harshest setting would silently re-judge every
 * saved product against a stricter rule than they agreed to. An existing
 * `false` becomes "none" rather than null — they saw the toggle and left it
 * off, which is an answer.
 *
 * v4 -> v5 adds `pregnancyStatus`, the quiz's new 4th question. An existing
 * profile has no opinion either way, so it becomes `null` (unanswered) —
 * the same convention `sensitivity: null` already uses, not a guess like
 * "neither".
 *
 * v5 -> v6 drops `area` (face/body) from the client. It never fed scoring —
 * `matchProduct` has never read it — and the one place it did anything was
 * narrowing the browse list's type-filter chips, which now shows every
 * product type regardless of area: the whole point of the app is judging a
 * formula against a skin profile, and a body lotion is not disqualified from
 * that by being a body lotion. An existing profile simply loses the field;
 * there is nothing to migrate it to.
 *
 * This is a client-side, `SkinProfile`-only removal — it says nothing about
 * `products.area` in the catalogue database. That column is a separate
 * `NOT NULL CHECK`-constrained field on a different table
 * (`supabase/migrations/0001_catalogue.sql`), still written by both the
 * product-lookup and label-ocr Edge Functions on every insert (currently a
 * hardcoded `"face"`, since nothing upstream of either function still
 * determines a real area either). Dropping that column is a separate,
 * not-yet-made decision — it wasn't touched here.
 *
 * v6 -> v7 drops `productSuggestions`, a top-level key rather than a
 * `profile` field — see issue #97. Zustand only calls this function when the
 * stored version differs from the current one; without the bump, an install
 * already sitting at v6 would never run a migration at all; and even with
 * one, the array has to be stripped explicitly here. `partialize` no longer
 * writing it stops the *next* save from including it, but `persist`'s
 * default rehydration is a shallow merge of whatever's on disk over
 * `INITIAL_STATE` — an old blob's `productSuggestions` would otherwise ride
 * along in the runtime store, unreachable through the `AppState` type but
 * still sitting there, until some unrelated write happened to overwrite the
 * whole persisted blob. Found in review on #124.
 */
export function migratePersisted(persisted: unknown, version: number): PersistedState | undefined {
  const state = persisted as (PersistedState & {
    profile?: Partial<SkinProfile> & {
      skinTypeSource?: unknown;
      gender?: unknown;
      ageGroup?: unknown;
      sensitive?: boolean;
      area?: unknown;
    };
    /** Removed in v7 — see the migration note above. Typed loosely and
     *  stripped unconditionally below; a install already past v7 simply
     *  doesn't have the key, and destructuring an absent key is a no-op. */
    productSuggestions?: unknown;
  }) | undefined;

  if (!state) return state;

  // Stripped before either branch below, so neither can hand a legacy
  // install's array back out through a `...state`/`...withoutSuggestions`
  // spread — see the migration note above.
  const { productSuggestions: _droppedSuggestions, ...withoutSuggestions } = state;

  // A missing profile shouldn't happen, but returning the state as-is here
  // would hand back an object without the `profile` key the PersistedState
  // contract requires — fall back to the same empty profile a first run
  // gets, rather than trust a merge elsewhere to paper over it.
  if (!state.profile) return { ...withoutSuggestions, profile: EMPTY_PROFILE };

  if (version >= 6) return withoutSuggestions as PersistedState;

  const {
    skinTypeSource: _droppedSource,
    gender: _droppedGender,
    ageGroup: _droppedAge,
    area: _droppedArea,
    sensitive,
    ...rest
  } = state.profile;

  return {
    ...withoutSuggestions,
    profile: {
      ...EMPTY_PROFILE,
      ...rest,
      sensitivity: rest.sensitivity ?? (sensitive === undefined ? null : sensitive ? "some" : "none"),
    },
  };
}

const OLD_STORAGE_KEY = "skintel-store";
const NEW_STORAGE_KEY = "forme-store";

/**
 * A rebrand renamed the persisted key from `skintel-store` to `forme-store`.
 * AsyncStorage has no notion of "the same store under a new name" — without
 * this, `persist` would just find nothing under the new key and every
 * existing install's profile, saved shelf and history would reset to
 * `INITIAL_STATE`, the same class of silent data loss `migratePersisted`
 * above exists to prevent. This runs the one-time copy on first read, then
 * gets out of the way; `migratePersisted` still runs on whatever comes back,
 * new install or migrated one alike.
 */
export const formeStorage: StateStorage = {
  getItem: async (name) => {
    const [current, legacy] = await Promise.all([
      AsyncStorage.getItem(name),
      AsyncStorage.getItem(OLD_STORAGE_KEY),
    ]);
    if (current === null && legacy !== null) {
      await AsyncStorage.setItem(name, legacy);
      await AsyncStorage.removeItem(OLD_STORAGE_KEY);
      return legacy;
    }
    return current;
  },
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
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
          if (visibleConcernCount(concerns) >= MAX_CONCERNS) return state;
          return { profile: { ...state.profile, concerns: [...concerns, concern] } };
        }),

      completeOnboarding: () => set({ hasSeenOnboarding: true }),

      markQuizJustFinished: () => set({ justFinishedQuiz: true }),
      dismissQuizAcknowledgement: () => set({ justFinishedQuiz: false }),

      saveProduct: (id, formulaFetchedAt) =>
        set((state) =>
          state.savedProducts.some((p) => p.id === id)
            ? state
            : { savedProducts: [...state.savedProducts, { id, savedAt: Date.now(), formulaFetchedAt }] }
        ),

      toggleSaved: (id, formulaFetchedAt) =>
        set((state) => ({
          savedProducts: state.savedProducts.some((p) => p.id === id)
            ? state.savedProducts.filter((p) => p.id !== id)
            : [...state.savedProducts, { id, savedAt: Date.now(), formulaFetchedAt }],
        })),

      restoreSavedProduct: (product) =>
        set((state) =>
          state.savedProducts.some((p) => p.id === product.id)
            ? state
            : { savedProducts: [...state.savedProducts, product] }
        ),

      toggleSavedIngredient: (name) =>
        set((state) => ({
          savedIngredients: state.savedIngredients.includes(name)
            ? state.savedIngredients.filter((n) => n !== name)
            : [...state.savedIngredients, name],
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

      fillInViewScore: (id, { score, warnings }) =>
        set((state) => {
          const previous = state.history.find((h) => h.id === id);
          // Nothing logged, already scored, or still nothing to record.
          // Returning an empty patch rather than a rebuilt array keeps every
          // history selector on its existing reference, so the common case —
          // this runs on every open, right after `recordView` — costs no
          // re-render.
          if (!previous || previous.scoreAtView !== null || score === null) return {};

          return {
            history: state.history.map((h) =>
              h.id === id ? { ...h, scoreAtView: score, warningsAtView: warnings } : h,
            ),
          };
        }),

      clearHistory: () => set({ history: [] }),
      removeHistoryEntry: (id) =>
        set((state) => ({ history: state.history.filter((h) => h.id !== id) })),
      restoreHistoryEntry: (entry) =>
        set((state) =>
          state.history.some((h) => h.id === entry.id)
            ? state
            : {
                history: [...state.history, entry]
                  .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
                  .slice(0, HISTORY_LIMIT),
              }
        ),

      resetApp: () => {
        set({ ...INITIAL_STATE });
        // Also wipe what is on disk. Without this the in-memory reset is
        // undone by the next rehydration and the app "forgets" the reset.
        void useAppStore.persist.clearStorage();
        // Barcodes looked up this session live outside the store, in the
        // catalogue cache's memory layer. They are a record of what this
        // person pointed a camera at, so they belong to this reset even though
        // they never reach the disk. It lives here rather than in the screen
        // that offers the button so that "erase everything" cannot drift out
        // of sync with a second caller later. The cached *catalogue* is
        // deliberately left alone — it is public and identical on every
        // install; see `forgetScannedBarcodes` for why the two differ.
        forgetScannedBarcodes();
        // Same reasoning, one layer further out. The score cache holds a
        // `{ profile, result }` beside every product it has scored, so it is
        // carrying a copy of the concerns, sensitivity and pregnancy status
        // this reset is supposed to erase — plus every verdict derived from
        // them. It is keyed weakly, but the catalogue holds those products for
        // the life of the session, so nothing would collect it on its own.
        // Replacing the profile is not enough: the *old* profile object is
        // what the cache kept.
        resetScoreCache();
      },
    }),
    {
      name: NEW_STORAGE_KEY,
      version: 7,
      storage: createJSONStorage(() => formeStorage),
      partialize: partializeState,
      migrate: migratePersisted,
    }
  )
);
