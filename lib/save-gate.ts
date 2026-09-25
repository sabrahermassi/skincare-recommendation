import { router } from "expo-router";

import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Saving is a signed-in feature (#221, `FOR_ME_MVP.md`): the Save action is
 * the one place a guest is ever asked to make an account — never before a
 * scan, never anywhere else. Scanning, verdicts and history stay open to
 * everyone.
 *
 * Only the *add* direction is gated. Removing something never asks; a
 * signed-out person with an old shelf from before accounts (#222) can always
 * take things off it.
 *
 * The save a guest asked for is held here while they sign in, and done for
 * them once they have — they should not have to tap it again. Memory only,
 * like `lib/pending-label.ts`: an abandoned sign-in simply drops it. Both
 * providers' sheets are in-app on iOS, so the app is not left while it waits.
 */

let pending: (() => void) | null = null;

/**
 * Whether a save can happen straight away. With no backend configured (a
 * fresh checkout, the tests) there are no accounts to ask for, so saving stays
 * local exactly as it was.
 */
export function canSaveNow(): boolean {
  return !isSupabaseConfigured || useAuth.getState().status === "signed-in";
}

/** `canSaveNow` for a render: re-renders when the session arrives or leaves. */
export function useCanSave(): boolean {
  const status = useAuth((s) => s.status);
  return !isSupabaseConfigured || status === "signed-in";
}

/** Saves now, or holds the save and opens the sign-in sheet. */
export function saveOrAskToSignIn(save: () => void): void {
  if (canSaveNow()) {
    save();
    return;
  }
  // A second tap while the sheet is already on its way (or up) updates what
  // will be saved but opens no second sheet (#273 review): two stacked sheets
  // would both close on sign-in and the second close would pop the screen
  // the person was on. Closing the sheet drops the pending save, so the next
  // tap after that opens it again.
  const sheetAlreadyAsked = pending !== null;
  pending = save;
  if (!sheetAlreadyAsked) router.push("/sign-in");
}

/** Called by the sign-in sheet once someone is signed in. */
export function completePendingSave(): void {
  const save = pending;
  pending = null;
  save?.();
}

/** Called when the sign-in sheet closes without a sign-in. */
export function dropPendingSave(): void {
  pending = null;
}
