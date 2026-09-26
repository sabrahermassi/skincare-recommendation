import { act, render, screen } from "@testing-library/react-native";

import IngredientRoute from "@/app/ingredient/[inci]";
import { fetchProduct } from "@/data/api";
import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * #324: opened from a product, the ingredient page gives the verdict the
 * ingredient list gave the row, so tapping a row never opens a page that
 * disagrees with it.
 */

jest.setTimeout(30_000);

let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  fetchProduct: jest.fn(),
}));

function ingredient(name: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true, functions: [], ...overrides };
}

const INGREDIENTS = [
  ingredient("aqua"),
  ingredient("glycerin", { functions: ["humectant"] }),
  ingredient("butylene glycol"),
  ingredient("lanolin", { functions: ["emollient", "skin conditioning"] }),
  ingredient("some restricted preservative", { safety: "caution" }),
  ingredient("retinol"),
  ingredient("isopropyl myristate", { verified: false }),
];

const PRODUCT: ProductWithIngredients = {
  id: "p",
  barcode: "0000000000000",
  brand: "Brand",
  name: "Cream",
  type: "moisturizer",
  productType: "lotion-pump",
  price: 0,
  volume: "",
  suitableFor: [],
  targets: [],
  description: "",
  benefits: [],
  imageUrl: null,
  attribution: null,
  ingredientIds: INGREDIENTS.map((i) => i.id),
  inStock: true,
  ingredients: INGREDIENTS,
};

async function open(inci: string, profile: Partial<SkinProfile>) {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, ...profile } });
  mockParams = { inci, product: "p" };
  (fetchProduct as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({ ok: true, value: PRODUCT });
  await render(<IngredientRoute />);
  await act(async () => {});
}

describe("the ingredient page, opened from a product", () => {
  it("with no skin profile, doesn't call a plain ingredient Good, as the list gives it no word", async () => {
    await open("glycerin", {});
    expect(screen.getByText("No known concerns")).toBeTruthy();
    expect(screen.queryByText("Good for you")).toBeNull();
  });

  it("gives a pore-clogger the list's Watch, never Good, whatever it does for this skin", async () => {
    await open("lanolin", { baseSkinType: "dry", concerns: ["dehydrated"] });
    expect(screen.getAllByText("Worth knowing").length).toBeGreaterThan(0);
    expect(screen.queryByText("Good for you")).toBeNull();
  });

  it("gives a restricted ingredient for reactive skin the list's Watch, with the warning's own reason", async () => {
    await open("some restricted preservative", { baseSkinType: "dry", sensitivity: "high" });
    expect(screen.getAllByText("Worth knowing").length).toBeGreaterThan(0);
    expect(screen.getByText("Common irritant for sensitive skin")).toBeTruthy();
    expect(screen.queryByText("Flagged for everyone")).toBeNull();
  });

  it("says a misread pore-clogger the score charged counts against the person, not that it can't be judged", async () => {
    await open("isopropyl myristate", { concerns: ["acne-prone"] });
    expect(screen.getByText("Works against your profile")).toBeTruthy();
    expect(screen.getByText("This is one of the things pulling the score down for the skin you described.")).toBeTruthy();
    expect(screen.queryByText("We can't judge this one")).toBeNull();
  });

  it("says a misread pore-clogger is on the lists when the score didn't charge it", async () => {
    await open("isopropyl myristate", {});
    expect(screen.getByText("Worth a second look")).toBeTruthy();
    expect(
      screen.getByText("This name didn't match our ingredient dictionary, but it is on the published pore-clogging lists."),
    ).toBeTruthy();
  });

  it("flags a pregnancy caution for this person, even with no skin profile", async () => {
    await open("retinol", { pregnancyStatus: "pregnant" });
    expect(screen.getAllByText("Flagged for you").length).toBeGreaterThan(0);
    expect(screen.queryByText("Great match")).toBeNull();
  });
});
