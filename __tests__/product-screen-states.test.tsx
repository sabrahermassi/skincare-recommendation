import { act, fireEvent, render, screen } from "@testing-library/react-native";

import ProductRoute from "@/app/product/[id]";
import ResultRoute from "@/app/result/[id]";
import { fetchProduct } from "@/data/api";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * #155: the product screen's states before there is a product to show —
 * loading, a request that failed, and the catalogue answering "no such
 * product" — which a pure-logic test can't see. The scan's result route is
 * the same screen, so it must behave the same way.
 */

// The first render loads the screen's whole module graph.
jest.setTimeout(30_000);

let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  // What a loaded product's screen reaches for (#327's tests open one).
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  fetchProduct: jest.fn(),
  peekProducts: () => undefined,
}));

type FetchMock = {
  mockReturnValueOnce(value: unknown): FetchMock;
  mockClear(): void;
  mock: { calls: unknown[][] };
};
const fetched = fetchProduct as unknown as FetchMock;

beforeEach(() => {
  fetched.mockClear();
  mockParams = { id: "obf-8801234567890" };
});

describe.each([
  ["the product screen", ProductRoute],
  ["the scan's result screen", ResultRoute],
])("%s", (_name: string, Screen: () => React.JSX.Element) => {
  it("shows a spinner while the product loads, and nothing claiming it doesn't exist", async () => {
    fetched.mockReturnValueOnce(new Promise(() => undefined));
    await render(<Screen />);
    expect(screen.getByLabelText("Loading the product")).toBeTruthy();
    expect(screen.queryByText("Product not found")).toBeNull();
  });

  it("says it couldn't load, not that the product doesn't exist, and tries again", async () => {
    fetched.mockReturnValueOnce(Promise.resolve({ ok: false, failure: { kind: "offline" } }));
    await render(<Screen />);
    await act(async () => {});

    expect(screen.getByText("Couldn't load this product")).toBeTruthy();
    expect(screen.queryByText("Product not found")).toBeNull();

    fetched.mockReturnValueOnce(new Promise(() => undefined));
    await fireEvent.press(screen.getByText("Try again"));
    expect(fetched.mock.calls.length).toBe(2);
    expect(fetched.mock.calls[1][0]).toBe("obf-8801234567890");
  });

  it("says Product not found only when the catalogue answers that", async () => {
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: null }));
    await render(<Screen />);
    await act(async () => {});

    expect(screen.getByText("Product not found")).toBeTruthy();
    expect(screen.getByText("Search instead")).toBeTruthy();
    expect(screen.queryByText("Couldn't load this product")).toBeNull();
  });
});

// #327: a loaded product ends with a quiet "Report a mistake" link, when
// there is a support address to send it to.
describe("the product screen's Report a mistake link", () => {
  const original = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  afterEach(() => {
    // Assigning undefined would store the string "undefined", which reads as an address.
    if (original === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
    else process.env.EXPO_PUBLIC_SUPPORT_EMAIL = original;
  });

  const PRODUCT = {
    id: "obf-8801234567890",
    barcode: "8801234567890",
    brand: "Brand",
    name: "Toner",
    type: "toner",
    productType: "toner",
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    fetchedAt: "2026-09-26T00:00:00Z",
    ingredientIds: [],
    inStock: true,
    ingredients: [],
  };

  async function open() {
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: PRODUCT }));
    await render(<ProductRoute />);
    await act(async () => {});
  }

  it("shows the link when a support address is set", async () => {
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL = "help@example.com";
    await open();
    expect(screen.getAllByText("Toner").length).toBeGreaterThan(0);
    expect(screen.getByText("Report a mistake")).toBeTruthy();
  });

  it("hides it when none is", async () => {
    delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
    await open();
    expect(screen.getAllByText("Toner").length).toBeGreaterThan(0);
    expect(screen.queryByText("Report a mistake")).toBeNull();
  });
});

// #345: the Ingredient check at the top of every loaded product, the same
// with or without a skin profile, opening the ingredient list.
describe("the product screen's Ingredient check", () => {
  const ingredient = (name: string, overrides: object = {}) => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides });
  const PRODUCT = {
    id: "obf-8801234567890",
    barcode: "8801234567890",
    brand: "Brand",
    name: "Serum",
    type: "serum",
    productType: "serum",
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    fetchedAt: "2026-09-26T00:00:00Z",
    ingredientIds: [],
    inStock: true,
    ingredients: [
      ...["water", "glycerin", "xanthan gum", "butylene glycol"].map((name) => ingredient(name)),
      ingredient("parfum"),
      ingredient("some banned dye", { safety: "avoid" }),
    ],
  };

  afterEach(() => useAppStore.setState({ profile: EMPTY_PROFILE }));

  async function open() {
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: PRODUCT }));
    await render(<ProductRoute />);
    await act(async () => {});
  }

  it("shows the same check without a profile and with two different ones", async () => {
    const profiles = [
      EMPTY_PROFILE,
      { concerns: ["dehydrated" as const], baseSkinType: "dry" as const, sensitivity: "high" as const, pregnancyStatus: null },
      { concerns: ["acne-prone" as const], baseSkinType: "oily" as const, sensitivity: "none" as const, pregnancyStatus: "pregnant" as const },
    ];
    for (const profile of profiles) {
      useAppStore.setState({ profile });
      await open();
      expect(screen.getByLabelText("Ingredient check: 1 to avoid · 1 to watch")).toBeTruthy();
      await act(async () => screen.unmount());
    }
  });

  it("opens the ingredient list when tapped", async () => {
    await open();
    expect(screen.queryByText("Close")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Ingredient check: 1 to avoid · 1 to watch"));
    expect(screen.getByText("Close")).toBeTruthy();
  });

  // #346: no profile, no empty score — the quiz, until the answers score.
  it("offers See your skin match with no profile, and hides it once the answers score", async () => {
    await open();
    expect(screen.getByText("See your skin match")).toBeTruthy();
    expect(screen.queryByText("Why this score")).toBeNull();
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dehydrated"] } });
    await open();
    expect(screen.queryByText("See your skin match")).toBeNull();
    expect(screen.getByText("Why this score")).toBeTruthy();
  });

  it("keeps the card while the answers given don't score yet", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, sensitivity: "some" } });
    await open();
    expect(screen.getByText("See your skin match")).toBeTruthy();
  });
});
