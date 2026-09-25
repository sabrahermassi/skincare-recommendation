import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { AppState, Platform } from "react-native";
import { create } from "zustand";

import { supabase } from "@/lib/supabase";

/**
 * Accounts (#218): Sign in with Apple and Sign in with Google, both as native
 * identity tokens handed to `supabase.auth.signInWithIdToken` — no redirect,
 * no email, no password. Decided in #217.
 *
 * **Same person, two providers.** Supabase links identities that share a
 * *verified* email into one account on its own, and that is the rule this
 * app wants (owner decision, 24 September 2026). Apple and Google both
 * return verified addresses. A Hide My Email relay address matches nothing,
 * so it stays a separate account — the sign-in screen says so rather than
 * leaving someone looking at an empty shelf. See docs/decisions.md.
 *
 * iOS is the only release target, so both buttons are iOS-only here. Google
 * also needs a development build: its native module is not in Expo Go.
 */

export type AuthStatus = "loading" | "signed-out" | "signed-in";

type AuthState = {
  status: AuthStatus;
  session: Session | null;
};

/**
 * The session as the app sees it. In memory only — the session itself is
 * persisted by the Supabase client into lib/secure-storage.ts, never into
 * `useAppStore`.
 */
export const useAuth = create<AuthState>(() => ({
  // With no backend configured there is nothing to wait for.
  status: supabase ? "loading" : "signed-out",
  session: null,
}));

function applySession(session: Session | null): void {
  useAuth.setState({ session, status: session ? "signed-in" : "signed-out" });
}

/**
 * Starts following the session: the stored one on launch, sign-ins,
 * refreshes, and sign-outs — including the one the client performs itself
 * when a refresh is refused (a revoked token, a deleted account), which
 * arrives here as a `null` session and leaves the app cleanly signed out
 * rather than half-authenticated.
 *
 * Also pauses token refresh while the app is in the background, which is
 * how supabase-js asks React Native apps to run it. Returns the cleanup.
 */
export function startAuth(): () => void {
  if (!supabase) return () => {};
  const client = supabase;

  const { data } = client.auth.onAuthStateChange((_event, session) => applySession(session));

  // The client starts refreshing on its own when it loads, so only the
  // changes after launch need handling here.
  const appState = AppState.addEventListener("change", (state) => {
    if (state === "active") void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });

  return () => {
    data.subscription.unsubscribe();
    appState.remove();
    void client.auth.stopAutoRefresh();
  };
}

export type Provider = "apple" | "google";

/**
 * Why a sign-in failed, as far as the person needs to know (#220):
 *
 * - `network` — the phone could not reach us. Check the signal.
 * - `provider` — Apple or Google said no: a revoked permission, an outage, a
 *   token our project would not accept.
 * - `linked-elsewhere` — the address already belongs to an account under a
 *   different sign-in that Supabase would not link automatically.
 */
export type SignInFailure = "network" | "provider" | "linked-elsewhere";

export type SignInResult =
  | { ok: true }
  /** The person closed the sheet. Not an error, and not worth a message. */
  | { ok: false; reason: "cancelled" }
  /** This build or platform cannot offer the provider at all. */
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "failed"; kind: SignInFailure; message: string };

/** Supabase Auth's codes for "that email is already someone's account". */
const LINKING_CODES = new Set(["email_exists", "identity_already_exists", "user_already_exists"]);

/** Exported for the tests. */
export function classifySignInError(error: unknown): SignInFailure {
  const { name, code, status, message } = (typeof error === "object" && error !== null ? error : {}) as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  if (typeof code === "string" && LINKING_CODES.has(code)) return "linked-elsewhere";
  if (name === "AuthRetryableFetchError" || status === 0) return "network";
  const text = typeof message === "string" ? message : String(error);
  if (/network|internet|offline|timed? ?out|failed to fetch|could not connect/i.test(text)) return "network";
  return "provider";
}

function failed(error: unknown): SignInResult {
  return { ok: false, reason: "failed", kind: classifySignInError(error), message: messageOf(error) };
}

/** What the sign-in sheet says for each failure. Cancelling says nothing. */
export function signInFailureCopy(kind: SignInFailure, provider: Provider): string {
  const name = provider === "apple" ? "Apple" : "Google";
  switch (kind) {
    case "network":
      return "We couldn't reach our servers. Check your signal and try again.";
    case "linked-elsewhere":
      return `That email already has a for.me account under a different sign-in. Use the button you signed in with before.`;
    case "provider":
      return `${name} couldn't sign you in just now. Try again in a moment.`;
  }
}

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/** Whether the Apple button should be shown on this device. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (!supabase || Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Whether the Google button should be shown. Needs the iOS client ID, which
 * also drives the URL scheme `app.config.js` adds at build time — without it
 * the native sheet has nowhere to return to. Also needs the web client ID
 * (#270 review, CodeRabbit): the library's own docs are explicit that
 * `idToken` is populated only when a valid `webClientId` is configured, on
 * every platform — without it, every sign-in attempt reaches the native
 * sheet and then fails with "Google returned no identity token", rather
 * than the button being correctly withheld.
 */
export const isGoogleSignInConfigured = Boolean(
  supabase && Platform.OS === "ios" && GOOGLE_IOS_CLIENT_ID && GOOGLE_WEB_CLIENT_ID,
);

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message);
  return String(error);
}

