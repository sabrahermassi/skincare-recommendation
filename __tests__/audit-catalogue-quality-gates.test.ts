import { classifyGarbageIngredient, sqlStringLiteral } from "../scripts/audit-catalogue-quality.mjs";

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

  it.each(["pca", "egf", "uv", "aha"])("does not flag a known-real short INCI name: %s", (name: string) => {
    expect(classifyGarbageIngredient(name)).toBeNull();
  });

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
