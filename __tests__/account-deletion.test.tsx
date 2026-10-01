import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Session } from "@supabase/supabase-js";

/**
 * Deleting the account and exporting it (#224), from the phone's side. The
 * server function's own rules are pinned in supabase/tests/delete_account.test.ts.
 */

jest.setTimeout(30000);

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => ({}),
  // One mount is enough here: Account closes its confirmations on losing focus.
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest.requireActual<typeof import("react")>("react").useEffect(effect, []), // eslint-disable-line react-hooks/exhaustive-deps
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockDeleteAccount = jest.fn();
const mockFetchAccountExport = jest.fn();
jest.mock("@/data/api", () => ({
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
  fetchAccountExport: () => mockFetchAccountExport(),
}));

const mockConfirmWithApple = jest.fn();
const mockForget = jest.fn(async () => {});
jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    confirmWithApple: () => mockConfirmWithApple(),
    forgetDeletedAccount: () => mockForget(),
  };
});

const { deleteMyAccount, exportDocument } = require("@/lib/account") as typeof import("@/lib/account");
const { useAuth } = require("@/lib/auth") as typeof import("@/lib/auth");
const { EMPTY_PROFILE, useAppStore } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");
const { default: Account, DELETE_WARNING, ACCOUNT_DELETED, ERASE_WARNING } = require("@/app/account") as typeof import("@/app/account");
const { profileErasedNoticePending } = require("@/lib/erase-notice") as typeof import("@/lib/erase-notice");

function signedIn(providers: string[]) {
  const session = { user: { id: "u", email: "jane@example.com", app_metadata: { providers } } } as unknown as Session;
  useAuth.setState({ status: "signed-in", session });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteAccount.mockResolvedValue({ ok: true });
  useAppStore.setState({
    profile: { ...EMPTY_PROFILE, concerns: ["redness"] },
    history: [{ id: "h", known: true, firstSeenAt: 1, lastSeenAt: 1, seenCount: 1, scoreAtView: 70, warningsAtView: 0 }],
    savedProducts: [{ id: "a", savedAt: 1 }],
    shelfOwner: "u",
    shelfQueue: [{ kind: "save-product", id: "a", savedAt: 1 }],
    parkedShelf: { owner: "u", queue: [] },
  });
});

describe("deleting the account", () => {
  it("asks Apple to confirm first for an Apple account, and sends that code", async () => {
    signedIn(["apple"]);
    mockConfirmWithApple.mockResolvedValue("apple-code");
    await expect(deleteMyAccount()).resolves.toBe("deleted");
    expect(mockDeleteAccount).toHaveBeenCalledWith("apple-code");
  });

  it("does nothing if the person closes Apple's confirmation", async () => {
    signedIn(["apple"]);
    mockConfirmWithApple.mockResolvedValue(null);
    await expect(deleteMyAccount()).resolves.toBe("cancelled");
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(useAppStore.getState().savedProducts).toHaveLength(1);
  });

  it("needs no Apple step for a Google account", async () => {
    signedIn(["google"]);
    await deleteMyAccount();
    expect(mockConfirmWithApple).not.toHaveBeenCalled();
    expect(mockDeleteAccount).toHaveBeenCalledWith(undefined);
  });

  it("forgets the account on the phone, and keeps the profile and history", async () => {
    signedIn(["google"]);
    await deleteMyAccount();
    const state = useAppStore.getState();
    expect(state.savedProducts).toEqual([]);
    expect(state.shelfQueue).toEqual([]);
    expect(state.parkedShelf).toBeNull();
    expect(state.shelfOwner).toBeNull();
    expect(state.profile.concerns).toEqual(["redness"]);
    expect(state.history).toHaveLength(1);
    expect(mockForget).toHaveBeenCalledTimes(1);
  });

  it("keeps everything when the server did not delete", async () => {
    signedIn(["google"]);
    mockDeleteAccount.mockResolvedValue({ ok: false, reason: "network" });
    await expect(deleteMyAccount()).resolves.toBe("network");
    expect(useAppStore.getState().savedProducts).toHaveLength(1);
    expect(mockForget).not.toHaveBeenCalled();
  });

  it("reports an Apple problem as Apple's, with nothing deleted", async () => {
    signedIn(["apple"]);
    mockConfirmWithApple.mockResolvedValue("apple-code");
    mockDeleteAccount.mockResolvedValue({ ok: false, reason: "apple_not_configured" });
    await expect(deleteMyAccount()).resolves.toBe("apple");
    expect(mockForget).not.toHaveBeenCalled();
  });
});

