import { act, fireEvent, render, screen } from "@testing-library/react-native";

import IngredientListRoute from "@/app/ingredients/[id]";
import { fetchProduct } from "@/data/api";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * #324: the full ingredient list read at a glance — labelled rows first, the
 * rest folded under one line, and the pack's own order one tap away.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "p" }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  fetchProduct: jest.fn(),
  peekProducts: () => undefined,
}));

function ingredient(name: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides };
}

// In printed order: plain ones first, then a benefit, then a banned one.
const INGREDIENTS = [
  ingredient("xanthan gum"),
  ingredient("sodium benzoate"),
  ingredient("glycerin"),
  ingredient("some banned dye", { safety: "avoid" }),
];

const PRODUCT: ProductWithIngredients = {
  id: "p",
  barcode: "0000000000000",
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
  ingredientIds: INGREDIENTS.map((i) => i.id),
  inStock: true,
  ingredients: INGREDIENTS,
};

/** The ingredient names on screen, top to bottom. */
function namesShown(): string[] {
  const names = INGREDIENTS.map((i) => i.name);
  const pattern = new RegExp(`^(${names.join("|")})$`, "i");
  return screen
    .queryAllByText(pattern)
    .map((node) => String(node.props.children).toLowerCase())
    .filter((text) => names.includes(text));
}

async function open() {
  (fetchProduct as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({ ok: true, value: PRODUCT });
  await render(<IngredientListRoute />);
  await act(async () => {});
}

describe("the ingredient list", () => {
  beforeEach(() => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dehydrated"], baseSkinType: "dry" } });
  });

  it("puts the rows that matter first and folds the rest under one line", async () => {
    await open();
    expect(screen.getByText("Avoid")).toBeTruthy();
    expect(screen.getByText("Good")).toBeTruthy();
    expect(screen.getByText(/more ingredients? with no known concerns/)).toBeTruthy();
    // The banned one leads, though it's printed last; the folded ones aren't shown.
    const shown = namesShown();
    expect(shown[0]).toBe("some banned dye");
    expect(shown).not.toContain("xanthan gum");
  });

  it("unfolds the rest when tapped", async () => {
    await open();
    await fireEvent.press(screen.getByText(/more ingredients? with no known concerns/));
    expect(namesShown()).toContain("xanthan gum");
    expect(screen.queryByText(/more ingredients? with no known concerns/)).toBeNull();
  });

  it("shows the pack's own order As printed", async () => {
    await open();
    await fireEvent.press(screen.getByText("As printed"));
    expect(namesShown()).toEqual(INGREDIENTS.map((i) => i.name));
    expect(screen.getByText("What matters first")).toBeTruthy();
  });

  it("labels a misread name on the pore-clogging lists Watch, with the lists as its reason", async () => {
    const misread = ingredient("isopropyl myristate", { verified: false });
    (fetchProduct as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({
      ok: true,
      value: { ...PRODUCT, ingredientIds: [...PRODUCT.ingredientIds, misread.id], ingredients: [...INGREDIENTS, misread] },
    });
    await render(<IngredientListRoute />);
    await act(async () => {});
    expect(screen.getByText("Watch")).toBeTruthy();
    expect(screen.getByText("On the published pore-clogging lists")).toBeTruthy();
    expect(screen.queryByText("Not recognised - we can't assess this one")).toBeNull();
  });

  it("with no skin profile, says why nothing is Good, and never says it", async () => {
    useAppStore.setState({ profile: EMPTY_PROFILE });
    await open();
    expect(screen.getByText("Set up your skin profile to see what's good or worth watching for you.")).toBeTruthy();
    expect(screen.queryByText("Good")).toBeNull();
    expect(screen.getByText("Avoid")).toBeTruthy();
  });
});
