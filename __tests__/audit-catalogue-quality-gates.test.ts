import {
  classifyGarbageIngredient,
  looksCosmetic,
  sqlStringLiteral,
} from "../scripts/audit-catalogue-quality.mjs";

/**
 * Issue #86's two audit gates, as ordinary functions — the same reasoning as
 * `import-obf-gates.test.ts`: pinning behaviour here needs no live database
 * or service-role key, and proves something about the *next* change.
 *
 * The real-name cases below are not invented: they are the actual examples
 * from issue #86's own report, plus what a live run against the production
 * catalogue actually returned in this session (including the false positive
 * — CRYSTAL Mineral Deodorant — that `looksCosmetic` originally missed).
 */

describe("looksCosmetic", () => {
  it.each([
    "ORGANIC BLUE CORN TORTILLA CHIPS N/A",
    "Pepsi Cola Soda Pop  12 fl oz  12 Pack Cans Pepsi",
  ])("rejects non-cosmetic products: %s", (text: string) => {
    expect(looksCosmetic(text)).toBe(false);
  });

  it.each([
    "CRYSTAL Mineral Deodorant Roll-On Unscented Body Deodorant Crystal Essence",
    "COSRX Low pH Good Morning Gel Cleanser",
  ])("accepts real cosmetic/personal-care products: %s", (text: string) => {
    expect(looksCosmetic(text)).toBe(true);
  });
});

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
