import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Share } from "react-native";

import ProductRoute from "@/app/product/[id]";
import ResultRoute from "@/app/result/[id]";
import { fetchProduct } from "@/data/api";
import type { Ingredient } from "@/data/types";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/** With no skin profile a sheet rises over the result (v9) and nothing behind it can be reached: put it away. */
async function putTeaserAway() {
  const close = screen.queryByRole("button", { name: "Close" });
  if (close) await fireEvent.press(close);
}

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
    expect(screen.getByRole("button", { name: "Scan another" })).toBeTruthy();
    expect(screen.queryByText("Search instead")).toBeNull();
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
    ingredients: [],
  };

  async function open() {
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: PRODUCT }));
    await render(<ProductRoute />);
    await act(async () => {});
    await putTeaserAway();
  }

  it("shows the link on the Ingredients tab when a support address is set", async () => {
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL = "help@example.com";
    await open();
    expect(screen.getAllByText("Toner").length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));
    expect(screen.getByText("Report a mistake")).toBeTruthy();
  });

  // Owner (v9): the button is there before anything receives a report.
  it("shows it when none is, too", async () => {
    delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
    await open();
    expect(screen.getAllByText("Toner").length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));
    expect(screen.getByText("Report a mistake")).toBeTruthy();
  });
});

// The result under the product's header (design_handoff_skincare_cards): a
// Ingredients tab the same for everyone, and a Skin match tab that needs the
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
    await putTeaserAway();
  }
  // Skin match opens first (owner); these tests are about the Ingredients tab.
  const openSafety = async (product?: object) => {
    await open(product);
    await fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));
  };

  it("opens on Skin match, with an Ingredients tab the same without a profile and with two different ones", async () => {
    const profiles = [
      EMPTY_PROFILE,
      { concerns: ["dehydrated" as const], baseSkinType: "dry" as const, sensitivity: "high" as const, pregnancyStatus: null },
      { concerns: ["acne-prone" as const], baseSkinType: "oily" as const, sensitivity: "none" as const, pregnancyStatus: "pregnant" as const },
    ];
    for (const profile of profiles) {
      useAppStore.setState({ profile });
      await open();
      expect(screen.getByRole("tab", { name: "Skin match" }).props.accessibilityState).toMatchObject({ selected: true });
      await fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));
      expect(screen.getByRole("header", { name: "Ingredients" })).toBeTruthy();
      expect(screen.getByLabelText(/^Irritation risk:/)).toBeTruthy();
      expect(screen.getByLabelText(/^Pore-clogging risk:/)).toBeTruthy();
      await act(async () => screen.unmount());
    }
  });

  // #379 review (Codex): a new product id on the same screen starts on the
  // opening tab (Skin match, #382), not on the last product's tab.
  it("goes back to Skin match when a different product opens on the same screen", async () => {
    await open();
    await fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));
    expect(screen.getByRole("tab", { name: "Ingredients" }).props.accessibilityState).toMatchObject({ selected: true });
    mockParams = { id: "obf-8809999999999" };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: { ...PRODUCT, id: "obf-8809999999999", barcode: "8809999999999" } }));
    await screen.rerender(<ProductRoute />);
    await act(async () => {});
    // A new product, so the sheet rises again.
    await putTeaserAway();
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
    await fireEvent.press(screen.getByRole("radio", { name: "Watch-outs" }));
    expect(screen.getByLabelText("Filter: Watch-outs")).toBeTruthy();
    expect(row("parfum")).toBeTruthy();
    expect(row("water")).toBeNull();
  });

  // The pore-clogging row counts disputed names ("2 ingredients, mixed
  // evidence"); the list it opens used to leave them out and say "Nothing
  // here clogs pores" under that count (owner, 2 October 2026).
  it("lists the disputed pore-cloggers the risk row counts, and says why each is there", async () => {
    const disputed = { ...PRODUCT, ingredients: ["water", "shea butter", "glycerin", "beeswax", "panthenol"].map((name) => ingredient(name)) };
    await openSafety(disputed);
    await fireEvent.press(screen.getByRole("button", { name: /^Pore-clogging risk: Contested\. 2 ingredients, mixed evidence/ }));
    expect(screen.getByLabelText("Filter: Pore-clogging")).toBeTruthy();
    expect(row("shea butter")).toBeTruthy();
    expect(row("beeswax")).toBeTruthy();
    expect(row("glycerin")).toBeNull();
    expect(screen.queryByText("Nothing here clogs pores.")).toBeNull();
    expect(screen.getAllByText("Disputed: sources disagree on whether it clogs pores")).toHaveLength(2);
  });

  it("shows the first five rows of a long list, then all of them (v7)", async () => {
    const long = { ...PRODUCT, ingredients: Array.from({ length: 10 }, (_, i) => ingredient(`plain ${i}`)) };
    await openSafety(long);
    expect(row("plain 5")).toBeNull();
    // Nothing left is flagged, so the button says so (v9).
    await fireEvent.press(screen.getByRole("button", { name: "5 more, no concerns" }));
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
    expect(screen.queryByText("Best avoided while pregnant")).toBeNull();
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, pregnancyStatus: "pregnant" } });
    await openSafety(retinoid);
    expect(screen.getByText("Best avoided while pregnant")).toBeTruthy();
  });

  // #346: no profile, no empty score — the quiz, until the answers score.
  it("asks for the skin profile on Skin match, and shows the score once the answers score", async () => {
    // The teaser sheet rises over the result (v9), with the way to the quiz.
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: PRODUCT }));
    await render(<ProductRoute />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Take the 1-minute quiz" })).toBeTruthy();
    // Put away, the tab's own card asks the same.
    await putTeaserAway();
    await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
    expect(screen.getAllByText("Is it right for your skin?").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("score-ring")).toBeNull();
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dehydrated"] } });
    await open();
    await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
    expect(screen.queryByText("Is it right for your skin?")).toBeNull();
    expect(screen.getByTestId("score-ring")).toBeTruthy();
    // One result for everyone with a profile (v9): a title saying how it fits, then the reasons.
    expect(screen.getByText(/^(This makes sense for you|Could work for you|Probably not for you)$/)).toBeTruthy();
  });

  it("opens How scoring works from the verdict pill (v7)", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dehydrated"] } });
    await open();
    await fireEvent.press(screen.getByLabelText(/How scoring works$/));
    // With the score, so the page can mark where it sits.
    expect(router.push).toHaveBeenLastCalledWith({ pathname: "/scoring", params: { score: expect.stringMatching(/^\d+$/) } });
  });

  it("keeps asking while the answers given don't score yet", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, sensitivity: "some" } });
    await open();
    await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
    expect(screen.getAllByText("Is it right for your skin?").length).toBeGreaterThan(0);
  });
});

