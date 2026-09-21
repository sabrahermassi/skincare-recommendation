import { incompleteReason } from "../scripts/prune-incomplete-products.mjs";

/**
 * The rule that decides which live rows get deleted. Worth pinning: a rule that
 * is too wide deletes good products, and one that is too narrow leaves the
 * half-products in.
 */
const whole = { barcode: "8801234567890", name: "Hydrating Toner", product_ingredients: [{ count: 30 }] };

describe("which products are incomplete", () => {
  it("keeps a product with a name, a barcode and ingredients", () => {
    expect(incompleteReason(whole)).toBeNull();
  });

  it("flags a barcode and name with no ingredients", () => {
    expect(incompleteReason({ ...whole, product_ingredients: [{ count: 0 }] })).toBe("no ingredients");
    expect(incompleteReason({ ...whole, product_ingredients: [] })).toBe("no ingredients");
    expect(incompleteReason({ ...whole, product_ingredients: null })).toBe("no ingredients");
  });

  it("flags ingredients and a name with no barcode", () => {
    expect(incompleteReason({ ...whole, barcode: null })).toBe("no barcode");
    expect(incompleteReason({ ...whole, barcode: "   " })).toBe("no barcode");
  });

  it("flags a missing or blank name", () => {
    expect(incompleteReason({ ...whole, name: null })).toBe("no name");
    expect(incompleteReason({ ...whole, name: "  " })).toBe("no name");
  });

  it("names every reason when more than one applies", () => {
    expect(incompleteReason({ barcode: null, name: "Sunscreen", product_ingredients: [{ count: 0 }] })).toBe(
      "no barcode + no ingredients"
    );
  });
});
