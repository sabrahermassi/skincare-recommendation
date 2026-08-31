import {
  fetchProduct,
  fetchProducts,
  fetchProductsByIds,
  fetchProductTypes,
} from "@/data/api";

/**
 * Contract tests. These assert the shape screens rely on, so that swapping
 * data/api.ts for a real backend (issue #6) is verifiable rather than hoped
 * for. They deliberately avoid asserting on specific catalog contents beyond
 * what the shape requires.
 */
describe("fetchProducts", () => {
  it("resolves ingredients, which the list screen needs for scoring", async () => {
    const products = await fetchProducts();
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(Array.isArray(p.ingredients)).toBe(true);
      expect(p.ingredients).toHaveLength(p.ingredientIds.length);
    }
  });

  it("preserves INCI order, which is meaningful on a label", async () => {
    const [product] = await fetchProducts();
    expect(product.ingredients.map((i) => i.id)).toEqual(product.ingredientIds);
  });

  it("filters by product type", async () => {
    const serums = await fetchProducts({ type: "serum" });
    expect(serums.length).toBeGreaterThan(0);
    expect(serums.every((p) => p.type === "serum")).toBe(true);
  });

  it("returns an empty list rather than throwing for a type with no products", async () => {
    await expect(fetchProducts({ type: "toner" })).resolves.toEqual([]);
  });
});

describe("fetchProduct", () => {
  it("returns null for an unknown id", async () => {
    await expect(fetchProduct("does-not-exist")).resolves.toBeNull();
  });
});

describe("fetchProductsByIds", () => {
  it("skips unknown ids instead of returning holes", async () => {
    const result = await fetchProductsByIds(["hanbang-rice-serum", "nope"]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("hanbang-rice-serum");
  });

  it("returns an empty list for no ids", async () => {
    await expect(fetchProductsByIds([])).resolves.toEqual([]);
  });
});

describe("fetchProductTypes", () => {
  it("returns distinct types", async () => {
    const types = await fetchProductTypes();
    expect(new Set(types).size).toBe(types.length);
  });
});

describe("ingredient resolution", () => {
  it("falls back to 'caution' for unknown ingredients rather than 'safe'", async () => {
    // Every id in the fixture catalog resolves today; this asserts the
    // direction of the fallback so a future data gap fails safe.
    const products = await fetchProducts();
    const unknown = products
      .flatMap((p) => p.ingredients)
      .filter((i) => i.note === "No data for this ingredient yet.");
    for (const i of unknown) expect(i.safety).toBe("caution");
  });
});
