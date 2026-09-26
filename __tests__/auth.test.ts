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

// A real SHA-256 (Node's), so the test proves the hash sent to Apple is the
// hash of the raw nonce sent to Supabase — not just that two strings exist.
let mockNonceCount = 0;
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  randomUUID: () => `nonce-${++mockNonceCount}`,
  digestStringAsync: async (_algorithm: string, value: string) =>
    require("crypto").createHash("sha256").update(value).digest("hex"),
}));

// Required rather than imported: an import is hoisted above the mocks'
// declarations, and lib/auth reads the fake client as it loads.
const {
  accountSummary,
  classifySignInError,
  signInFailureCopy,
  signInWithApple,
  forgetDeletedAccount,
  signOut,
  signOutEverywhere,
  startAuth,
  useAuth,
} = require("@/lib/auth") as typeof import("@/lib/auth");

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
    expect(mockAppleSignIn).toHaveBeenCalledWith(expect.objectContaining({ requestedScopes: [1] }));
    expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "apple", token: "apple-jwt" }),
    );
  });

  // #270 review (CodeRabbit): without a nonce, a captured Apple token could be
  // replayed within its validity window.
  it("binds the token to this attempt: Apple gets the hashed nonce, Supabase the raw one", async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: "apple-jwt" });
    await signInWithApple();
    const { nonce: hashed } = mockAppleSignIn.mock.calls[0][0] as { nonce: string };
    const [[{ nonce: raw }]] = mockAuth.signInWithIdToken.mock.calls as unknown as [{ nonce: string }][];
    expect(raw).toBeTruthy();
    expect(hashed).toBe(require("crypto").createHash("sha256").update(raw).digest("hex"));
    expect(hashed).not.toBe(raw);
  });

  it("uses a fresh nonce on every attempt", async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: "apple-jwt" });
    await signInWithApple();
    await signInWithApple();
    const calls = mockAuth.signInWithIdToken.mock.calls as unknown as [{ nonce: string }][];
    const [first, second] = calls.map(([args]) => args.nonce);
    expect(first).not.toBe(second);
  });

  it("treats closing the sheet as a cancel, not a failure", async () => {
    mockAppleSignIn.mockRejectedValue(Object.assign(new Error("cancelled"), { code: "ERR_REQUEST_CANCELED" }));
    await expect(signInWithApple()).resolves.toEqual({ ok: false, reason: "cancelled" });
  });

  it("reports a rejected token as a failure", async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: "apple-jwt" });
    mockAuth.signInWithIdToken.mockResolvedValueOnce({ error: { message: "Invalid audience" } });
    await expect(signInWithApple()).resolves.toEqual({
      ok: false,
      reason: "failed",
      kind: "provider",
      message: "Invalid audience",
    });
  });
});

describe("telling failures apart (#220)", () => {
  it.each([
    [{ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }, "network"],
    [new TypeError("Network request failed"), "network"],
    [{ message: "The request timed out." }, "network"],
    [{ code: "email_exists", message: "Email already registered" }, "linked-elsewhere"],
    [{ code: "identity_already_exists", message: "Identity is already linked" }, "linked-elsewhere"],
    [{ message: "Invalid audience", status: 400 }, "provider"],
    [Object.assign(new Error("The operation couldn't be completed."), { code: "ERR_REQUEST_FAILED" }), "provider"],
  ])("%p is a %s failure", (error: unknown, kind: string) => {
    expect(classifySignInError(error)).toBe(kind);
  });

  it("gives every failure its own words, and names the provider only when it was theirs", () => {
    const network = signInFailureCopy("network", "google");
    expect(network).toMatch(/couldn't reach our servers/);
    expect(network).not.toMatch(/Google/);
    expect(signInFailureCopy("provider", "google")).toMatch(/^Google couldn't sign you in/);
    expect(signInFailureCopy("linked-elsewhere", "apple")).toMatch(/different sign-in/);
  });
});

describe("who is signed in", () => {
  const withUser = (email: string | undefined, app_metadata: Record<string, unknown>) =>
    ({ user: { id: "u", email, app_metadata } }) as unknown as Session;

  it("recognises an Apple Hide My Email relay address", () => {
    expect(accountSummary(withUser("x7@privaterelay.appleid.com", { provider: "apple", providers: ["apple"] })))
      .toEqual({ providers: "Apple", email: "x7@privaterelay.appleid.com", isHiddenEmail: true });
  });

  it("lists every linked provider once, and falls back to the single provider field", () => {
    expect(accountSummary(withUser("j@gmail.com", { providers: ["google", "apple", "google"] })).providers).toBe(
      "Google and Apple",
    );
    expect(accountSummary(withUser("j@gmail.com", { provider: "google" })).providers).toBe("Google");
  });
});

describe("signing out", () => {
  it("ends this device's session only", async () => {
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("signs out every device, and says whether the server heard", async () => {
    await expect(signOutEverywhere()).resolves.toBe(true);
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "global" });
    mockAuth.signOut.mockResolvedValueOnce({ error: { message: "offline" } } as never);
    await expect(signOutEverywhere()).resolves.toBe(false);
  });
});

describe("after the account is deleted (#152)", () => {
  it("counts the phone as signed out even when its stored session can't be removed", async () => {
    useAuth.setState({ status: "signed-in", session });
    mockAuth.signOut.mockRejectedValueOnce(new Error("Keychain refused"));
    await expect(forgetDeletedAccount()).resolves.toBeUndefined();
    expect(useAuth.getState().status).toBe("signed-out");
  });
});