// Opened from Skin needs: a path of its own (owner, 2 October 2026). Skin match
// there says whether the product holds an active for what was picked, in
// words, with no score; every other way in keeps the skin profile's match.
describe("the product screen opened from the journey", () => {
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
    ingredients: ["water", "glycerin", "niacinamide", "butylene glycol", "sodium hyaluronate"].map(ingredient),
  };
  const OWN = { ...EMPTY_PROFILE, baseSkinType: "oily" as const, concerns: ["acne-prone" as const], sensitivity: "high" as const };

  afterEach(() => useAppStore.setState({ profile: EMPTY_PROFILE, history: [], savedProducts: [] }));

  async function open(params: Record<string, string>) {
    useAppStore.setState({ profile: OWN, history: [], savedProducts: [] });
    mockParams = { id: PRODUCT.id, ...params };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: PRODUCT }));
    await render(<ProductRoute />);
    await act(async () => {});
    await putTeaserAway();
  }

  it("answers whether it has an active for what was picked, with no score", async () => {
    await open({ from: "journey", need: "dark-marks.." });
    // Niacinamide works on dark marks; the ring and its number are gone.
    expect(screen.getByRole("header", { name: "Works on dark marks" })).toBeTruthy();
    // Not one the carousel showed for dark marks (SPF, vitamin C, AHA), though it works on them.
    expect(screen.getByText("It has an active for this, though not one of our top picks.")).toBeTruthy();
    expect(screen.queryByText(String(matchProduct(PRODUCT, OWN).score))).toBeNull();
    expect(screen.queryByText("/100")).toBeNull();
    expect(screen.queryByText(/recommendations for your skin/)).toBeNull();
    // The heart is the one save (v9): no second button under the result.
    expect(screen.queryByText("Save to my plan")).toBeNull();
    // History is the person's own log: it keeps the skin profile's score.
    expect(useAppStore.getState().history[0]?.scoreAtView).toBe(matchProduct(PRODUCT, OWN).score);
  });

  it("says a product with no active for the pick is not made for it, and what it is better for", async () => {
    await open({ from: "journey", need: "pimples.." });
    expect(screen.getByRole("header", { name: "Not made for pimples" })).toBeTruthy();
    expect(screen.getByText("It has none of the actives we suggest to clear pimples.")).toBeTruthy();
    expect(screen.getByText("We looked for:")).toBeTruthy();
    // Names keep their capitals mid-sentence only where they need them: "PHA", not "pHA".
    expect(screen.getByText(/We looked for: PHA, benzoyl peroxide or azelaic acid\./)).toBeTruthy();
    expect(screen.getAllByText("Better for:").length).toBeGreaterThan(0);
    // Hydration is not an active for pimples: the glycerin in it earns no green box.
    expect(screen.queryByText(/put water back in/)).toBeNull();
    // Pores are the point of this pick, so it says nothing in it clogs them.
    expect(screen.getByText("Nothing in it")).toBeTruthy();
  });

  it("counts hydration where hydration is the pick", async () => {
    await open({ from: "journey", need: "hydrate.." });
    expect(screen.getByRole("header", { name: "Works on dry skin" })).toBeTruthy();
    expect(screen.getByText(/put water back in/)).toBeTruthy();
  });

  it("shows the answer from Skin needs to someone with no skin profile", async () => {
    useAppStore.setState({ profile: EMPTY_PROFILE, history: [], savedProducts: [] });
    mockParams = { id: PRODUCT.id, from: "journey", need: "pimples.high.no" };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: PRODUCT }));
    await render(<ProductRoute />);
    await act(async () => {});
    expect(screen.queryByText("Is it right for your skin?")).toBeNull();
    // Very sensitive skin with pimples was shown niacinamide, which this serum has.
    expect(screen.getByRole("header", { name: "Works on pimples" })).toBeTruthy();
  });

  // design_handoff "october 3d", D: over-the-counter only.
  it("says to talk to a doctor first about a prescription active scanned from Skin needs, and offers the over-the-counter one", async () => {
    const gel = { ...PRODUCT, ingredients: ["water", "tretinoin", "glycerin"].map(ingredient) };
    useAppStore.setState({ profile: OWN, history: [], savedProducts: [] });
    mockParams = { id: PRODUCT.id, from: "journey", need: "lines..no" };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: gel }));
    await render(<ProductRoute />);
    await act(async () => {});
    expect(screen.getByRole("header", { name: "Talk to a doctor first" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Learn about retinol" })).toBeTruthy();
  });

  it("raises no doctor sheet for a prescription active scanned outside Skin needs", async () => {
    const gel = { ...PRODUCT, ingredients: ["water", "tretinoin", "glycerin"].map(ingredient) };
    useAppStore.setState({ profile: OWN, history: [], savedProducts: [] });
    mockParams = { id: PRODUCT.id };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: gel }));
    await render(<ProductRoute />);
    await act(async () => {});
    expect(screen.queryByRole("header", { name: "Talk to a doctor first" })).toBeNull();
  });

  it("names support once without counting it, and lets a strong pore-clogger hold a pores pick back", async () => {
    const product = { ...PRODUCT, ingredients: ["water", "salicylic acid", "centella asiatica extract", "isopropyl palmitate"].map(ingredient) };
    useAppStore.setState({ profile: OWN, history: [], savedProducts: [] });
    mockParams = { id: PRODUCT.id, from: "journey", need: "pimples.." };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: product }));
    await render(<ProductRoute />);
    await act(async () => {});
    // Salicylic acid would work on pimples; the pore-clogger beside it caps the answer.
    expect(screen.getByRole("header", { name: "Helps a little with pimples" })).toBeTruthy();
    expect(screen.getByText(/It also has an ingredient that can clog pores\./)).toBeTruthy();
    expect(screen.getByText(/is comedogenic and may clog pores/)).toBeTruthy();
    expect(screen.queryByText("Nothing in it")).toBeNull();
    expect(screen.getByText("Also in it:")).toBeTruthy();
    expect(screen.getByText(/which support skin but are not actives for this/)).toBeTruthy();
  });

  it("opens an ingredient from a Skin needs result without the saved profile's reading of it", async () => {
    await open({ from: "journey", need: "dark-marks.." });
    await fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));
    await fireEvent.press(screen.getByLabelText(/^Niacinamide,/));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/ingredient/[inci]", params: { inci: "niacinamide", product: PRODUCT.id, from: "journey" } });
  });

  it("logs a barcode scan that started in Skin needs as Scanned", async () => {
    await open({ from: "journey", need: "pimples..", scan: "barcode" });
    expect(useAppStore.getState().history[0]?.source).toBe("scanned");
  });

  it("shares the answer in words, never a score", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    await open({ from: "journey", need: "pimples.." });
    await fireEvent.press(screen.getByRole("button", { name: "Share this result" }));
    expect(share).toHaveBeenCalledWith({ message: "Brand Serum - not made for pimples, on for.me" });
    share.mockRestore();
  });

  it("falls back to the skin profile when the link's need is not one", async () => {
    await open({ from: "journey", need: "not-a-goal" });
    expect(screen.getByText(String(matchProduct(PRODUCT, OWN).score))).toBeTruthy();
  });

  // One result for everyone with a profile (v9): opened any other way, it
  // counts against the skin profile's own concerns instead.
  it("reads against the skin profile's concerns when opened any other way", async () => {
    await open({});
    expect(screen.getByText(/^It covers \d of the \d recommendations for your skin\.$/)).toBeTruthy();
    // Nothing in it works on acne, the profile's one concern.
    expect(screen.getAllByText(/it won.t work on your acne on its own/).length).toBeGreaterThan(0);
  });

  it("logs a scan as Scanned and anything else as Opened", async () => {
    await open({ from: "barcode" });
    expect(useAppStore.getState().history[0]?.source).toBe("scanned");
    await act(async () => screen.unmount());
    await open({});
    expect(useAppStore.getState().history[0]?.source).toBe("opened");
  });
});

