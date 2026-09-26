import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { forgetScannedBarcodes } from "@/data/catalogue-cache";
import { resetScoreCache } from "@/lib/matching";
import type { RoutineStep } from "@/lib/routine-step";
import { connectClaimFlag, readSecureProfile, removeSecureProfile, writeSecureProfile } from "@/lib/secure-storage";
import { applyOps, shelfAsSaves, type Shelf, type ShelfOp } from "@/lib/shelf";

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
  /**
   * The person's own routine step (#227), overriding the guess from the
   * product's type (`lib/routine-step.ts`). Absent means "use the guess",
   * so a later correction to the type still moves an untouched product.
   */
  routineStep?: RoutineStep;
  /** The person's journal note (#228) — their own words, trimmed; absent means none. */
  note?: string;
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

export const MAX_CONCERNS = 3;

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

export function visibleConcernCount(concerns: Concern[]): number {
  return concerns.filter((c) => !CAP_EXCLUDED_CONCERNS.has(c)).length;
}

/** Oldest entries fall off the end. Long enough to cover months of casual use. */
export const HISTORY_LIMIT = 50;

/**
 * An entry last seen longer ago than this is dropped (#189): the log is
 * health-adjacent (a run of acne products implies acne-prone skin), so it is
 * kept for as long as it is useful and no longer. Checked when the app starts
 * and whenever the log is written.
 */
export const HISTORY_MAX_AGE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The log as it may be kept: nothing older than `HISTORY_MAX_AGE_DAYS`, at most `HISTORY_LIMIT` entries. */
export function keptHistory(history: HistoryEntry[], now: number): HistoryEntry[] {
  const cutoff = now - HISTORY_MAX_AGE_DAYS * DAY_MS;
  return history.filter((h) => h.lastSeenAt >= cutoff).slice(0, HISTORY_LIMIT);
}

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

  /**
   * Whether this install has already cleared whatever an earlier install left
   * in the Keychain — see `claimOnce` in lib/secure-storage.ts. A plain flag,
   * never the session itself: tokens go to secure storage, not here.
   */
  secureStoreClaimed: boolean;
  claimSecureStore: () => void;

  // ── The signed-in shelf (#222, #223) — see lib/shelf.ts for the rules ──

  /**
   * The account the cached shelf belongs to, or null when it belongs to no
   * one: a guest's shelf, saved signed out (#300). While it is set, every
   * change to the shelf is also queued for the server.
   */
  shelfOwner: string | null;
  /** Shelf changes not yet on the server, oldest first. */
  shelfQueue: ShelfOp[];
  /**
   * Changes that had not reached the server when the session ended — offline
   * at sign-out, or a session that ended on its own (#274 review). Set aside
   * for that one account, never shown and never carried into any other: the
   * next time the same account signs in here they are pushed, and if a
   * different account signs in they are dropped.
   */
  parkedShelf: { owner: string; queue: ShelfOp[] } | null;
  /**
   * Accounts that have had their "first page of your journal" moment on this
   * phone (#230). A fast path only: the account's own `user_metadata` is the
   * record, and this covers the gap until that write lands — a second render,
   * or a save made with no signal. See lib/first-page.ts.
   */
  journalStarted: string[];
  markJournalStarted: (account: string) => void;
  /**
   * Makes the cached shelf an account's. A guest's shelf is queued as saves
   * into it, at every sign-in (#300): sign-out empties the shelf, so whatever
   * is on it with no owner was saved signed out. Another account's cache is
   * never carried; the shelf starts empty and fills from the server.
   */
  adoptShelf: (owner: string) => void;
  /**
   * The server's shelf has been read. Replaces the cache with it, drops the
   * queued changes that were just pushed, and lays the ones queued since on
   * top. Ignored if the shelf changed hands in the meantime.
   */
  applyServerShelf: (owner: string, pushed: readonly ShelfOp[], server: Shelf) => void;
  /**
   * Sign-out (#222): the cached shelf is cleared. It is the account's and
   * leaves with it; one left behind would be carried into whichever account
   * signs in next. The person starts a fresh guest shelf (#300). Changes still
   * queued are parked for this account rather than lost (`parkedShelf`). The
   * profile and history stay.
   */
  leaveShelf: () => void;
  /**
   * The account was deleted (#224): the cached shelf, its queue and anything
   * parked for it are dropped outright — there is no account left to push
   * them to. The profile and history stay; they were never the account's.
   */
  discardShelf: () => void;

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

  /** Puts a saved product in a routine step, or back to the guess (`null`) — #227. */
  setRoutineStep: (id: string, step: RoutineStep | null) => void;
  /**
   * Writes, edits or (`null`) deletes a saved product's journal note — #228.
   * Applied here at once and queued, so a note written with no signal is
   * kept until it syncs.
   */
  setNote: (id: string, note: string | null) => void;

  /** Add/remove an ingredient name from the starred list. */
  toggleSavedIngredient: (name: string) => void;
  /** Idempotent add, like `saveProduct`. */
  saveIngredient: (name: string) => void;
  /** Empties the Saved tab's shelf — the wipe-everything action, as opposed to
   *  `toggleSaved`'s per-row "x". Leaves history and starred ingredients alone. */
  clearSavedProducts: () => void;
  /** Same, for the Ingredients tab. */
  clearSavedIngredients: () => void;

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
  /** Drops entries past `HISTORY_MAX_AGE_DAYS` — run when the app starts. Writes nothing if none are. */
  expireHistory: () => void;
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
  "secureStoreClaimed",
  "shelfOwner",
  "shelfQueue",
  "parkedShelf",
  "journalStarted",
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
    secureStoreClaimed: state.secureStoreClaimed,
    shelfOwner: state.shelfOwner,
    shelfQueue: state.shelfQueue,
    parkedShelf: state.parkedShelf,
    journalStarted: state.journalStarted,
  };
}

