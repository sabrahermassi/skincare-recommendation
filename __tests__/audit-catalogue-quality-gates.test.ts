import {
  classifyGarbageIngredient,
  deleteStatementsFor,
  sqlStringLiteral,
} from "../scripts/audit-catalogue-quality.mjs";

/**
 * Issue #86's ingredient-garbage gate, as ordinary functions — the same
 * reasoning as `import-obf-gates.test.ts`: pinning behaviour here needs no
 * live database or service-role key, and proves something about the *next*
 * change.
 *
 * `looksCosmetic` itself is not re-tested here: it now lives in
 * `supabase/functions/_shared/product-type-classifier.mjs`, imported
 * directly rather than copied, and already has its own coverage in
 * `__tests__/looks-cosmetic.test.ts` (which also carries the
 * CRYSTAL Mineral Deodorant regression case this script's own live run
 * against the production catalogue found).
 *
 * The real-name cases below are not invented: they are the actual examples
 * from issue #86's own report, plus what that live run actually returned.
 */

describe("classifyGarbageIngredient", () => {
  it.each([
    "phenoxyethanol. pr-015376",
    "benzyl alcohol pr-001331",
    "aroma beiersdorf hamburg art.-no. 85061 85061.860.ea.11",
  ])("flags a glued-on lot/batch/PR code: %s", (name: string) => {
    expect(classifyGarbageIngredient(name)).toBe("glued");
  });

  it.each([
    "pr #78). 1 say and i'll move to step 2 (boarding",
    "ethylhexylglycerin questions or comments? toll-free number 1-888-768-2915 20215023v01 (code f",
    // GLUED_CODE's letter-then-digit pattern requires no space between them
    // ("lot" then a space then "32691l" doesn't match it) — this is caught by
    // the plain word "lot" instead, and a live run against the production
    // catalogue confirmed this exact row lands here, not in "glued".
    "helianthus annuus seed oil. lot 32691l 126074",
  ])("flags leaked sentence text: %s", (name: string) => {
    expect(classifyGarbageIngredient(name)).toBe("prose");
  });

  it.each(["fll", "uvb", "f1", "di"])("flags an unexplained short fragment: %s", (name: string) => {
    expect(classifyGarbageIngredient(name)).toBe("short");
  });

  // #101 sampled 43 unverified rows and found 38 the script's original two
  // checks (an English-only prose list, a digit-coded glued pattern) missed
  // entirely — the shape wasn't a batch code or leaked English sentence
  // text, it was a label/section heading glued on, often in another
  // language. These are the actual rows from that report.
  it.each([
    "ingrédients: aqua",
    "ingrediente: aqua",
    "ingrediente: paraffinum liquidum",
    "sastojci: aqua",
    "ingredients: aqua/water",
    "ingredients/ ingrédients: aqua",
    "ingrédients: water/ aqua/eau",
    "composition : olea europea fruit oil",
    "may contain: iron oxides",
    "may contain: titanium dioxide",
    "tocopherol. may contain : ci 77891",
    "glyceryl caprylate. storage: store in a cool & dry place",
    "octocrylene inactive ingredients: water",
    "package labeling: label.jpg inner label.jpg",
    "proprietati",
    "mod de utilizare",
    "distribuitor",
    "producator",
    "potassium phosphate. puede contener cl:42090",
  ])("flags a label/section heading glued onto a real ingredient, in any language: %s", (name: string) => {
    expect(classifyGarbageIngredient(name)).toBe("label");
  });

  it.each(["basic red 1:1", "basic violet 11:1", "ci 77268:1", "pigment blue 15:1", "pigment red 57:1"])(
    "does not flag a real colour-index name as a label heading: %s",
    (name: string) => {
      // #101's report: these five have a colon too (a real part of the CI
      // naming convention), but no label word — confirms LABEL_MARKERS keys
      // off vocabulary, not punctuation shape.
      expect(classifyGarbageIngredient(name)).toBeNull();
    }
  );

  it.each(["pca", "egf", "uv", "aha"])("does not flag a known-real short INCI name: %s", (name: string) => {
    expect(classifyGarbageIngredient(name)).toBeNull();
  });

  it.each(["PCA", "EGF"])(
    "does not flag a known-real short INCI name stored in a different case: %s",
    (name: string) => {
      // KNOWN_SHORT_NAMES is lowercase; comparing the raw name would flag a
      // genuine "PCA"/"EGF" as garbage the moment it wasn't stored lowercase.
      // CodeRabbit, PR #134.
      expect(classifyGarbageIngredient(name)).toBeNull();
    }
  );

  it("does not flag a plausible, unremarkable real name", () => {
    expect(classifyGarbageIngredient("sodium hyaluronate")).toBeNull();
  });
});

describe("sqlStringLiteral", () => {
  it("wraps a plain name in single quotes", () => {
    expect(sqlStringLiteral("phenoxyethanol. pr-015376")).toBe("'phenoxyethanol. pr-015376'");
  });

  it("doubles an embedded single quote rather than leaving it unescaped", () => {
    // The original bug used JSON.stringify, which double-quotes — valid in
    // Postgres only as a quoted *identifier*, not a string literal, so every
    // printed DELETE failed with "column ... does not exist" instead of
    // matching the row. This is the case that would have broken silently
    // either way: the apostrophe is real, seen in a live flagged row.
    expect(sqlStringLiteral("pr #78). 1 say and i'll move to step 2 (boarding")).toBe(
      "'pr #78). 1 say and i''ll move to step 2 (boarding'"
    );
  });
});

describe("deleteStatementsFor", () => {
  it("deletes the product_ingredients join row before the ingredients row", () => {
    // product_ingredients.inci_name -> ingredients.inci_name has no `on
    // delete cascade` (migration 0001), and these flagged names are the stub
    // rows created so a product's ingredient list has something to point to
    // — so the join row has to go first, or the second statement fails with
    // a foreign-key violation instead of deleting anything. Found live: a
    // first version of this script printed only the second statement.
    expect(deleteStatementsFor("phenoxyethanol. pr-015376")).toEqual([
      "delete from product_ingredients where inci_name = 'phenoxyethanol. pr-015376';",
      "delete from ingredients where inci_name = 'phenoxyethanol. pr-015376';",
    ]);
  });

  it("escapes an embedded quote consistently across both statements", () => {
    expect(deleteStatementsFor("pr #78). 1 say and i'll move to step 2 (boarding")).toEqual([
      "delete from product_ingredients where inci_name = 'pr #78). 1 say and i''ll move to step 2 (boarding';",
      "delete from ingredients where inci_name = 'pr #78). 1 say and i''ll move to step 2 (boarding';",
    ]);
  });
});
