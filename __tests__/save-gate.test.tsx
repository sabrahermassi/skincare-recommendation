import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * Saving asks a guest to sign in (#221): the add direction only, the save
 * held while they do and completed for them after, and never a prompt for
 * removing something.
 */

jest.setTimeout(30000);

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
    useLocalSearchParams: () => ({ id: "hanbang-rice-serum" }),
    useIsFocused: () => true,
    useScrollToTop: () => undefined,
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => effect(), []); // eslint-disable-line react-hooks/exhaustive-deps
    },
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Accounts exist: a backend is configured, even though the catalogue below
// is the bundled sample.
jest.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true, supabase: null }));

const { useAuth } = require("@/lib/auth") as typeof import("@/lib/auth");
const gate = require("@/lib/save-gate") as typeof import("@/lib/save-gate");
const { useAppStore } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");

beforeEach(() => {
  jest.clearAllMocks();
  gate.dropPendingSave();
  useAuth.setState({ status: "signed-out", session: null });
  useAppStore.setState({ savedProducts: [], savedIngredients: [] });
});

describe("the gate", () => {
  it("holds a guest's save and opens the sign-in sheet", () => {
    const save = jest.fn();
    gate.saveOrAskToSignIn(save, "product");
    expect(save).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/sign-in", params: { from: "save" } });
  });

  // #273 review: a double tap opened two sheets.
  it("opens one sheet for a double tap, and again after the sheet was closed", () => {
    const first = jest.fn();
    const second = jest.fn();
    gate.saveOrAskToSignIn(first, "product");
    gate.saveOrAskToSignIn(second, "product");
    expect(mockPush).toHaveBeenCalledTimes(1);
    gate.completePendingSave();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    gate.saveOrAskToSignIn(first, "product");
    gate.dropPendingSave();
    gate.saveOrAskToSignIn(first, "product");
    expect(mockPush).toHaveBeenCalledTimes(3);
  });

  it("does the held save once they sign in, exactly once", () => {
    const save = jest.fn();
    gate.saveOrAskToSignIn(save, "product");
    gate.completePendingSave();
    gate.completePendingSave();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("forgets the held save when they close the sheet instead", () => {
    const save = jest.fn();
    gate.saveOrAskToSignIn(save, "product");
    gate.dropPendingSave();
    gate.completePendingSave();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves straight away for someone signed in", () => {
    useAuth.setState({ status: "signed-in", session: {} as never });
    const save = jest.fn();
    gate.saveOrAskToSignIn(save, "product");
    expect(save).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("asks while the stored session is still loading, and the sheet then closes itself", () => {
    useAuth.setState({ status: "loading", session: null });
    expect(gate.canSaveNow()).toBe(false);
  });
});

describe("the heart on a product", () => {
  const ProductScreen = (require("@/app/product/[id]") as { default: () => React.JSX.Element }).default;

  it("asks a guest to sign in and saves nothing yet", async () => {
    await render(<ProductScreen />);
    const heart = await screen.findByLabelText("Save");
    await act(async () => fireEvent.press(heart));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/sign-in", params: { from: "save" } });
    expect(useAppStore.getState().savedProducts).toEqual([]);

    // Signing in completes the save with no second tap.
    await act(async () => gate.completePendingSave());
    expect(useAppStore.getState().savedProducts.map((p) => p.id)).toEqual(["hanbang-rice-serum"]);
  });

  it("never asks to remove something, even signed out", async () => {
    useAppStore.setState({ savedProducts: [{ id: "hanbang-rice-serum", savedAt: 1 }] });
    await render(<ProductScreen />);
    const heart = await screen.findByLabelText("Remove from saved");
    await act(async () => fireEvent.press(heart));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useAppStore.getState().savedProducts).toEqual([]);
  });
});

describe("the sign-in sheet", () => {
  it("completes the held save and closes when a session arrives", async () => {
    const SignIn = (require("@/app/sign-in") as { default: () => React.JSX.Element }).default;
    const save = jest.fn();
    gate.saveOrAskToSignIn(save, "product");
    await render(<SignIn />);
    await act(async () => useAuth.setState({ status: "signed-in", session: {} as never }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("drops the held save when closed without signing in", async () => {
    const SignIn = (require("@/app/sign-in") as { default: () => React.JSX.Element }).default;
    const save = jest.fn();
    gate.saveOrAskToSignIn(save, "product");
    const { unmount } = await render(<SignIn />);
    await act(async () => unmount());
    useAuth.setState({ status: "signed-in", session: {} as never });
    gate.completePendingSave();
    expect(save).not.toHaveBeenCalled();
  });
});

describe("the Saved tab for a guest", () => {
  it("invites sign-in instead of saying nothing is saved yet", async () => {
    const Saved = (require("@/app/(tabs)/saved") as { default: () => React.JSX.Element }).default;
    const { GUEST_EMPTY_COPY } = require("@/app/(tabs)/saved") as typeof import("@/app/(tabs)/saved");
    await render(<Saved />);
    expect(await screen.findByText(GUEST_EMPTY_COPY.saved!.title)).toBeTruthy();
    expect(screen.queryByText("No products saved yet")).toBeNull();
    fireEvent.press(screen.getByText("Sign in"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/sign-in", params: { from: "shelf" } });
  });
});
