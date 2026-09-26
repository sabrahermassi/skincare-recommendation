import { unknownIngredient } from "@/data/types";
import { isVerified } from "@/lib/safety";
import {
  canPhotographLabelFor,
  fetchProduct,
  fetchProductByBarcode,
  fetchProducts,
  fetchProductsByIds,
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

  /**
   * Benefit bullets used to be guaranteed. They no longer are: real sources
   * return a formula and a label, not copywriting, so this now pins that any
   * bullet present is non-empty and that the card always has *something* to
   * show — `ProductCard` falls back to the description.
   */
  it("never carries an empty benefit bullet, and always has caption text", async () => {
    const products = await fetchProducts();
    for (const p of products) {
      expect(Array.isArray(p.benefits)).toBe(true);
      for (const benefit of p.benefits) {
        expect(benefit.trim().length).toBeGreaterThan(0);
      }
      expect((p.benefits[0] ?? p.description).trim().length).toBeGreaterThan(0);
    }
  });

  it("exposes an imageUrl and attribution field on every product", async () => {
    const products = await fetchProducts();
    for (const p of products) {
      expect(p).toHaveProperty("imageUrl");
      expect(p).toHaveProperty("attribution");
    }
  });

  /**
   * Every catalogue photo is a user upload with no official/review
   * distinction available, so none are surfaced — the illustration renders
   * instead. Pinned here because the guard is easy to remove by accident.
   */
  it("never surfaces source photography", async () => {
    const products = await fetchProducts();
    for (const p of products) {
      expect(p.imageUrl).toBeNull();
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

  it("has no area filter - a formula is judged on its own merits, not which part of the body it's for", async () => {
    const products = await fetchProducts();
    expect(products.some((p) => p.type === "body-wash" || p.type === "body-lotion" || p.type === "hand-cream")).toBe(true);
    expect(products.some((p) => p.type === "serum" || p.type === "cleanser")).toBe(true);
  });
});

describe("fetchProduct", () => {
  it("returns a successful read whose value is null for an unknown id", async () => {
    await expect(fetchProduct("does-not-exist")).resolves.toEqual({ ok: true, value: null });
  });
});

describe("fetchProductsByIds", () => {
  it("skips unknown ids instead of returning holes", async () => {
    const result = await fetchProductsByIds(["hanbang-rice-serum", "nope"]);
    if (!result.ok) throw new Error("expected a successful read");
    expect(result.value).toHaveLength(1);
    expect(result.value[0].id).toBe("hanbang-rice-serum");
  });

  it("returns an empty list for no ids", async () => {
    await expect(fetchProductsByIds([])).resolves.toEqual({ ok: true, value: [] });
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

  // #206: the stubs used to disagree ("safe" in some places, "caution" in
  // others). One helper makes them all, conservative, and never verified.
  it("makes every unknown-ingredient stub the same way", () => {
    const stub = unknownIngredient("mystery extract");
    expect(stub).toEqual({ id: "mystery extract", name: "mystery extract", comedogenic: 0, safety: "caution", verified: false });
    expect(isVerified(stub)).toBe(false);
    expect(unknownIngredient("x", "No data").note).toBe("No data");
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
    if (!found.ok) throw new Error("expected a successful read");

    expect(found.value?.id).toBe(first.id);
    expect(found.value?.ingredients).toHaveLength(first.ingredientIds.length);
  });

  /** A miss is an ordinary outcome for a scanner, not an error. */
  it("returns a successful read whose value is null for a barcode not in the catalog", async () => {
    expect(await fetchProductByBarcode("0000000000000")).toEqual({ ok: true, value: null });
  });
});

describe("canPhotographLabelFor", () => {
  /**
   * Mirrors `label-ocr`'s own `\d{8,14}` check, so screens can skip the
   * camera flow instead of letting the server 400 after a photo was taken.
   * Pinned here rather than trusted, since the two are only kept in sync by
   * convention.
   */
  it("accepts barcode lengths label-ocr accepts", () => {
    expect(canPhotographLabelFor("12345678")).toBe(true); // 8 digits, the floor
    expect(canPhotographLabelFor("1234567890123")).toBe(true); // EAN-13
    expect(canPhotographLabelFor("12345678901234")).toBe(true); // 14 digits, the ceiling
  });

  it("rejects lengths label-ocr rejects", () => {
    expect(canPhotographLabelFor("1234567")).toBe(false); // 7 digits
    expect(canPhotographLabelFor("123456789012345")).toBe(false); // 15 digits
  });

  it("rejects a non-numeric identifier", () => {
    // Two real shapes this reaches: a catalogue product id for a row that
    // failed to resolve, and the raw payload of a missed QR/Code 128 scan.
    expect(canPhotographLabelFor("obf-8801234567890")).toBe(false);
    expect(canPhotographLabelFor("hanbang-rice-serum")).toBe(false);
    expect(canPhotographLabelFor("https://example.com")).toBe(false);
  });

  it("rejects null, undefined, and empty string", () => {
    expect(canPhotographLabelFor(null)).toBe(false);
    expect(canPhotographLabelFor(undefined)).toBe(false);
    expect(canPhotographLabelFor("")).toBe(false);
  });
});
