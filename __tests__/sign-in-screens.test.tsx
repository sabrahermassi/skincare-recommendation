import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Session } from "@supabase/supabase-js";

/**
 * The sign-in sheet and account screen (#220). `lib/auth` is replaced so each
 * provider outcome can be forced; what is pinned is what the person sees —
 * above all that closing Apple's or Google's own sheet shows nothing at all.
 */

jest.setTimeout(30000);

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The real button is native; a pressable stand-in is enough to drive the flow.
jest.mock("expo-apple-authentication", () => {
  const { Pressable, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 2 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>Sign in with Apple</Text>
      </Pressable>
    ),
  };
});

const mockSignInWithApple = jest.fn();
const mockSignOut = jest.fn(async () => {});
const mockSignOutEverywhere = jest.fn(async () => true);
jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    isAppleSignInAvailable: async () => true,
    isGoogleSignInConfigured: false,
    signInWithApple: () => mockSignInWithApple(),
    signOut: () => mockSignOut(),
    signOutEverywhere: () => mockSignOutEverywhere(),
  };
});

const { default: SignIn, HIDE_MY_EMAIL_NOTE } = require("@/app/sign-in") as typeof import("@/app/sign-in");
const {
  default: Account,
  HIDDEN_EMAIL_NOTE,
  SIGN_OUT_FAILED,
  SIGNED_OUT_HERE_ONLY,
} = require("@/app/account") as typeof import("@/app/account");
const { useAuth } = require("@/lib/auth") as typeof import("@/lib/auth");

beforeEach(() => {
  jest.clearAllMocks();
});

async function tapApple() {
  // Found before the act, not inside it: a find waits in its own act, and
  // nesting the two leaks into the next test.
  const apple = await screen.findByText("Sign in with Apple");
  await act(async () => fireEvent.press(apple));
}

describe("the sign-in sheet", () => {
  it("closes itself once signed in", async () => {
    mockSignInWithApple.mockResolvedValue({ ok: true });
    await render(<SignIn />);
    await tapApple();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // #272 review: a sign-in that finishes after "Not now" must not pop the
  // screen underneath.
  it("does not go back again when a sign-in finishes after the sheet was closed", async () => {
    let finish: (value: unknown) => void = () => {};
    mockSignInWithApple.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { unmount } = await render(<SignIn />);
    const apple = await screen.findByText("Sign in with Apple");
    await act(async () => fireEvent.press(apple));
    await act(async () => unmount());
    await act(async () => finish({ ok: true }));
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("stays exactly as it was when the person closes Apple's sheet", async () => {
    mockSignInWithApple.mockResolvedValue({ ok: false, reason: "cancelled" });
    await render(<SignIn />);
    await tapApple();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.queryByText(/couldn't/)).toBeNull();
  });

  it("says the connection is the problem when it is", async () => {
    mockSignInWithApple.mockResolvedValue({ ok: false, reason: "failed", kind: "network", message: "x" });
    await render(<SignIn />);
    await tapApple();
    expect(screen.getByText("We couldn't reach our servers. Check your signal and try again.")).toBeTruthy();
  });

  it("names the provider when the provider refused", async () => {
    mockSignInWithApple.mockResolvedValue({ ok: false, reason: "failed", kind: "provider", message: "x" });
    await render(<SignIn />);
    await tapApple();
    expect(screen.getByText("Apple couldn't sign you in just now. Try again in a moment.")).toBeTruthy();
  });

  it("warns about Hide My Email before it splits someone into two accounts", async () => {
    await render(<SignIn />);
    expect(await screen.findByText(HIDE_MY_EMAIL_NOTE)).toBeTruthy();
  });
});

function session(email: string, providers: string[]): Session {
  return {
    access_token: "a",
    refresh_token: "r",
    user: { id: "u", email, app_metadata: { provider: providers[0], providers } },
  } as unknown as Session;
}

describe("the account screen", () => {
  it("shows a Hide My Email address as an account, not a mistake", async () => {
    useAuth.setState({ status: "signed-in", session: session("abc123@privaterelay.appleid.com", ["apple"]) });
    await render(<Account />);
    expect(screen.getByText("Signed in with Apple")).toBeTruthy();
    expect(screen.getByText("abc123@privaterelay.appleid.com")).toBeTruthy();
    expect(screen.getByText(HIDDEN_EMAIL_NOTE)).toBeTruthy();
  });

  it("names both providers once they are linked, with no relay note for a real address", async () => {
    useAuth.setState({ status: "signed-in", session: session("jane@gmail.com", ["google", "apple"]) });
    await render(<Account />);
    expect(screen.getByText("Signed in with Google and Apple")).toBeTruthy();
    expect(screen.queryByText(HIDDEN_EMAIL_NOTE)).toBeNull();
  });

  it("signs out of this phone only from the main button", async () => {
    useAuth.setState({ status: "signed-in", session: session("jane@gmail.com", ["google"]) });
    await render(<Account />);
    await act(async () => fireEvent.press(screen.getByText("Sign out")));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOutEverywhere).not.toHaveBeenCalled();
  });

  it("is honest when the other devices could not be signed out", async () => {
    mockSignOutEverywhere.mockResolvedValueOnce(false);
    useAuth.setState({ status: "signed-in", session: session("jane@gmail.com", ["google"]) });
    await render(<Account />);
    await act(async () => fireEvent.press(screen.getByText("Sign out on every device")));
    expect(screen.getByText(SIGNED_OUT_HERE_ONLY)).toBeTruthy();
  });

  it("says so when this phone could not be signed out, instead of spinning", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("Keychain busy"));
    useAuth.setState({ status: "signed-in", session: session("jane@gmail.com", ["google"]) });
    await render(<Account />);
    await act(async () => fireEvent.press(screen.getByText("Sign out")));
    expect(screen.getByText(SIGN_OUT_FAILED)).toBeTruthy();
  });

  it("offers the sign-in sheet when signed out, and nothing else stands in the way", async () => {
    useAuth.setState({ status: "signed-out", session: null });
    await render(<Account />);
    fireEvent.press(screen.getByText("Sign in"));
    expect(mockPush).toHaveBeenCalledWith("/sign-in");
  });
});