// Owner, 29 September 2026: the header is brand, name and type, with no stock line.
it("heads the product with its brand, name and type, and no Out of stock", async () => {
  const product = {
    id: "obf-8801234567890",
    barcode: "8801234567890",
    brand: "Sooyun",
    name: "Rice Serum",
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
    ingredients: [],
  };
  fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: product }));
  await render(<ProductRoute />);
  await act(async () => {});
  expect(screen.getByText("Sooyun")).toBeTruthy();
  expect(screen.getByText("Rice Serum")).toBeTruthy();
  expect(screen.getByText("Serum")).toBeTruthy();
  expect(screen.queryByText("Out of stock")).toBeNull();
});

// "Add to <step>" (owner, 3 October 2026): the one place a product is added, for a scan started from a routine step.
describe("the product screen opened from a routine step", () => {
  const ingredient = (name: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true });
  const SERUM = {
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
    ingredients: ["water", "glycerin", "niacinamide"].map(ingredient),
  };

  beforeEach(() => useAppStore.setState({ routinePicks: {}, profile: { ...EMPTY_PROFILE, baseSkinType: "oily" as const }, history: [], savedProducts: [] }));
  afterEach(() => useAppStore.setState({ routinePicks: {}, profile: EMPTY_PROFILE, history: [], savedProducts: [] }));

  async function open(params: Record<string, string>, product: object = SERUM) {
    mockParams = { id: SERUM.id, ...params };
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: product }));
    await render(<ProductRoute />);
    await act(async () => {});
    await putTeaserAway();
  }

  it("offers to add a product that belongs in the step, puts it there, and takes it out again", async () => {
    await open({ from: "barcode", step: "morning:serum" });
    await fireEvent.press(screen.getByRole("button", { name: "Add to morning serum" }));
    expect(useAppStore.getState().routinePicks).toEqual({ "morning:serum": SERUM.id });
    expect(screen.getByText("In your routine · Morning serum")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Remove from morning serum" }));
    expect(useAppStore.getState().routinePicks).toEqual({});
  });

  it("takes the product out of the step it was scanned from only", async () => {
    useAppStore.setState({ routinePicks: { "morning:serum": SERUM.id, "evening:treatment": SERUM.id } });
    await open({ from: "barcode", step: "morning:serum" });
    await fireEvent.press(screen.getByRole("button", { name: "Remove from morning serum" }));
    expect(useAppStore.getState().routinePicks).toEqual({ "evening:treatment": SERUM.id });
  });

  it("takes the place of the product picked for that step before", async () => {
    useAppStore.setState({ routinePicks: { "morning:serum": "another" } });
    await open({ from: "barcode", step: "morning:serum" });
    await fireEvent.press(screen.getByRole("button", { name: "Add to morning serum" }));
    expect(useAppStore.getState().routinePicks).toEqual({ "morning:serum": SERUM.id });
  });

  it("names the time of day for a step both routines have", async () => {
    const MOISTURISER = { ...SERUM, type: "moisturizer" as const, productType: "moisturizer", name: "Cream" };
    await open({ from: "barcode", step: "evening:moisturise" }, MOISTURISER);
    expect(screen.getByRole("button", { name: "Add to evening moisturiser" })).toBeTruthy();
  });

  it("says why a product is not offered for a step it does not belong in", async () => {
    await open({ from: "barcode", step: "morning:sunscreen" });
    expect(screen.getByText("This doesn't belong in the morning sunscreen step, so it can't be added there.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Add to / })).toBeNull();
  });

  it("offers nothing for a scan from anywhere else, a step the product doesn't belong in, or a step that isn't one", async () => {
    await open({ from: "barcode" });
    expect(screen.queryByRole("button", { name: /^Add to / })).toBeNull();
    await act(async () => screen.unmount());
    await open({ from: "barcode", step: "morning:sunscreen" });
    expect(screen.queryByRole("button", { name: /^Add to / })).toBeNull();
    await act(async () => screen.unmount());
    await open({ from: "barcode", step: "nonsense" });
    expect(screen.queryByRole("button", { name: /^Add to / })).toBeNull();
  });
});
