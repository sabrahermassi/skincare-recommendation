import { isCodeNotName } from "../scripts/import-wikidata-synonyms.mjs";

/**
 * #185, found in review on #247: Hangul syllables and CJK ideographs are
 * single UTF-16 code units, so a short real Korean/Japanese ingredient word
 * (정제수 "purified water", length 3; 향료 "fragrance", length 2) was being
 * rejected by the length-4 floor before the CJK-word check further down in
 * `isCodeNotName` ever ran — silently defeating that fix for exactly the
 * common short words a Korean or Japanese label is full of.
 */
describe("isCodeNotName", () => {
  it("does not reject a short real Korean word as a code", () => {
    expect(isCodeNotName("정제수")).toBe(false); // purified water, length 3
    expect(isCodeNotName("향료")).toBe(false); // fragrance, length 2
    expect(isCodeNotName("색소")).toBe(false); // colorant, length 2
  });

  it("does not reject a short real Japanese word as a code", () => {
    expect(isCodeNotName("グリセリン")).toBe(false); // glycerin
    expect(isCodeNotName("水")).toBe(true); // length 1: too short even for a CJK word — see inci.test.ts's own note on this
  });

  it("still rejects a genuinely short or code-like value", () => {
    expect(isCodeNotName("abc")).toBe(true); // under the length floor, Latin
    expect(isCodeNotName("Fe2O3")).toBe(true); // formula
    expect(isCodeNotName("E172(ii)")).toBe(true); // E-number
    expect(isCodeNotName("CI 77891")).toBe(true); // colour index
    expect(isCodeNotName("pubchem 84369")).toBe(true); // cross-database id
  });

  it("still accepts a real Latin ingredient name", () => {
    expect(isCodeNotName("glycerin")).toBe(false);
    expect(isCodeNotName("water")).toBe(false);
  });
});
