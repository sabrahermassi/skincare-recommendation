import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import ProductRoute from "@/app/product/[id]";
import ResultRoute from "@/app/result/[id]";
import { fetchProduct } from "@/data/api";
import type { Ingredient } from "@/data/types";
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

// The result under the product's header (design_handoff_skincare_cards): a
// Safety tab the same for everyone, and a Skin match tab that needs the
// skin profile.
describe("the product screen's result tabs", () => {
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
  const row = (name: string) => screen.queryByLabelText(new RegExp(`^${name},`, "i"));

  afterEach(() => useAppStore.setState({ profile: EMPTY_PROFILE }));

  async function open(product: object = PRODUCT) {
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: product }));
    await render(<ProductRoute />);
    await act(async () => {});
  }
  // Skin match opens first (owner); these tests are about the Safety tab.
  const openSafety = async (product?: object) => {
    await open(product);
    await fireEvent.press(screen.getByRole("tab", { name: "Safety" }));
  };

  it("opens on Skin match, with a Safety tab the same without a profile and with two different ones", async () => {
    const profiles = [
      EMPTY_PROFILE,
      { concerns: ["dehydrated" as const], baseSkinType: "dry" as const, sensitivity: "high" as const, pregnancyStatus: null },
      { concerns: ["acne-prone" as const], baseSkinType: "oily" as const, sensitivity: "none" as const, pregnancyStatus: "pregnant" as const },
    ];
    for (const profile of profiles) {
      useAppStore.setState({ profile });
      await open();
      expect(screen.getByRole("tab", { name: "Skin match" }).props.accessibilityState).toMatchObject({ selected: true });
      await fireEvent.press(screen.getByRole("tab", { name: "Safety" }));
      expect(screen.getByText("6 ingredients")).toBeTruthy();
      expect(screen.getByLabelText(/^Irritation risk:/)).toBeTruthy();
      expect(screen.getByLabelText(/^Pore-clogging risk:/)).toBeTruthy();
      await act(async () => screen.unmount());
    }
  });

  // #379 review (Codex): a new product id on the same screen starts on the
  // opening tab (Skin match, #382), not on the last product's tab.
  it("goes back to Skin match when a different product opens on the same screen", async () => {
    await open();
    await fireEvent.press(screen.getByRole("tab", { name: "Safety" }));
    expect(screen.getByRole("tab", { name: "Safety" }).props.accessibilityState).toMatchObject({ selected: true });
    mockParams = { id: "obf-8809999999999" };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: { ...PRODUCT, id: "obf-8809999999999", barcode: "8809999999999" } }));
    await screen.rerender(<ProductRoute />);
    await act(async () => {});
    expect(screen.getByRole("tab", { name: "Skin match" }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it("puts what to avoid first, and opens an ingredient when tapped", async () => {
    await openSafety();
    const labels = screen.getAllByRole("button").map((b) => String(b.props.accessibilityLabel ?? ""));
    const rows = labels.filter((l) => /^(some banned dye|water|parfum),/i.test(l));
    expect(rows[0]).toMatch(/^some banned dye,/i);
    await fireEvent.press(row("parfum")!);
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/ingredient/[inci]" }));
  });

  it("filters the list to the watch-outs", async () => {
    await openSafety();
    await fireEvent.press(screen.getByLabelText("Filter: All"));
    await fireEvent.press(screen.getByRole("radio", { name: "Watch-outs, 2" }));
    expect(screen.getByLabelText("Filter: Watch-outs")).toBeTruthy();
    expect(row("parfum")).toBeTruthy();
    expect(row("water")).toBeNull();
  });

  it("shows the first eight rows of a long list, then all of them", async () => {
    const long = { ...PRODUCT, ingredients: Array.from({ length: 10 }, (_, i) => ingredient(`plain ${i}`)) };
    await openSafety(long);
    expect(row("plain 8")).toBeNull();
    await fireEvent.press(screen.getByText("Show all 10 ingredients"));
    expect(row("plain 9")).toBeTruthy();
  });

  it("doesn't say 'Nothing restricted' on the irritation card beside a fragrance to watch", async () => {
    const scented = { ...PRODUCT, ingredients: PRODUCT.ingredients.filter((i) => i.safety === "safe") };
    useAppStore.setState({
      profile: { concerns: ["dehydrated"], baseSkinType: "normal", sensitivity: "none", pregnancyStatus: null },
    });
    await openSafety(scented);
    expect(screen.getByText("1 common irritant")).toBeTruthy();
    expect(screen.queryByText("Nothing restricted")).toBeNull();
  });

  it("warns about what to avoid while pregnant, only for someone who is", async () => {
    const retinoid = { ...PRODUCT, ingredients: [...PRODUCT.ingredients, ingredient("retinol")] };
    await openSafety(retinoid);
    expect(screen.queryByText("While pregnant or breastfeeding")).toBeNull();
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, pregnancyStatus: "pregnant" } });
    await openSafety(retinoid);
    expect(screen.getByText("While pregnant or breastfeeding")).toBeTruthy();
  });

  // #346: no profile, no empty score — the quiz, until the answers score.
  it("asks for the skin profile on Skin match, and shows the score once the answers score", async () => {
    await open();
    await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
    expect(screen.getByText("See your skin match")).toBeTruthy();
    expect(screen.queryByLabelText("Why this score")).toBeNull();
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dehydrated"] } });
    await open();
    await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
    expect(screen.queryByText("See your skin match")).toBeNull();
    expect(screen.getByText("For your concerns")).toBeTruthy();
    expect(screen.getByText("Flagged for your skin")).toBeTruthy();
  });

  it("explains the score in a sheet from its i button", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dehydrated"] } });
    await open();
    await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
    expect(screen.queryByText("How scoring works")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Why this score"));
    expect(screen.getByText("How scoring works")).toBeTruthy();
  });

  it("keeps asking while the answers given don't score yet", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, sensitivity: "some" } });
    await open();
    await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
    expect(screen.getByText("See your skin match")).toBeTruthy();
  });
});