/** First-run values. Exported so `resetApp` and the tests share one source. */
const INITIAL_STATE = {
  profile: EMPTY_PROFILE,
  hasSeenOnboarding: false,
  justFinishedQuiz: false,
  savedProducts: [] as SavedProduct[],
  savedIngredients: [] as string[],
  history: [] as HistoryEntry[],
  secureStoreClaimed: false,
  shelfOwner: null as string | null,
  shelfQueue: [] as ShelfOp[],
  parkedShelf: null as { owner: string; queue: ShelfOp[] } | null,
  journalStarted: [] as string[],
};

/** The queue with `ops` added — only while the shelf belongs to an account. */
function queued(state: { shelfOwner: string | null; shelfQueue: ShelfOp[] }, ...ops: ShelfOp[]) {
  return state.shelfOwner && ops.length > 0 ? { shelfQueue: [...state.shelfQueue, ...ops] } : {};
}

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
 *
 * v7 -> v8 drops `legacyShelfMigrated` (#300). It marked the one sign-in on a
 * phone that carried the pre-accounts shelf into an account; now a guest's
 * shelf is carried at every sign-in, so there is nothing to mark. A phone
 * where it was set and no account owns the shelf has signed in before and
 * since signed out, and sign-out empties the shelf, so anything still on it
 * is leftover no one saved as a guest. It is cleared here, before the new
 * rule would carry it into the next account to sign in.
 *
 * v8 -> v9 (#189) changes where the profile is kept, not its shape, so there
 * is nothing to rewrite here. On a phone `formeStorageFor` keeps the profile
 * in the Keychain and out of the AsyncStorage file. The bump is what moves an
 * existing one: persist writes the state back straight after migrating it, and
 * that write puts the profile in the Keychain and drops the plain-text copy,
 * on the first launch after the update rather than whenever something next
 * changes.
 */
export function migratePersisted(persisted: unknown, version: number): PersistedState | undefined {
  const migrated = migrateProfile(persisted, version);
  if (!migrated || version >= 8) return migrated;
  const { legacyShelfMigrated, ...rest } = migrated as PersistedState & { legacyShelfMigrated?: boolean };
  return legacyShelfMigrated && rest.shelfOwner == null ? { ...rest, savedProducts: [], savedIngredients: [] } : rest;
}

/** Up to v7: the profile's shape, and the dropped `productSuggestions`. */
function migrateProfile(persisted: unknown, version: number): PersistedState | undefined {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A profile read back from the Keychain, or null for anything that isn't one. */
function parseProfile(raw: string | null): SkinProfile | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) && Array.isArray(value.concerns) ? { ...EMPTY_PROFILE, ...value } : null;
  } catch {
    return null;
  }
}