export async function signInWithApple(): Promise<SignInResult> {
  if (!supabase || !(await isAppleSignInAvailable())) return { ok: false, reason: "unavailable" };
  try {
    // A fresh nonce per attempt binds the token to this sign-in, so a captured
    // token can't be replayed within its validity window (#270 review).
    // Apple gets the SHA-256 hash; Supabase gets the raw value and checks it
    // against the hash inside the token.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    // Email only. The name is not asked for: nothing in the app shows it,
    // and a field never collected is one that never needs deleting.
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return failed(new Error("Apple returned no identity token."));
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: rawNonce,
    });
    return error ? failed(error) : { ok: true };
  } catch (error) {
    if (codeOf(error) === "ERR_REQUEST_CANCELED") return { ok: false, reason: "cancelled" };
    return failed(error);
  }
}

export async function signInWithGoogle(): Promise<SignInResult> {
  if (!supabase || !isGoogleSignInConfigured) return { ok: false, reason: "unavailable" };

  // Loaded on demand: the native module is missing from Expo Go, and a
  // top-level import would crash the whole app there rather than just this
  // one button.
  let google: typeof import("@react-native-google-signin/google-signin");
  try {
    google = await import("@react-native-google-signin/google-signin");
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  try {
    google.GoogleSignin.configure({
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      // When set, the ID token is issued for the web client — the audience
      // the Supabase Google provider is configured to accept.
      webClientId: GOOGLE_WEB_CLIENT_ID,
    });
    const response = await google.GoogleSignin.signIn();
    if (!google.isSuccessResponse(response)) return { ok: false, reason: "cancelled" };
    const token = response.data.idToken;
    if (!token) return failed(new Error("Google returned no identity token."));
    const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token });
    return error ? failed(error) : { ok: true };
  } catch (error) {
    if (codeOf(error) === google.statusCodes.SIGN_IN_CANCELLED) return { ok: false, reason: "cancelled" };
    return failed(error);
  }
}

/**
 * Signs this device out. `local` ends only this device's session — signing
 * out of one phone should not sign someone out of their other one. The
 * Supabase client removes the stored session even when the network call
 * fails, so a sign-out offline still leaves nothing in the Keychain.
 *
 * Also forgets the Google account choice, so the next Google sign-in asks
 * which account rather than silently reusing the last one.
 *
 * Deliberately leaves the local skin profile, history and shelf alone:
 * whether sign-out should wipe them is an open product decision
 * (docs/device-storage-policy.md), settled with #222, not here.
 */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  await runBeforeSignOut();
  await supabase.auth.signOut({ scope: "local" });
  await forgetGoogleAccount();
}

/**
 * Signs out every device on this account — the case is a lost or stolen
 * phone (#20, #220). The server revokes every refresh token, so each other
 * device is signed out the next time it tries to refresh.
 *
 * This device's session is removed whatever the network does, so the answer
 * is only about the *other* devices: `false` means the server could not be
 * reached and they may still be signed in.
 */
export async function signOutEverywhere(): Promise<boolean> {
  if (!supabase) return true;
  await runBeforeSignOut();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  await forgetGoogleAccount();
  return !error;
}

const beforeSignOutHooks = new Set<() => Promise<void>>();

/**
 * Work that needs the session one last time before a deliberate sign-out —
 * pushing the shelf's queued changes (lib/shelf-sync.ts). Registered rather
 * than imported, so this file does not depend on what uses it. A hook that
 * fails never blocks the sign-out. Returns the unregister.
 */
export function beforeSignOut(hook: () => Promise<void>): () => void {
  beforeSignOutHooks.add(hook);
  return () => {
    beforeSignOutHooks.delete(hook);
  };
}

async function runBeforeSignOut(): Promise<void> {
  for (const hook of beforeSignOutHooks) {
    try {
      await hook();
    } catch {
      // Signing out goes ahead regardless.
    }
  }
}

async function forgetGoogleAccount(): Promise<void> {
  if (!isGoogleSignInConfigured) return;
  try {
    const google = await import("@react-native-google-signin/google-signin");
    await google.GoogleSignin.signOut();
  } catch {
    // Not signed in with Google, or the module is absent (Expo Go).
  }
}

/**
 * What an account is for, in the sign-in sheet and on the signed-out account
 * screen. The shelf follows the account to every phone it signs in on (#223,
 * lib/shelf-sync.ts) — until that landed this line deliberately did not say
 * so (#272 review).
 */
export const ACCOUNT_PITCH = "An account keeps what you save on every phone you use. Scanning never needs one.";

export type AccountSummary = {
  /** "Apple", "Google", or "Apple and Google" once both are linked. */
  providers: string;
  email: string | null;
  /** An Apple Hide My Email relay: real, working, and not what they typed. */
  isHiddenEmail: boolean;
};

const PROVIDER_NAMES: Record<string, string> = { apple: "Apple", google: "Google" };

/** Who is signed in, in the words the account screen uses. */
export function accountSummary(session: Session): AccountSummary {
  const meta = session.user.app_metadata ?? {};
  const listed: unknown[] = Array.isArray(meta.providers) ? meta.providers : [meta.provider];
  const names = listed.flatMap((p) => (typeof p === "string" && PROVIDER_NAMES[p] ? [PROVIDER_NAMES[p]] : []));
  const email = session.user.email ?? null;
  return {
    providers: [...new Set(names)].join(" and ") || "your account",
    email,
    isHiddenEmail: Boolean(email && /@privaterelay\.appleid\.com$/i.test(email)),
  };
}