// Opened from the finder's results, a product scores with the finder's answers,
// so it shows the number its row showed (owner); from anywhere else, the skin profile.
describe("the product screen opened from the finder", () => {
  const { useFinderChoices } = require("@/lib/finder-choices") as typeof import("@/lib/finder-choices");
  const { matchProduct } = require("@/lib/matching") as typeof import("@/lib/matching");
  const ingredient = (name: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true });
  const PRODUCT = {
    id: "obf-8801234567890",
    barcode: "8801234567890",
    brand: "Brand",
    name: "Serum",
    type: "serum" as const,
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
    ingredients: ["water", "glycerin", "niacinamide", "butylene glycol", "sodium hyaluronate"].map(ingredient),
  };
  const FINDER = { ...EMPTY_PROFILE, concerns: ["hyperpigmentation" as const] };
  const OWN = { ...EMPTY_PROFILE, baseSkinType: "oily" as const, concerns: ["acne-prone" as const], sensitivity: "high" as const };

  afterEach(() => {
    useAppStore.setState({ profile: EMPTY_PROFILE, history: [] });
    useFinderChoices.setState({ choices: EMPTY_PROFILE });
  });

  async function open(from?: string) {
    useAppStore.setState({ profile: OWN, history: [] });
    useFinderChoices.setState({ choices: FINDER });
    mockParams = from ? { id: PRODUCT.id, from } : { id: PRODUCT.id };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: PRODUCT }));
    await render(<ProductRoute />);
    await act(async () => {});
  }

  it("shows the finder's score, and the skin profile's anywhere else", async () => {
    const finderScore = matchProduct(PRODUCT, FINDER).score;
    const ownScore = matchProduct(PRODUCT, OWN).score;
    expect(finderScore).not.toBe(ownScore);

    await open("finder");
    expect(screen.getByText(String(finderScore))).toBeTruthy();
    await act(async () => screen.unmount());

    await open();
    expect(screen.getByText(String(ownScore))).toBeTruthy();
  });

  it("speaks only to the finder's concerns", async () => {
    await open("finder");
    expect(screen.getByText("Dark spots")).toBeTruthy();
    expect(screen.queryByText("Acne or pimples")).toBeNull();
  });

  it("still logs the skin profile's score in History", async () => {
    await open("finder");
    expect(useAppStore.getState().history[0]?.scoreAtView).toBe(matchProduct(PRODUCT, OWN).score);
  });

  // A safety note for the person holding the phone: not lost because the
  // finder didn't ask, and the number still matches the row (#384 review).
  it("keeps the skin profile's pregnancy caution when the finder left it unanswered", async () => {
    const pregnant = { ...OWN, pregnancyStatus: "pregnant" as const };
    const retinoid = { ...PRODUCT, ingredients: [...PRODUCT.ingredients, ingredient("retinol")] };
    useAppStore.setState({ profile: pregnant, history: [] });
    useFinderChoices.setState({ choices: FINDER });
    mockParams = { id: PRODUCT.id, from: "finder" };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: retinoid }));
    await render(<ProductRoute />);
    await act(async () => {});
    expect(screen.getByText(String(matchProduct(retinoid, FINDER).score))).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Safety" }));
    expect(screen.getByText("While pregnant or breastfeeding")).toBeTruthy();
  });

  // Finder answers that don't score (sensitivity only) give the row no number;
  // the page uses the skin profile, which its "Find my match" can change.
  it("uses the skin profile when the finder's answers don't score", async () => {
    useAppStore.setState({ profile: OWN, history: [] });
    useFinderChoices.setState({ choices: { ...EMPTY_PROFILE, sensitivity: "some" } });
    mockParams = { id: PRODUCT.id, from: "finder" };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: PRODUCT }));
    await render(<ProductRoute />);
    await act(async () => {});
    expect(screen.queryByText("See your skin match")).toBeNull();
    expect(screen.getByText(String(matchProduct(PRODUCT, OWN).score))).toBeTruthy();
  });

  it("opens an ingredient with the same answers", async () => {
    await open("finder");
    await fireEvent.press(screen.getByRole("tab", { name: "Safety" }));
    await fireEvent.press(screen.getByLabelText(/^Niacinamide,/));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/ingredient/[inci]",
      params: { inci: "niacinamide", product: PRODUCT.id, from: "finder" },
    });
  });
});