describe("the export", () => {
  it("is JSON with the shelf, notes and routine steps, and says what it leaves out", () => {
    const doc = exportDocument(
      "jane@example.com",
      "Google",
      {
        products: [{ productId: "a", savedAt: "2026-09-01T00:00:00Z", formulaFetchedAt: null, note: 'Loved it, "really"\nwould rebuy', routineStep: 2 }],
        ingredients: [{ inciName: "niacinamide", savedAt: "2026-09-02T00:00:00Z" }],
        added: [{ productId: "ocr-8801234567890", addedAt: "2026-09-03T00:00:00Z" }],
      },
      new Date("2026-09-24T00:00:00Z"),
      "2026-09-01T00:00:00.000Z",
    );
    const roundTripped = JSON.parse(JSON.stringify(doc));
    // The first-page flag (#230) is the account's data too.
    expect(roundTripped.account.journalStartedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(roundTripped.savedProducts[0]).toEqual({
      productId: "a",
      savedAt: "2026-09-01T00:00:00Z",
      formulaFetchedAt: null,
      note: 'Loved it, "really"\nwould rebuy',
      routineStep: 2,
    });
    expect(roundTripped.savedIngredients).toEqual([{ inciName: "niacinamide", savedAt: "2026-09-02T00:00:00Z" }]);
    // The products this account added (#241) are its data too.
    expect(roundTripped.productsYouAdded).toEqual([{ productId: "ocr-8801234567890", addedAt: "2026-09-03T00:00:00Z" }]);
    expect(roundTripped.notIncluded).toMatch(/scan history and skin profile/);
  });
});

describe("the account screen", () => {
  it("confirms before deleting, and says what goes and what stays", async () => {
    signedIn(["google"]);
    await render(<Account />);
    await act(async () => fireEvent.press(screen.getByText("Delete my account")));
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    expect(screen.getByText(DELETE_WARNING)).toBeTruthy();
    expect(DELETE_WARNING).toMatch(/shelf, notes, routine steps/);
    expect(DELETE_WARNING).toMatch(/scan history and skin profile stay/);

    await act(async () => fireEvent.press(screen.getByText("Keep my account")));
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  // #275 review: a double tap ran the delete twice.
  it("deletes once for a double tap on the confirmation", async () => {
    signedIn(["google"]);
    let finish: (value: unknown) => void = () => {};
    mockDeleteAccount.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await render(<Account />);
    await act(async () => fireEvent.press(screen.getByText("Delete my account")));
    // The row and the sheet's button now read the same (v9); the sheet is drawn last.
    const confirm = screen.getAllByText("Delete my account").at(-1)!;
    await act(async () => {
      fireEvent.press(confirm);
      fireEvent.press(confirm);
    });
    await act(async () => finish({ ok: true }));
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it("deletes once confirmed, and says so", async () => {
    signedIn(["google"]);
    mockForget.mockImplementationOnce(async () => {
      useAuth.setState({ status: "signed-out", session: null });
    });
    await render(<Account />);
    await act(async () => fireEvent.press(screen.getByText("Delete my account")));
    // The row and the sheet's button now read the same (v9); the sheet is drawn last.
    const confirm = screen.getAllByText("Delete my account").at(-1)!;
    await act(async () => fireEvent.press(confirm));
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByText(ACCOUNT_DELETED)).toBeTruthy();
  });
});

// "Delete my profile" moved here from Profile (owner): signed out, it erases
// the profile, shelf and history on this phone.
describe("deleting the profile, signed out", () => {
  beforeEach(() => {
    useAuth.setState({ status: "signed-out", session: null });
    useAppStore.setState({ hasSeenOnboarding: true });
  });

  it("asks first, and keeps everything on Keep my profile", async () => {
    await render(<Account />);
    await act(async () => fireEvent.press(screen.getByText("Delete my profile")));
    expect(screen.getByText(ERASE_WARNING)).toBeTruthy();
    // The tap that opened the sheet must not itself have erased anything.
    expect(useAppStore.getState().profile.concerns).toEqual(["redness"]);

    await act(async () => fireEvent.press(screen.getByText("Keep my profile")));
    expect(useAppStore.getState().profile.concerns).toEqual(["redness"]);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("erases the profile, shelf and history once confirmed, and goes back to the intro", async () => {
    await render(<Account />);
    await act(async () => fireEvent.press(screen.getByText("Delete my profile")));
    await act(async () => fireEvent.press(screen.getByText("Yes, delete my profile")));

    expect(useAppStore.getState()).toMatchObject({
      profile: EMPTY_PROFILE,
      savedProducts: [],
      history: [],
      hasSeenOnboarding: false,
    });
    expect(mockReplace).toHaveBeenCalledWith("/onboarding");
    // The "erased" notice travels in memory, never in a URL a link could set (#29).
    expect(profileErasedNoticePending()).toBe(true);
  });

  it("offers deleting the account instead once signed in", async () => {
    signedIn(["google"]);
    await render(<Account />);
    expect(screen.getByText("Delete my account")).toBeTruthy();
    expect(screen.queryByText("Delete my profile")).toBeNull();
  });
});
