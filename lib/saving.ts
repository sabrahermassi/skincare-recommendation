import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { noteProductSaved } from "@/lib/first-page";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";

/**
 * Saving is open to everyone (#300, superseding #221's signed-in-only rule).
 * Signed out, a save stays on this phone; signing in carries it into the
 * account (`adoptShelf` in store/useAppStore.ts). Nothing here asks anyone to
 * sign in: that is offered on the Saved tab and in Account, never at the tap.
 */

/** A Save or star tap: saves at once, for anyone. */
export function saveFromTap(save: () => void, target: "product" | "ingredient"): void {
  track("save_tapped", { target, signed_in: useAuth.getState().status === "signed-in" });
  save();
  // The first product an account saves is the first page of its journal
  // (#230). Signed out there is no account yet, so the moment waits for the
  // first save made signed in.
  if (target === "product") noteProductSaved();
}

/**
 * Whether the shelf on this phone belongs to no account: a guest's, carried
 * in when they sign in. Read from the shelf's owner rather than the session,
 * so a stored session still loading at launch doesn't flash the guest view.
 * False with no backend configured (a fresh checkout, the tests), where there
 * are no accounts to speak of.
 */
export function useGuestShelf(): boolean {
  const owner = useAppStore((s) => s.shelfOwner);
  return isSupabaseConfigured && owner === null;
}

/**
 * Whether a saved product's note and routine step can be written. They stay
 * signed-in only: a guest's note would be carried in at sign-in and silently
 * replace the one the account already has for that product.
 */
export function useCanJournal(): boolean {
  return !useGuestShelf();
}
