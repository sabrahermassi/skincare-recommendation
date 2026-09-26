import { render, screen } from "@testing-library/react-native";

import { ProductRow } from "@/components/ProductRow";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { EMPTY_PROFILE } from "@/store/useAppStore";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

/**
 * The browse row's count line reads the same numbers as the product page's
 * irritation card (#290), so a fragrance the Ingredient check puts "to watch"
 * for everyone (#345) can't read "none flagged" in the list.
 */
const ingredient = (name: string, overrides: Partial<Ingredient> = {}): Ingredient => ({
  id: name,
  name,
  comedogenic: 0,
  safety: "safe",
  verified: true,
  functions: [],
  ...overrides,
});

const FILLER = ["water", "glycerin", "propanediol", "xanthan gum", "panthenol"];

function renderRow(names: string[]) {
  const product = {
    id: "p1",
    brand: "Brand",
    name: "Serum",
    type: "serum",
    imageUrl: null,
    ingredients: names.map((name) => ingredient(name)),
  } as unknown as ProductWithIngredients;
  return render(<ProductRow product={product} match={matchProduct(product, EMPTY_PROFILE)} />);
}

describe("ProductRow's count line", () => {
  it("names a common irritant rather than saying none flagged", async () => {
    await renderRow([...FILLER, "parfum"]);
    expect(screen.getByText("6 ingredients · 1 common irritant")).toBeTruthy();
  });

  it("still says none flagged when there is nothing to watch", async () => {
    await renderRow(FILLER);
    expect(screen.getByText("5 ingredients · none flagged")).toBeTruthy();
  });
});
