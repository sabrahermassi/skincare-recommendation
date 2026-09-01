import { normalise, parseIngredientBlock, reconstructFromDictionary } from "@/lib/inci";

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

  /**
   * The most common bad name in the catalogue: "1,2-Hexanediol" was split on
   * its own locant comma into a bare "1" (dropped) and an orphaned
   * "2-hexanediol" that matches no dictionary entry, across 25 products.
   */
  it("keeps a locant comma inside a chemical name", () => {
    const parsed = parseIngredientBlock(
      "Ingredients: Water, 1,2-Hexanediol, Butylene Glycol, 1,3-Butylene Glycol"
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "water",
      "1,2-hexanediol",
      "butylene glycol",
      "1,3-butylene glycol",
    ]);
  });

  it("still splits a separator comma that precedes a number-led name", () => {
    const parsed = parseIngredientBlock("Ingredients: Water, Glycerin, 4-Terpineol");
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin", "4-terpineol"]);
  });

  /**
   * Real trailing OCR text from the same La Roche-Posay label used elsewhere
   * in this file: after the formula, the net-quantity mark and distributor
   * boilerplate follow directly with no "Directions"-style heading of their
   * own, and would otherwise degrade to junk fragments that dilute the
   * recognised-ingredient ratio enough to sink the verdict.
   */
  it("stops before the net-quantity mark and distributor text", () => {
    const parsed = parseIngredientBlock(
      "Ingredients: Water, Glycerin, Niacinamide. e 400 ml Distribution réservée aux dépositaires agréés"
    );
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin", "niacinamide"]);
  });
});

describe("reconstructFromDictionary", () => {
  it("greedily matches the longest known multi-word ingredient at each position", () => {
    const dictionary = new Set(["water", "butylene glycol", "niacinamide", "panthenol"]);
    const parsed = reconstructFromDictionary(
      ["Water", "Butylene", "Glycol", "Niacinamide", "Panthenol"],
      dictionary
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "water",
      "butylene glycol",
      "niacinamide",
      "panthenol",
    ]);
  });

  /**
   * OCR read "PARKI" for the label's "PARKII". The typo sits inside a
   * multi-word name, so single-word fuzzy matching can't save it — the whole
   * window has to be matched approximately.
   */
  it("tolerates an OCR typo inside a multi-word name", () => {
    const dictionary = new Set(["butyrospermum parkii butter", "glycerin"]);
    const parsed = reconstructFromDictionary(
      ["Butyrospermum", "Parki", "Butter", "Glycerin"],
      dictionary
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "butyrospermum parkii butter",
      "glycerin",
    ]);
  });

  /**
   * A short fragment is within one edit of half the dictionary, so fuzzy
   * matching it invents ingredients. "fll" (from a batch code) must stay
   * unrecognised rather than resolve to some real name.
   */
  /**
   * Two dictionary names sit one edit from the OCR text. Nothing in the text
   * says which was printed, so picking either would invent an ingredient the
   * product may not contain — the risk grows with every name added.
   */
  it("refuses an ambiguous fuzzy match rather than breaking the tie", () => {
    const dictionary = new Set(["ceramide np", "ceramide ap", "glycerin"]);
    const parsed = reconstructFromDictionary(["Ceramide", "Xp", "Glycerin"], dictionary);
    const names = parsed.map((p) => p.inci_name);
    expect(names).not.toContain("ceramide np");
    expect(names).not.toContain("ceramide ap");
    expect(names).toContain("glycerin");
  });

  it("still resolves a fuzzy match when only one candidate is closest", () => {
    const dictionary = new Set(["ceramide np", "glycerin"]);
    const parsed = reconstructFromDictionary(["Ceramide", "Xp", "Glycerin"], dictionary);
    expect(parsed.map((p) => p.inci_name)).toContain("ceramide np");
  });

  it("refuses to fuzzy-match a fragment too short to be distinctive", () => {
    const dictionary = new Set(["fill", "oils", "glycerin"]);
    const parsed = reconstructFromDictionary(["Fll", "Glycerin"], dictionary);
    expect(parsed.map((p) => p.inci_name)).toEqual(["fll", "glycerin"]);
  });

  describe("slash-separated dual names", () => {
    it("resolves a dual name to its canonical first half", () => {
      const dictionary = new Set(["aqua", "water", "glycerin"]);
      const parsed = reconstructFromDictionary(["Aqua/Water", "Glycerin"], dictionary);
      expect(parsed.map((p) => p.inci_name)).toEqual(["aqua", "glycerin"]);
    });

    it("accepts a single unknown word after the slash", () => {
      // "Brassica Campestris (Rapeseed) Seed Oil" prints as
      // "BRASSICA CAMPESTRIS SEED OIL/RAPESEED"; "rapeseed" is not itself an
      // INCI name, but one trailing word is a common-name annotation.
      const dictionary = new Set(["brassica campestris seed oil", "propanediol"]);
      const parsed = reconstructFromDictionary(
        ["Brassica", "Campestris", "Seed", "Oil/Rapeseed", "Propanediol"],
        dictionary
      );
      expect(parsed.map((p) => p.inci_name)).toEqual([
        "brassica campestris seed oil",
        "propanediol",
      ]);
    });

    it("does not let the trailing annotation match approximately", () => {
      // Regression: "…butter/shea butter glycerin" was accepted as one
      // ingredient because the trailing part was allowed a fuzzy match,
      // swallowing the glycerin that came after it.
      const dictionary = new Set([
        "butyrospermum parkii butter",
        "shea butter",
        "glycerin",
      ]);
      const parsed = reconstructFromDictionary(
        ["Butyrospermum", "Parki", "Butter/Shea", "Butter", "Glycerin"],
        dictionary
      );
      expect(parsed.map((p) => p.inci_name)).toEqual([
        "butyrospermum parkii butter",
        "glycerin",
      ]);
    });

    it("does not swallow the ingredients that follow a slash", () => {
      // The words after the slash here are a different ingredient, not a
      // common-name annotation — the window must be rejected.
      const dictionary = new Set([
        "brassica campestris seed oil",
        "ammonium polyacryloyldimethyl taurate",
      ]);
      const parsed = reconstructFromDictionary(
        ["Brassica", "Campestris", "Seed", "Oil/Rapeseed", "Ammonium", "Polyacryloyldimethyl", "Taurate"],
        dictionary
      );
      expect(parsed.map((p) => p.inci_name)).toEqual([
        "brassica campestris seed oil",
        "ammonium polyacryloyldimethyl taurate",
      ]);
    });
  });
});

