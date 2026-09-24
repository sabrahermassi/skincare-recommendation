import { AppState } from "react-native";

import { fetchShelf, pushShelf } from "@/data/api";
import { beforeSignOut, useAuth } from "@/lib/auth";
import { planPush } from "@/lib/shelf";
import { useAppStore } from "@/store/useAppStore";

/**
 * Keeps the cached shelf and the account's shelf in step (#222, #223). The
 * rules live in lib/shelf.ts, the wire in data/api.ts, the cache and queue in
 * useAppStore; this file only decides *when*.
 *
 * - Signing in makes the cache the account's (carrying a pre-accounts shelf
 *   across once per device, #222) and syncs.
 * - Every shelf change syncs shortly after, so the other phone sees it soon.
 * - Coming back to the app syncs, to pick up changes made elsewhere.
 * - A sync that fails — no signal in a shop is the normal case — keeps its
 *   queue and tries again, never drops it and never shows an error: the
 *   cache already shows the change.
 * - Signing out pushes what it can first, then clears the cache (#222).
 */

/** Quiet time after a change before it is pushed, so a burst of taps is one push. */
const PUSH_AFTER_MS = 800;
/** How soon a failed sync tries again, while the app is open. */
const RETRY_AFTER_MS = 30_000;
/** Coming back to the app re-reads the account's shelf at most this often. */
const REFRESH_AFTER_MS = 60_000;

let running: Promise<boolean> | null = null;
let again = false;
let lastSynced = 0;

/**
 * Pushes the queue, then reads the account's shelf back. Returns whether it
 * got all the way through. One at a time: a call during a sync asks for
 * another pass after it, rather than racing it.
 */
export function syncShelf(): Promise<boolean> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let ok: boolean;
    do {
      again = false;
      ok = await syncOnce();
    } while (again && ok);
    return ok;
  })().finally(() => {
    running = null;
  });
  return running;
}

async function syncOnce(): Promise<boolean> {
  const { shelfOwner: owner, shelfQueue } = useAppStore.getState();
  if (!owner) return true;
  const pushed = [...shelfQueue];
  if (pushed.length > 0) {
    // A failed push leaves the queue as it was; every step of it is
    // idempotent, so the retry simply sends it again.
    const result = await pushShelf(owner, planPush(pushed));
    if (!result.ok) return false;
  }
  const server = await fetchShelf();
  if (!server.ok) return false;
  useAppStore.getState().applyServerShelf(owner, pushed, server.value);
  lastSynced = Date.now();
  return true;
}

/** Tests only. */
export function resetShelfSyncForTests(): void {
  running = null;
  again = false;
  lastSynced = 0;
}

/** Starts following sign-ins, shelf changes and the app coming back. Returns the cleanup. */
export function startShelfSync(): () => void {
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delay: number) => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      void syncShelf().then((ok) => {
        if (ok || !useAppStore.getState().shelfOwner) return;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (AppState.currentState === "active") schedule(0);
        }, RETRY_AFTER_MS);
      });
    }, delay);
  };

  const followSession = () => {
    const { status, session } = useAuth.getState();
    if (status === "signed-in" && session) {
      useAppStore.getState().adoptShelf(session.user.id);
      schedule(0);
    } else if (status === "signed-out") {
      // A no-op for a guest; for an account's cache, it is the sign-out.
      useAppStore.getState().leaveShelf();
    }
  };
  followSession();
  const unfollowAuth = useAuth.subscribe((state, prev) => {
    if (state.status !== prev.status || state.session?.user.id !== prev.session?.user.id) followSession();
  });

  const unfollowQueue = useAppStore.subscribe((state, prev) => {
    if (state.shelfOwner && state.shelfQueue.length > 0 && state.shelfQueue !== prev.shelfQueue) {
      schedule(PUSH_AFTER_MS);
    }
  });

  const appState = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    const { shelfOwner, shelfQueue } = useAppStore.getState();
    if (shelfOwner && (shelfQueue.length > 0 || Date.now() - lastSynced > REFRESH_AFTER_MS)) schedule(0);
  });

  // Whatever is still queued gets one last push while the session is valid.
  const unhook = beforeSignOut(async () => {
    await syncShelf();
  });

  return () => {
    if (pushTimer) clearTimeout(pushTimer);
    if (retryTimer) clearTimeout(retryTimer);
    unfollowAuth();
    unfollowQueue();
    appState.remove();
    unhook();
  };
}
