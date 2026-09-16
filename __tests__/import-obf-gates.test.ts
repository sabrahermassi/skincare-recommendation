import {
  MIN_KNOWN_INGREDIENT_RATIO,
  parseInci,
  toRow,
} from "../scripts/import-obf.mjs";

/**
 * The gates the Open Beauty Facts import judges a row on.
 *
 * Step 5's done-when is "a deliberately mangled ingredient list is rejected by
 * the dry run". Until this file, the only way to check that was to run the
 * import and read the output — which needs a service-role key, hits a
 * volunteer-run API, and proves nothing about the *next* change. The gates are
 * ordinary functions, so they get an ordinary test.
 *
 * `toRow` returns the row on success and a string naming the reason on
 * rejection, which is what the importer counts and prints.
 */

/**
 * A dictionary stand-in. The real one is ~35,805 verified INCI names read from
 * the `ingredients` table; the gate only ever asks it "do you contain this
 * name", so a Set of the names each case needs is the whole contract.
 */
const KNOWN = new Set([
  "aqua",
  "glycerin",
  "niacinamide",
  "butylene glycol",
  "1,2-hexanediol",
  "panthenol",
  "sodium hyaluronate",
  "cetearyl alcohol",
  "phenoxyethanol",
  "tocopherol",
]);

/** The shape OBF returns, reduced to the fields `toRow` reads. */
function obfProduct(overrides: Record<string, unknown> = {}) {
  return {
    code: "8801234567890",
    product_name: "Test Hydrating Serum",
    brands: "Testbrand",
    quantity: "50ml",
    categories_tags: ["en:face"],
    ingredients_text:
      "Aqua, Glycerin, Niacinamide, Butylene Glycol, 1,2-Hexanediol, Panthenol",
    ...overrides,
  };
}

/**
 * Narrow `toRow`'s result to the success case.
 *
 * It returns the row, or a string naming why the row was rejected — a union
 * `tsc` infers from the script itself, so the test gets real type checking
 * rather than a blanket `@ts-nocheck`. Asserting here also turns "property
 * does not exist" into the rejection reason, which is the useful message.
 */
function expectKept<T>(result: T | string): T {
  if (typeof result === "string") {
    throw new Error(`expected the row to be kept, but it was rejected: ${result}`);
  }
  return result;
}

describe("the import rejects what it cannot believe", () => {
  it("accepts a real formula", () => {
    const row = expectKept(toRow(obfProduct(), KNOWN, []));
    expect(row.product.id).toBe("obf-8801234567890");
    expect(row.ingredients[0].inci_name).toBe("aqua");
  });

  // The done-when for step 5, stated as a test rather than as a paragraph of
  // dry-run output. Every name here is plausible-looking text that is not an
  // ingredient — which is exactly what an OCR smear or a marketing paragraph
  // looks like coming out of the parser.
  it("rejects a deliberately mangled ingredient list", () => {
    const mangled = toRow(
      obfProduct({
        ingredients_text:
          "Ulmus Davidiana Root raria Lobata Root, fll, aux, moins de, " +
          "agents de surface anioniques, se recomandă consult stomatologic",
      }),
      KNOWN,
      []
    );
    expect(mangled).toBe("formula not recognised by the dictionary");
  });

  it("names the reason it rejected, so a run can count them", () => {
    expect(toRow(obfProduct({ product_name: "" }), KNOWN, [])).toBe(
      "no name, formula or barcode"
    );
    expect(toRow(obfProduct({ code: undefined }), KNOWN, [])).toBe(
      "no name, formula or barcode"
    );
    expect(toRow(obfProduct({ ingredients_text: "Aqua" }), KNOWN, [])).toBe(
      "fewer than 2 parsed ingredients"
    );
  });

  // The threshold is a judgement call backed by measurement (see the constant's
  // own comment), so this pins the boundary rather than the number: a formula
  // sitting exactly on it is kept, one below it is not.
  it("keeps a formula on the threshold and drops one below it", () => {
    // 6 of 10 recognised = 0.6 exactly.
    const onTheLine = expectKept(
      toRow(
        obfProduct({
          ingredients_text:
            "Aqua, Glycerin, Niacinamide, Panthenol, Tocopherol, Phenoxyethanol, " +
            "zzz alpha, zzz beta, zzz gamma, zzz delta",
        }),
        KNOWN,
        []
      )
    );
    expect(onTheLine.ingredients).toHaveLength(10);

    // 5 of 10 = 0.5.
    const belowIt = toRow(
      obfProduct({
        ingredients_text:
          "Aqua, Glycerin, Niacinamide, Panthenol, Tocopherol, " +
          "zzz alpha, zzz beta, zzz gamma, zzz delta, zzz epsilon",
      }),
      KNOWN,
      []
    );
    expect(belowIt).toBe("formula not recognised by the dictionary");
    expect(MIN_KNOWN_INGREDIENT_RATIO).toBe(0.6);
  });

  it("collects the first few rejections verbatim, for tuning", () => {
    const samples: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      toRow(obfProduct({ ingredients_text: "zzz one, zzz two, zzz three" }), KNOWN, samples);
    }
    // Capped, so a run that rejects thousands does not print thousands.
    expect(samples).toHaveLength(5);
    expect(samples[0]).toContain("0/3 recognised");
  });
});

describe("the parser matches lib/inci.ts", () => {
  it("drops an Ingredients: heading rather than storing it as an ingredient", () => {
    const parsed = parseInci("Ingredients: Aqua, Glycerin");
    expect(parsed.map((p: { inci_name: string }) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
    ]);
  });

  it("truncates at label boilerplate", () => {
    const parsed = parseInci("Aqua, Glycerin. Made in Nigeria, customer care 0800");
    expect(parsed.map((p: { inci_name: string }) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
    ]);
  });

  it("keeps the comma inside 1,2-Hexanediol", () => {
    const parsed = parseInci("Aqua, 1,2-Hexanediol, Glycerin");
    expect(parsed.map((p: { inci_name: string }) => p.inci_name)).toEqual([
      "aqua",
      "1,2-hexanediol",
      "glycerin",
    ]);
  });

  it("deduplicates a repeated name and renumbers positions", () => {
    const parsed = parseInci("Aqua, Glycerin, Aqua, Panthenol");
    expect(parsed).toEqual([
      { inci_name: "aqua", position: 0 },
      { inci_name: "glycerin", position: 1 },
      { inci_name: "panthenol", position: 2 },
    ]);
  });

  it("drops a token carrying no letters", () => {
    const parsed = parseInci("Aqua, 400, Glycerin");
    expect(parsed.map((p: { inci_name: string }) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
    ]);
  });
});
