import { normalise, parseIngredientBlock } from "@/lib/inci";

describe("normalise", () => {
  it("lowercases and trims", () => {
    expect(normalise("  Sodium Hyaluronate ")).toBe("sodium hyaluronate");
  });

  /** Labels qualify botanicals in brackets; the dictionary is keyed without. */
  it("drops bracketed qualifiers", () => {
    expect(normalise("Butyrospermum Parkii (Shea) Butter")).toBe("butyrospermum parkii butter");
  });

  it("drops organic asterisks and stray brackets", () => {
    expect(normalise("Aloe Barbadensis Leaf Juice*")).toBe("aloe barbadensis leaf juice");
  });

  it("drops trailing percentages", () => {
    expect(normalise("Niacinamide 5%")).toBe("niacinamide");
    expect(normalise("Ascorbic Acid 12.5 %")).toBe("ascorbic acid");
  });

  it("collapses runs of whitespace from wrapped label text", () => {
    expect(normalise("Cocamidopropyl\n   Betaine")).toBe("cocamidopropyl betaine");
  });
});

describe("parseIngredientBlock", () => {
  it("splits on commas and preserves order", () => {
    const parsed = parseIngredientBlock("Water, Glycerin, Niacinamide");
    expect(parsed).toEqual([
      { inci_name: "water", position: 0 },
      { inci_name: "glycerin", position: 1 },
      { inci_name: "niacinamide", position: 2 },
    ]);
  });

  /**
   * Position is regulated information — descending concentration — and the
   * verdict engine weights by it, so order is not cosmetic.
   */
  it("keeps position stable when decoration is stripped", () => {
    const parsed = parseIngredientBlock("Aqua, Butylene Glycol (Humectant), Parfum*");
    expect(parsed.map((p) => p.inci_name)).toEqual(["aqua", "butylene glycol", "parfum"]);
    expect(parsed[2].position).toBe(2);
  });

  it("starts at the Ingredients heading, ignoring marketing above it", () => {
    const parsed = parseIngredientBlock(
      "GENTLE FOAMING CLEANSER. For all skin types. Ingredients: Water, Glycerin, Panthenol"
    );
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin", "panthenol"]);
  });

  it("recognises a Korean ingredients heading", () => {
    const parsed = parseIngredientBlock("수분 크림 전성분: Water, Glycerin, Niacinamide");
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin", "niacinamide"]);
  });

  it("stops at the next section rather than swallowing directions", () => {
    const parsed = parseIngredientBlock(
      "Ingredients: Water, Glycerin, Panthenol. Directions: Apply morning and evening, avoid the eye area"
    );
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin", "panthenol"]);
  });

  it("handles semicolon and bullet separated lists", () => {
    expect(parseIngredientBlock("Water; Glycerin • Squalane").map((p) => p.inci_name)).toEqual([
      "water",
      "glycerin",
      "squalane",
    ]);
  });

  it("drops fragments too short or numeric to be an ingredient", () => {
    const parsed = parseIngredientBlock("Water, x, 12345, Glycerin");
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin"]);
  });

  /**
   * The real failure mode. This is genuine text from Open Beauty Facts for
   * COSRX Low pH Good Morning Gel Cleanser — two ingredients fused and
   * fragments dropped, mangled upstream before we ever see it. The parser must
   * not crash or silently drop the list; the garbage survives as entries that
   * the dictionary will fail to match, and the UI marks unrecognised.
   */
  it("survives an OCR-mangled source list without losing the good entries", () => {
    const parsed = parseIngredientBlock(
      "Water, Cocamidopropyl Betaine, Sodium Lauroyl nicus Branch/Fruit/Leaf Extract, " +
        "Butylene Glycol, Styrax Japo - Ferment, Ulmus Davidiana Root raria Lobata Root"
    );
    const names = parsed.map((p) => p.inci_name);
    expect(names).toContain("water");
    expect(names).toContain("cocamidopropyl betaine");
    expect(names).toContain("butylene glycol");
    // The mangled ones are kept in place rather than guessed at or dropped.
    expect(names).toContain("styrax japo - ferment");
    expect(parsed).toHaveLength(6);
  });

  it("returns nothing for text with no ingredient list at all", () => {
    expect(parseIngredientBlock("Directions: apply twice daily")).toEqual([]);
  });
});
