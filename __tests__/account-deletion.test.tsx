import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Session } from "@supabase/supabase-js";

/**
 * Deleting the account and exporting it (#224), from the phone's side. The
 * server function's own rules are pinned in supabase/tests/delete_account.test.ts.
 */

jest.setTimeout(30000);

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
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
const { default: Account, DELETE_WARNING, ACCOUNT_DELETED } = require("@/app/account") as typeof import("@/app/account");

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
      },
      new Date("2026-09-24T00:00:00Z"),
    );
    const roundTripped = JSON.parse(JSON.stringify(doc));
    expect(roundTripped.savedProducts[0]).toEqual({
      productId: "a",
      savedAt: "2026-09-01T00:00:00Z",
      formulaFetchedAt: null,
      note: 'Loved it, "really"\nwould rebuy',
      routineStep: 2,
    });
    expect(roundTripped.savedIngredients).toEqual([{ inciName: "niacinamide", savedAt: "2026-09-02T00:00:00Z" }]);
    expect(roundTripped.notIncluded).toMatch(/scan history and skin profile/);
  });
});

describe("the account screen", () => {
  it("confirms before deleting, and says what goes and what stays", async () => {
    signedIn(["google"]);
    await render(<Account />);
    await act(async () => fireEvent.press(screen.getByText("Delete my account")));
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(screen.getByText(DELETE_WARNING)).toBeTruthy();
    expect(DELETE_WARNING).toMatch(/shelf, notes, routine steps/);
    expect(DELETE_WARNING).toMatch(/scan history and skin profile stay/);

    await act(async () => fireEvent.press(screen.getByText("Cancel")));
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("deletes once confirmed, and says so", async () => {
    signedIn(["google"]);
    mockForget.mockImplementationOnce(async () => {
      useAuth.setState({ status: "signed-out", session: null });
    });
    await render(<Account />);
    await act(async () => fireEvent.press(screen.getByText("Delete my account")));
    const confirm = screen.getAllByText("Delete my account").at(-1)!;
    await act(async () => fireEvent.press(confirm));
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByText(ACCOUNT_DELETED)).toBeTruthy();
  });
});
