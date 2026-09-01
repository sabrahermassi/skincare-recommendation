import {
  fetchProduct,
  fetchProductByBarcode,
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

  it("gives every product exactly 3 non-empty benefit bullets for the browse card", async () => {
    const products = await fetchProducts();
    for (const p of products) {
      expect(p.benefits).toHaveLength(3);
      for (const benefit of p.benefits) {
        expect(benefit.trim().length).toBeGreaterThan(0);
      }
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

  it("filters by area", async () => {
    const bodyProducts = await fetchProducts({ area: "body" });
    expect(bodyProducts.length).toBe(3);
    expect(bodyProducts.every((p) => p.area === "body")).toBe(true);
  });

  it("combines type and area filters", async () => {
    const faceCleansers = await fetchProducts({ type: "cleanser", area: "face" });
    expect(faceCleansers.length).toBeGreaterThan(0);
    expect(faceCleansers.every((p) => p.type === "cleanser" && p.area === "face")).toBe(true);
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

describe("fetchProductByBarcode", () => {
  /** Checksum, not just length: a mistyped digit should not look like a valid code. */
  function ean13CheckDigit(body12: string): number {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return (10 - (sum % 10)) % 10;
  }

  it("gives every product a unique, checksum-valid EAN-13", async () => {
    const products = await fetchProducts();
    const barcodes = products.map((p) => p.barcode);

    expect(new Set(barcodes).size).toBe(barcodes.length);
    for (const barcode of barcodes) {
      expect(barcode).toMatch(/^\d{13}$/);
      expect(Number(barcode[12])).toBe(ean13CheckDigit(barcode.slice(0, 12)));
    }
  });

  it("resolves a known barcode to that product, with ingredients", async () => {
    const [first] = await fetchProducts();
    const found = await fetchProductByBarcode(first.barcode);

    expect(found?.id).toBe(first.id);
    expect(found?.ingredients).toHaveLength(first.ingredientIds.length);
  });

  /** A miss is an ordinary outcome for a scanner, not an error. */
  it("returns null for a barcode that is not in the catalog", async () => {
    expect(await fetchProductByBarcode("0000000000000")).toBeNull();
  });
});
