/**
 * Sign-in plumbing (#218). The Supabase client is replaced with a fake whose
 * auth events the tests fire by hand, so what is pinned is how the app reacts
 * to each event — above all that a refused refresh leaves it signed out.
 */
import type { Session } from "@supabase/supabase-js";
import { AppState } from "react-native";

type Listener = (event: string, session: Session | null) => void;

const mockListeners: Listener[] = [];
const mockAuth = {
  onAuthStateChange: jest.fn((listener: Listener) => {
    mockListeners.push(listener);
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  }),
  startAutoRefresh: jest.fn(async () => {}),
  stopAutoRefresh: jest.fn(async () => {}),
  signInWithIdToken: jest.fn(async () => ({ error: null as { message: string } | null })),
  signOut: jest.fn(async () => ({ error: null })),
};

jest.mock("@/lib/supabase", () => ({ supabase: { auth: mockAuth } }));

const mockAppleSignIn = jest.fn();
jest.mock("expo-apple-authentication", () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: (...args: unknown[]) => mockAppleSignIn(...args),
}));

// Required rather than imported: an import is hoisted above the mocks'
// declarations, and lib/auth reads the fake client as it loads.
const { signInWithApple, signOut, startAuth, useAuth } = require("@/lib/auth") as typeof import("@/lib/auth");

const session = { access_token: "a", refresh_token: "r" } as Session;
const emit = (event: string, value: Session | null) => mockListeners.forEach((l) => l(event, value));

beforeEach(() => {
  mockListeners.length = 0;
  jest.clearAllMocks();
  useAuth.setState({ status: "loading", session: null });
});

describe("following the session", () => {
  it("starts loading, then settles on what was stored", () => {
    startAuth();
    expect(useAuth.getState().status).toBe("loading");
    emit("INITIAL_SESSION", session);
    expect(useAuth.getState()).toEqual({ status: "signed-in", session });
  });

  it("settles signed out when nothing was stored", () => {
    startAuth();
    emit("INITIAL_SESSION", null);
    expect(useAuth.getState().status).toBe("signed-out");
  });

  it("signs out cleanly when the client gives up on a refresh", () => {
    startAuth();
    emit("SIGNED_IN", session);
    // A revoked token or deleted account: the client drops the session and
    // reports it as signed out.
    emit("SIGNED_OUT", null);
    expect(useAuth.getState()).toEqual({ status: "signed-out", session: null });
  });

  it("keeps the latest session after a refresh", () => {
    startAuth();
    emit("SIGNED_IN", session);
    const refreshed = { ...session, access_token: "b" } as Session;
    emit("TOKEN_REFRESHED", refreshed);
    expect(useAuth.getState().session).toBe(refreshed);
  });

  it("refreshes tokens only while the app is in front, and stops on cleanup", () => {
    let onChange: (state: string) => void = () => {};
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type: string, listener: (state: string) => void) => {
      onChange = listener;
      return { remove };
    });
    const stop = startAuth();
    onChange("background");
    expect(mockAuth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    onChange("active");
    expect(mockAuth.startAutoRefresh).toHaveBeenCalledTimes(1);
    stop();
    expect(remove).toHaveBeenCalled();
    expect(mockAuth.stopAutoRefresh).toHaveBeenCalledTimes(2);
  });
});

describe("Sign in with Apple", () => {
  it("asks for the email only, and hands the token to Supabase", async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: "apple-jwt" });
    await expect(signInWithApple()).resolves.toEqual({ ok: true });
    expect(mockAppleSignIn).toHaveBeenCalledWith({ requestedScopes: [1] });
    expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({ provider: "apple", token: "apple-jwt" });
  });

  it("treats closing the sheet as a cancel, not a failure", async () => {
    mockAppleSignIn.mockRejectedValue(Object.assign(new Error("cancelled"), { code: "ERR_REQUEST_CANCELED" }));
    await expect(signInWithApple()).resolves.toEqual({ ok: false, reason: "cancelled" });
  });

  it("reports a rejected token as a failure", async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: "apple-jwt" });
    mockAuth.signInWithIdToken.mockResolvedValueOnce({ error: { message: "Invalid audience" } });
    await expect(signInWithApple()).resolves.toEqual({ ok: false, reason: "failed", message: "Invalid audience" });
  });
});

describe("signing out", () => {
  it("ends this device's session only", async () => {
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
