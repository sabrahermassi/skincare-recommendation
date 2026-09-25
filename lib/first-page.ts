import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";

/**
 * "The first page of your journal" (#230): a warm line the first time an
 * account saves a product — once per person, not per phone and not per empty
 * shelf.
 *
 * Shelf length can't decide it. An emptied shelf would bring it back, and a
 * shelf carried in from before accounts (#222) would mean it never came. So
 * it's a real flag, on the account itself: `user_metadata`, which travels with
 * the session, survives a reinstall and needs no table. It is a nicety, never
 * a permission — the person can write their own metadata, and nothing reads
 * this key but this file.
 *
 * `journalStarted` in the store is the fast path beside it: marked the moment
 * the line is shown, so it can't show twice while the account write is in
 * flight, or offline.
 */

export const JOURNAL_STARTED_KEY = "journal_started_at";

export const FIRST_PAGE_COPY = {
  heading: "The first page of your journal",
  body: "Everything you save is kept here, on any phone you sign in on. Add a note when you like — how it wore, whether you'd buy it again.",
  dismiss: "Got it",
} as const;

/** Whether this account has already had the moment — on the account, or on this phone. */
export function hasStartedJournal(user: Pick<User, "id" | "user_metadata">, startedHere: readonly string[]): boolean {
  return Boolean(user.user_metadata?.[JOURNAL_STARTED_KEY]) || startedHere.includes(user.id);
}

/**
 * Whether the moment is waiting to be seen. Memory only: the product screen
 * shows it once it has the focus back — after the sign-in sheet has gone, if
 * one was up — and it goes when dismissed or when that screen closes.
 */
export const useFirstPage = create<{ showing: boolean }>(() => ({ showing: false }));

export function dismissFirstPage(): void {
  useFirstPage.setState({ showing: false });
}

/**
 * A product has just been saved. If this is the account's first, the moment
 * is queued and the account told. Called by lib/save-gate.ts after the save
 * itself — so for a guest it lands after sign-in, never before.
 */
export function noteProductSaved(): void {
  const user = useAuth.getState().session?.user;
  if (!supabase || !user) return;
  if (hasStartedJournal(user, useAppStore.getState().journalStarted)) return;
  useAppStore.getState().markJournalStarted(user.id);
  useFirstPage.setState({ showing: true });
  void recordOnAccount();
}

/** A failed write is retried from `startFirstPage` the next time the session changes. */
async function recordOnAccount(): Promise<void> {
  if (!supabase) return;
  // `data` is merged into the account's metadata, not swapped for it, so the
  // name and picture a provider put there stay.
  await supabase.auth.updateUser({ data: { [JOURNAL_STARTED_KEY]: new Date().toISOString() } }).catch(() => undefined);
}

/** This phone showed the moment but the account never heard — offline at the time, say. */
export function needsRecording(session: Session | null, startedHere: readonly string[]): boolean {
  const user = session?.user;
  return Boolean(user && startedHere.includes(user.id) && !user.user_metadata?.[JOURNAL_STARTED_KEY]);
}

/**
 * Catches the account up whenever a session arrives or refreshes. The write
 * lands as a new session whose metadata has the key, so this settles after
 * one round. Returns the cleanup.
 */
export function startFirstPage(): () => void {
  const check = (session: Session | null) => {
    if (needsRecording(session, useAppStore.getState().journalStarted)) void recordOnAccount();
  };
  check(useAuth.getState().session);
  return useAuth.subscribe((state, previous) => {
    if (state.session !== previous.session) check(state.session);
  });
}