describe("parseIngredientBlock with a dictionary", () => {
  /**
   * Real OCR text from a La Roche-Posay label: the printed bullet
   * separators between ingredients were not detected as characters at all —
   * confirmed against the live Vision API response, not just misread — so
   * the plain delimiter split has nothing to split on and collapses the
   * whole list into one over-length token. "PARKI" (missing the second "i")
   * is also genuine OCR output, not a typo introduced for this test.
   */
  it("falls back to dictionary reconstruction when OCR drops all delimiters", () => {
    // Dictionary entries are the real canonical INCI names, as held in the
    // `ingredients` table. The expected output is the first five names of the
    // barcode-sourced list for this same product (obf-3337875696548) — the two
    // paths should agree.
    const dictionary = new Set([
      "aqua",
      "water",
      "butyrospermum parkii butter",
      "shea butter",
      "glycerin",
      "dimethicone",
      "niacinamide",
    ]);
    const parsed = parseIngredientBlock(
      "INGREDIENTS: AQUA/WATER BUTYROSPERMUM PARKI BUTTER/SHEA BUTTER GLYCERIN DIMETHICONE NIACINAMIDE",
      dictionary
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "aqua",
      "butyrospermum parkii butter",
      "glycerin",
      "dimethicone",
      "niacinamide",
    ]);
  });

  /**
   * `product_ingredients` is keyed on (product_id, position), not inci_name,
   * so nothing stops two rows landing on the same name — and two different
   * unmatched multi-word ingredients can both degrade to the same bare
   * leftover word ("Argania Spinosa Kernel Oil" and "Prunus Amygdalus Dulcis
   * Oil" both landing on "oil"). The client keys ingredient rows by name, so
   * a real duplicate here becomes a React key collision.
   */
  it("drops a duplicate ingredient name rather than emitting it twice", () => {
    const dictionary = new Set([
      "argania",
      "spinosa",
      "kernel",
      "prunus",
      "amygdalus",
      "dulcis",
    ]);
    const parsed = parseIngredientBlock(
      "Ingredients: Argania Spinosa Kernel Oil Prunus Amygdalus Dulcis Oil",
      dictionary
    );
    const names = parsed.map((p) => p.inci_name);
    expect(names.filter((n) => n === "oil")).toHaveLength(1);
    expect(names).toEqual([
      "argania",
      "spinosa",
      "kernel",
      "oil",
      "prunus",
      "amygdalus",
      "dulcis",
    ]);
    // Positions stay a contiguous 0..n-1 run with no gap left by the drop.
    expect(parsed.map((p) => p.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  /**
   * The French names came off a bilingual label as an ordinary
   * comma-separated list, so aliases have to resolve on the delimited path —
   * not only inside dictionary reconstruction.
   */
  it("resolves a synonym to its canonical name in a delimited list", () => {
    const aliases = new Map([
      ["glycérine", "glycerin"],
      ["mineral oil", "paraffinum liquidum"],
      ["acide citrique", "citric acid"],
    ]);
    const parsed = parseIngredientBlock(
      "Ingredients: Aqua, Glycérine, Mineral Oil, Acide Citrique",
      undefined,
      aliases
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
      "paraffinum liquidum",
      "citric acid",
    ]);
  });

  it("collapses a synonym and its canonical name to one entry", () => {
    // "Aqua/Water" style labels can name the same substance twice; after
    // resolution both become `glycerin` and the duplicate must not survive.
    const aliases = new Map([["glycérine", "glycerin"]]);
    const parsed = parseIngredientBlock(
      "Ingredients: Glycerin, Glycérine, Panthenol, Niacinamide",
      undefined,
      aliases
    );
    expect(parsed.map((p) => p.inci_name)).toEqual(["glycerin", "panthenol", "niacinamide"]);
  });

  it("ignores the dictionary when the plain delimiter split already looks trustworthy", () => {
    const parsed = parseIngredientBlock(
      "Water, Glycerin, Niacinamide, Panthenol",
      new Set(["something else entirely"])
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "water",
      "glycerin",
      "niacinamide",
      "panthenol",
    ]);
  });
});
