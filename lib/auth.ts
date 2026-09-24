import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
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

export type SignInResult =
  | { ok: true }
  /** The person closed the sheet. Not an error, and not worth a message. */
  | { ok: false; reason: "cancelled" }
  /** This build or platform cannot offer the provider at all. */
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "failed"; message: string };

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
 * the native sheet has nowhere to return to.
 */
export const isGoogleSignInConfigured = Boolean(supabase && Platform.OS === "ios" && GOOGLE_IOS_CLIENT_ID);

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function signInWithApple(): Promise<SignInResult> {
  if (!supabase || !(await isAppleSignInAvailable())) return { ok: false, reason: "unavailable" };
  try {
    // Email only. The name is not asked for: nothing in the app shows it,
    // and a field never collected is one that never needs deleting.
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) return { ok: false, reason: "failed", message: "Apple returned no identity token." };
    const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken });
    return error ? { ok: false, reason: "failed", message: error.message } : { ok: true };
  } catch (error) {
    if (codeOf(error) === "ERR_REQUEST_CANCELED") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed", message: messageOf(error) };
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
    if (!token) return { ok: false, reason: "failed", message: "Google returned no identity token." };
    const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token });
    return error ? { ok: false, reason: "failed", message: error.message } : { ok: true };
  } catch (error) {
    if (codeOf(error) === google.statusCodes.SIGN_IN_CANCELLED) return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed", message: messageOf(error) };
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
  await supabase.auth.signOut({ scope: "local" });
  if (isGoogleSignInConfigured) {
    try {
      const google = await import("@react-native-google-signin/google-signin");
      await google.GoogleSignin.signOut();
    } catch {
      // Not signed in with Google, or the module is absent (Expo Go).
    }
  }
}