/** Nothing answered: what a first run, a skipped quiz and "Delete my profile" all leave. */
function isEmptyProfile(profile: SkinProfile): boolean {
  return (
    profile.concerns.length === 0 &&
    profile.baseSkinType == null &&
    profile.sensitivity == null &&
    profile.pregnancyStatus == null
  );
}

/**
 * The store's storage, per platform. Exported so both branches are testable;
 * the app uses `formeStorage` below.
 *
 * A rebrand renamed the persisted key from `skintel-store` to `forme-store`.
 * AsyncStorage has no notion of "the same store under a new name" — without
 * the one-time copy in `readFile`, `persist` would just find nothing under the
 * new key and every existing install's profile, saved shelf and history would
 * reset to `INITIAL_STATE`, the same class of silent data loss
 * `migratePersisted` above exists to prevent.
 *
 * On a phone, the profile — pregnancy status included — lives in the Keychain
 * (#189, `lib/secure-storage.ts`), not in the AsyncStorage file. Reads put it
 * back into the state, writes take it out, so `persist` and everything above
 * it see one store and one hydration. Web has no Keychain, so the profile
 * stays in the file there, as the session falls back to memory.
 *
 * What keeps a profile from being lost on the way:
 * - A plain copy still in the file wins over the Keychain's. It is either one
 *   not moved yet (a v8 file) or a newer edit whose Keychain write failed, and
 *   the next write moves it.
 * - A failed Keychain write leaves the profile in the file.
 * - The Keychain is only read when the file exists. On a fresh install there is
 *   no file, so a previous install's profile never comes back; the first write
 *   replaces or removes it.
 * - An empty profile removes the Keychain copy — that is how "Delete my
 *   profile" reaches it — except when this launch couldn't read the Keychain,
 *   where an empty profile means "not loaded", not "erased".
 * - Writes are queued, so two quick changes land in order.
 */
export function formeStorageFor(os: typeof Platform.OS): StateStorage {
  const keychain = os !== "web";
  // What the Keychain holds as far as this launch knows; undefined for "not read".
  let known: string | null | undefined;
  let hydrated = false;
  let unreadable = false;
  let writes: Promise<unknown> = Promise.resolve();

  async function readFile(name: string): Promise<string | null> {
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
  }

  async function getItem(name: string): Promise<string | null> {
    known = undefined;
    unreadable = false;
    try {
      const raw = await readFile(name);
      if (!keychain || raw === null) return raw;
      let file: unknown;
      try {
        file = JSON.parse(raw);
      } catch {
        return raw;
      }
      if (!isRecord(file) || !isRecord(file.state)) return raw;
      const read = await readSecureProfile();
      if (!read.ok) {
        unreadable = true;
        return raw;
      }
      known = read.value;
      if ("profile" in file.state) return raw;
      const profile = parseProfile(read.value);
      return profile ? JSON.stringify({ ...file, state: { ...file.state, profile } }) : raw;
    } finally {
      hydrated = true;
    }
  }

  /** Puts the profile where it belongs; false means keep it in the file. */
  async function keepInKeychain(profile: SkinProfile): Promise<boolean> {
    // Written before the store read its file: nothing to go on, so leave the
    // Keychain alone rather than overwrite it with a first-run profile.
    if (!hydrated) return true;
    if (isEmptyProfile(profile)) {
      if (unreadable || known === null) return true;
      if (!(await removeSecureProfile())) return false;
      known = null;
      return true;
    }
    const value = JSON.stringify(profile);
    if (value === known) return true;
    if (!(await writeSecureProfile(value))) return false;
    known = value;
    unreadable = false;
    return true;
  }

  async function write(name: string, value: string): Promise<void> {
    if (!keychain) return AsyncStorage.setItem(name, value);
    let file: unknown;
    try {
      file = JSON.parse(value);
    } catch {
      return AsyncStorage.setItem(name, value);
    }
    if (!isRecord(file) || !isRecord(file.state) || !isRecord(file.state.profile)) {
      return AsyncStorage.setItem(name, value);
    }
    const { profile, ...rest } = file.state;
    const moved = await keepInKeychain(profile as SkinProfile);
    await AsyncStorage.setItem(name, moved ? JSON.stringify({ ...file, state: rest }) : value);
  }

  return {
    getItem,
    setItem: (name, value) => {
      const run = writes.then(() => write(name, value));
      writes = run.catch(() => undefined);
      return run;
    },
    removeItem: (name) => AsyncStorage.removeItem(name),
  };
}

