import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * "The first page of your journal" (#230): once per account — on the
 * account, not the shelf's length — after the save itself, and never while
 * the sign-in sheet is up.
 */

jest.setTimeout(30000);

const mockPush = jest.fn();
let mockFocused = true;
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useIsFocused: () => mockFocused,
}));

const mockUpdateUser = jest.fn();
jest.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { updateUser: (...args: unknown[]) => mockUpdateUser(...args) } },
}));

const { useAuth } = require("@/lib/auth") as typeof import("@/lib/auth");
const saving = require("@/lib/saving") as typeof import("@/lib/saving");
const firstPage = require("@/lib/first-page") as typeof import("@/lib/first-page");
const { FirstPageMoment } = require("@/components/FirstPageMoment") as typeof import("@/components/FirstPageMoment");
const { useAppStore } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");

const { FIRST_PAGE_COPY, JOURNAL_STARTED_KEY } = firstPage;

function signIn(id: string, metadata: Record<string, unknown> = {}) {
  useAuth.setState({ status: "signed-in", session: { user: { id, user_metadata: metadata } } as never });
}

const saveProduct = (id: string) => saving.saveFromTap(() => useAppStore.getState().saveProduct(id), "product");
const showing = () => firstPage.useFirstPage.getState().showing;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateUser.mockResolvedValue({ data: {}, error: null });
  mockFocused = true;
  firstPage.dismissFirstPage();
  useAuth.setState({ status: "signed-out", session: null });
  useAppStore.setState({ savedProducts: [], savedIngredients: [], journalStarted: [], shelfOwner: null, shelfQueue: [] });
});

describe("when the moment comes", () => {
  it("comes on an account's first saved product, and tells the account", () => {
    signIn("u1");
    saveProduct("a");
    expect(showing()).toBe(true);
    expect(useAppStore.getState().journalStarted).toEqual(["u1"]);
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { [JOURNAL_STARTED_KEY]: expect.any(String) } });
  });

  it("comes once — not again after the shelf is emptied and refilled", () => {
    signIn("u1");
    saveProduct("a");
    firstPage.dismissFirstPage();
    useAppStore.getState().toggleSaved("a");
    expect(useAppStore.getState().savedProducts).toEqual([]);
    saveProduct("b");
    expect(showing()).toBe(false);
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  });

  it("still comes after a guest's shelf was carried in at sign-in", () => {
    useAppStore.setState({ savedProducts: [{ id: "old", savedAt: 1 }], shelfOwner: "u1" });
    signIn("u1");
    saveProduct("new");
    expect(showing()).toBe(true);
  });

  it("doesn't come for an account that had it on another phone", () => {
    signIn("u1", { [JOURNAL_STARTED_KEY]: "2026-09-01T00:00:00.000Z" });
    saveProduct("a");
    expect(showing()).toBe(false);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("doesn't come for a starred ingredient", () => {
    signIn("u1");
    saving.saveFromTap(() => useAppStore.getState().saveIngredient("niacinamide"), "ingredient");
    expect(showing()).toBe(false);
  });

  it("doesn't come for a guest's save, which has no account yet, and waits for the first one signed in (#300)", () => {
    saveProduct("a");
    expect(useAppStore.getState().savedProducts.map((p) => p.id)).toEqual(["a"]);
    expect(showing()).toBe(false);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    signIn("u1");
    saveProduct("b");
    expect(showing()).toBe(true);
  });
});

describe("catching the account up", () => {
  it("tells the account on the next session when the first write didn't land", () => {
    useAppStore.setState({ journalStarted: ["u1"] });
    const stop = firstPage.startFirstPage();
    signIn("u1");
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    // The write lands as a session whose metadata has the key: nothing more.
    signIn("u1", { [JOURNAL_STARTED_KEY]: "2026-09-24T00:00:00.000Z" });
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    stop();
  });

  it("never writes for an account this phone hasn't shown it to", () => {
    const stop = firstPage.startFirstPage();
    signIn("u2");
    expect(mockUpdateUser).not.toHaveBeenCalled();
    stop();
  });
});

describe("on screen", () => {
  it("shows under the header while the product screen has the focus", async () => {
    firstPage.useFirstPage.setState({ showing: true });
    await render(<FirstPageMoment />);
    expect(screen.getByText(FIRST_PAGE_COPY.heading)).toBeTruthy();
  });

  it("goes on 'Got it'", async () => {
    firstPage.useFirstPage.setState({ showing: true });
    await render(<FirstPageMoment />);
    await act(async () => fireEvent.press(screen.getByText(FIRST_PAGE_COPY.dismiss)));
    expect(screen.queryByText(FIRST_PAGE_COPY.heading)).toBeNull();
    expect(showing()).toBe(false);
  });

  it("counts leaving the screen as seen, so it can't turn up on the next product", async () => {
    firstPage.useFirstPage.setState({ showing: true });
    const view = await render(<FirstPageMoment />);
    mockFocused = false;
    await view.rerender(<FirstPageMoment />);
    expect(showing()).toBe(false);
  });
});
