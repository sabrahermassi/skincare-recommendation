import { gateRatio, isNonLatinName } from "@/supabase/functions/_shared/gate-ratio";

const MIN_KNOWN_INGREDIENT_RATIO = 0.6;

describe("isNonLatinName", () => {
  it("flags Hangul, Hiragana, Katakana and Han", () => {
    expect(isNonLatinName("정제수")).toBe(true);
    expect(isNonLatinName("ひらがな")).toBe(true);
    expect(isNonLatinName("グリセリン")).toBe(true);
    expect(isNonLatinName("香料")).toBe(true);
  });

  it("does not flag Latin or accented Latin names", () => {
    expect(isNonLatinName("glycerin")).toBe(false);
    expect(isNonLatinName("glycérine")).toBe(false);
  });
});

describe("gateRatio", () => {
  // #185's regression case, and the most important assertion in this file:
  // a mixed Korean/Latin label that passed the 60% gate today must still
  // pass it after the parser was widened to keep the Hangul names instead of
  // discarding them. Before the fix, this ratio was known.size / parsed.length
  // = 3/6 = 0.5, which is BELOW the gate — the Hangul names, kept but
  // unresolvable against a Latin-only dictionary, would have flipped a label
  // that works today into one that fails.
  it("a mixed Korean/Latin label that passes the gate today still passes it", () => {
    const parsed = [
      { inci_name: "정제수" },
      { inci_name: "글리세린" },
      { inci_name: "water" },
      { inci_name: "glycerin" },
      { inci_name: "niacinamide" },
      { inci_name: "panthenol" },
    ];
    const known = new Set(["water", "glycerin", "niacinamide"]);

    // Sanity check the regression this fixture pins: the naive ratio does
    // fail the gate, which is exactly why gateRatio has to differ from it.
    expect(known.size / parsed.length).toBeLessThan(MIN_KNOWN_INGREDIENT_RATIO);

    expect(gateRatio(parsed, known)).toBeGreaterThanOrEqual(MIN_KNOWN_INGREDIENT_RATIO);
  });

  it("a Latin-only label's ratio is unaffected — byte-identical to the naive ratio", () => {
    const parsed = [{ inci_name: "water" }, { inci_name: "glycerin" }, { inci_name: "unknownium" }];
    const known = new Set(["water", "glycerin"]);
    expect(gateRatio(parsed, known)).toBe(known.size / parsed.length);
  });

  it("a Korean-only label with nothing resolved still fails the gate — the honest, expected outcome before #201", () => {
    const parsed = [{ inci_name: "정제수" }, { inci_name: "글리세린" }, { inci_name: "나이아신아마이드" }];
    const known = new Set<string>();
    expect(gateRatio(parsed, known)).toBeLessThan(MIN_KNOWN_INGREDIENT_RATIO);
  });

  it("a resolved non-Latin name counts normally on both sides, once it is in the dictionary", () => {
    const parsed = [{ inci_name: "정제수" }, { inci_name: "글리세린" }];
    const known = new Set(["정제수", "글리세린"]);
    expect(gateRatio(parsed, known)).toBe(1);
  });
});