export const formeStorage: StateStorage = formeStorageFor(Platform.OS);

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
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
        set((state) => {
          if (state.savedProducts.some((p) => p.id === id)) return state;
          const product = { id, savedAt: Date.now(), formulaFetchedAt };
          return {
            savedProducts: [...state.savedProducts, product],
            ...queued(state, { kind: "save-product", ...product }),
          };
        }),

      toggleSaved: (id, formulaFetchedAt) =>
        set((state) => {
          if (state.savedProducts.some((p) => p.id === id)) {
            return {
              savedProducts: state.savedProducts.filter((p) => p.id !== id),
              ...queued(state, { kind: "remove-product", id }),
            };
          }
          const product = { id, savedAt: Date.now(), formulaFetchedAt };
          return {
            savedProducts: [...state.savedProducts, product],
            ...queued(state, { kind: "save-product", ...product }),
          };
        }),

      restoreSavedProduct: (product) =>
        set((state) =>
          state.savedProducts.some((p) => p.id === product.id)
            ? state
            : {
                savedProducts: [...state.savedProducts, product],
                // Undo puts the row back with its original time, on the
                // server as well: the queue then holds a removal and a save
                // of the same item, which the push turns into that row again.
                ...queued(state, { kind: "save-product", ...product }),
              }
        ),

      setRoutineStep: (id, step) =>
        set((state) => {
          if (!state.savedProducts.some((p) => p.id === id)) return state;
          const shelf = applyOps({ products: state.savedProducts, ingredients: [] }, [
            { kind: "set-product-step", id, step },
          ]);
          return {
            savedProducts: shelf.products,
            ...queued(state, { kind: "set-product-step", id, step }),
          };
        }),

      setNote: (id, note) =>
        set((state) => {
          if (!state.savedProducts.some((p) => p.id === id)) return state;
          const shelf = applyOps({ products: state.savedProducts, ingredients: [] }, [
            { kind: "set-product-note", id, note },
          ]);
          return {
            savedProducts: shelf.products,
            ...queued(state, { kind: "set-product-note", id, note }),
          };
        }),

      saveIngredient: (name) =>
        set((state) =>
          state.savedIngredients.includes(name)
            ? state
            : {
                savedIngredients: [...state.savedIngredients, name],
                ...queued(state, { kind: "save-ingredient", name, savedAt: Date.now() }),
              }
        ),

      toggleSavedIngredient: (name) =>
        set((state) =>
          state.savedIngredients.includes(name)
            ? {
                savedIngredients: state.savedIngredients.filter((n) => n !== name),
                ...queued(state, { kind: "remove-ingredient", name }),
              }
            : {
                savedIngredients: [...state.savedIngredients, name],
                ...queued(state, { kind: "save-ingredient", name, savedAt: Date.now() }),
              }
        ),

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
            history: keptHistory([entry, ...state.history.filter((h) => h.id !== id)], now),
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

      expireHistory: () => {
        const { history } = get();
        const kept = keptHistory(history, Date.now());
        if (kept.length !== history.length) set({ history: kept });
      },

      clearHistory: () => set({ history: [] }),
      clearSavedProducts: () =>
        set((state) => ({
          savedProducts: [],
          ...queued(state, ...state.savedProducts.map((p): ShelfOp => ({ kind: "remove-product", id: p.id }))),
        })),
      clearSavedIngredients: () =>
        set((state) => ({
          savedIngredients: [],
          ...queued(state, ...state.savedIngredients.map((name): ShelfOp => ({ kind: "remove-ingredient", name }))),
        })),
      removeHistoryEntry: (id) =>
        set((state) => ({ history: state.history.filter((h) => h.id !== id) })),
      restoreHistoryEntry: (entry) =>
        set((state) =>
          state.history.some((h) => h.id === entry.id)
            ? state
            : {
                history: keptHistory(
                  [...state.history, entry].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
                  Date.now()
                ),
              }
        ),

      claimSecureStore: () => set({ secureStoreClaimed: true }),

      markJournalStarted: (account) =>
        set((state) =>
          state.journalStarted.includes(account) ? state : { journalStarted: [...state.journalStarted, account] }
        ),

      adoptShelf: (owner) =>
        set((state) => {
          if (state.shelfOwner === owner) return state;
          // What this account left unsynced last time comes back into the
          // queue; anyone else's parked changes are dropped, never pushed.
          const parked = state.parkedShelf?.owner === owner ? state.parkedShelf.queue : [];
          if (state.shelfOwner === null) {
            // A guest's shelf is carried into the account rather than lost.
            // The saves only add: an account row already there keeps its own
            // date, note and step (lib/shelf.ts).
            return {
              shelfOwner: owner,
              parkedShelf: null,
              shelfQueue: [
                ...parked,
                ...shelfAsSaves({ products: state.savedProducts, ingredients: state.savedIngredients }, Date.now()),
              ],
            };
          }
          // Another account's cache (there should be none; sign-out clears
          // it) never crosses into this one.
          return {
            shelfOwner: owner,
            parkedShelf: null,
            shelfQueue: parked,
            savedProducts: [],
            savedIngredients: [],
          };
        }),

      applyServerShelf: (owner, pushed, server) =>
        set((state) => {
          if (state.shelfOwner !== owner) return state;
          const pending = state.shelfQueue.filter((op) => !pushed.includes(op));
          const shelf = applyOps(server, pending);
          return { savedProducts: shelf.products, savedIngredients: shelf.ingredients, shelfQueue: pending };
        }),

      discardShelf: () =>
        set({ shelfOwner: null, shelfQueue: [], parkedShelf: null, savedProducts: [], savedIngredients: [] }),

      leaveShelf: () =>
        set((state) =>
          state.shelfOwner === null
            ? state
            : {
                shelfOwner: null,
                shelfQueue: [],
                savedProducts: [],
                savedIngredients: [],
                parkedShelf: state.shelfQueue.length > 0 ? { owner: state.shelfOwner, queue: state.shelfQueue } : null,
              }
        ),

      resetApp: () => {
        // Keeps `secureStoreClaimed`: this install already cleared the
        // Keychain, and resetting the flag would make the next launch treat
        // the app as reinstalled and silently sign the user out. Whether
        // "erase everything" should also sign out is left to the account
        // screens (#220), which can call sign-out deliberately.
        // This one `set` is also what resets the disk: `persist` writes the
        // whole persisted blob on every change, so the first-run values
        // replace what was stored and the next rehydration reads them back.
        // It used to be followed by `persist.clearStorage()`, which is
        // unsafe now: its unawaited remove can land after this write and
        // delete the kept flag with everything else, so the next launch would
        // wipe the Keychain and sign the user out by accident of timing.
        //
        // Signed in, the account's shelf is erased too; otherwise the next
        // sync would bring back everything this just promised to erase. The
        // account itself, and this device's claim on it, stay.
        set((state) => ({
          ...INITIAL_STATE,
          secureStoreClaimed: state.secureStoreClaimed,
          shelfOwner: state.shelfOwner,
          // Changes parked from an earlier sign-out are shelf data too.
          parkedShelf: null,
          shelfQueue: state.shelfOwner
            ? [
                ...state.shelfQueue,
                ...state.savedProducts.map((p): ShelfOp => ({ kind: "remove-product", id: p.id })),
                ...state.savedIngredients.map((name): ShelfOp => ({ kind: "remove-ingredient", name })),
              ]
            : [],
        }));
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
      version: 9,
      storage: createJSONStorage(() => formeStorage),
      partialize: partializeState,
      migrate: migratePersisted,
      // The history age cap, on app start (#189).
      onRehydrateStorage: () => (state) => state?.expireHistory(),
    }
  )
);

// The reinstall check in lib/secure-storage.ts reads `secureStoreClaimed`
// through this, not through an import of this file (see `connectClaimFlag`).
connectClaimFlag({
  hydrated: () =>
    useAppStore.persist.hasHydrated()
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const unsubscribe = useAppStore.persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
          });
        }),
  isClaimed: () => useAppStore.getState().secureStoreClaimed,
  claim: () => useAppStore.getState().claimSecureStore(),
});
