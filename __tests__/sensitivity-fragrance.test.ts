import type { Ingredient, SkinProfile } from "@/data/types";
import { matchProduct, resetScoreCache, ruleFor, scoreExplanation } from "@/lib/matching";
import { positionWeights } from "@/lib/rules";
import dictionarySnapshot from "../test-fixtures/scoring-dictionary.json";
import { SCORING_PRODUCTS } from "../test-fixtures/scoring-products";

/**
 * What "very sensitive" does to a fragranced product. #301 measured the gap
 * and compared options (docs/scoring-validation-gaps.md); #363 built option
 * A: for "very sensitive" only, a fragrance rule's irritation charge keeps at
 * least 0.7 of its weight wherever it sits. If a scoring change moves these
 * numbers on purpose, update them in the same PR.
 */

type Sensitivity = SkinProfile["sensitivity"];
const LEVELS: [string, Sensitivity][] = [
  ["none", "none"],
  ["some", "some"],
  ["unset", null],
  ["high", "high"],
];

/** Dry, dehydrated skin: no concern that fragrance counts against, so only sensitivity moves it. */
const at = (sensitivity: Sensitivity): SkinProfile => ({
  concerns: ["dehydrated"],
  baseSkinType: "dry",
  sensitivity,
  pregnancyStatus: null,
});

function byLevel(type: "moisturizer", ingredients: Ingredient[]) {
  return Object.fromEntries(
    LEVELS.map(([label, sensitivity]) => {
      resetScoreCache();
      const match = matchProduct({ type, ingredients }, at(sensitivity));
      return [label, { score: match.score, penalty: Math.round(match.breakdown.irritationPenalty * 100) / 100 }];
    })
  );
}

/** A plain cream whose only irritant is parfum, last on a 20-ingredient list. */
const PLAIN_CREAM = [
  "aqua", "glycerin", "caprylic/capric triglyceride", "cetearyl alcohol", "butylene glycol",
  "dimethicone", "glyceryl stearate", "peg-100 stearate", "squalane", "panthenol",
  "tocopherol", "sodium hyaluronate", "allantoin", "xanthan gum", "carbomer",
  "disodium edta", "phenoxyethanol", "ethylhexylglycerin", "citric acid", "parfum",
];
const plainCream = PLAIN_CREAM.map(
  (name): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true, functions: [] })
);

describe("'very sensitive' and a fragranced product (#301, #363)", () => {
  it("opens a clear gap between 'somewhat' and 'very' on a plain cream with parfum last", () => {
    expect(byLevel("moisturizer", plainCream)).toEqual({
      // Unchanged by #363.
      none: { score: 84, penalty: 0 },
      some: { score: 81, penalty: 3.32 },
      unset: { score: 81, penalty: 3.32 },
      // Was 79 (penalty 5.31) before #363.
      high: { score: 74, penalty: 10.08 },
    });
  });

  it("because 'very' charges parfum at least 0.7 of its weight, and the others by its position", () => {
    const parfum = plainCream[19];
    const weight = ruleFor(parfum)!.weight;
    const position = positionWeights(PLAIN_CREAM)[19];
    // "somewhat": 9 × 0.369 = 3.32. "very": 9 × max(0.369, 0.7) × 1.6 = 10.08.
    expect(weight).toBe(9);
    expect(position).toBeCloseTo(0.369, 3);
    expect(weight * position).toBeCloseTo(3.32, 2);
    expect(weight * 0.7 * 1.6).toBeCloseTo(10.08, 2);
  });

  it("says so in 'Why this score': the irritation line, and parfum charged what the score charged", () => {
    resetScoreCache();
    const match = matchProduct({ type: "moisturizer", ingredients: plainCream }, at("high"));
    expect(scoreExplanation(match).map((line) => line.label)).toContain("Irritation risk");
    const parfum = match.reasons.find((reason) => reason.ingredient === "parfum")!;
    expect(parfum.effect).toBeCloseTo(-9 * 0.7, 5);
    expect(match.breakdown.irritationPenalty).toBeCloseTo(-parfum.effect * 1.6, 5);
  });

  it("floors an EU fragrance allergen too, and a fragrance high in the list keeps its own weight", () => {
    const withAllergen = [...plainCream.slice(0, 19), { ...plainCream[19], id: "linalool", name: "linalool" }];
    const scoreAt = (ingredients: Ingredient[], sensitivity: Sensitivity) => {
      resetScoreCache();
      return matchProduct({ type: "moisturizer", ingredients }, at(sensitivity)).breakdown.irritationPenalty;
    };
    // linalool's rule weighs 6: 6 × 0.7 × 1.6.
    expect(scoreAt(withAllergen, "high")).toBeCloseTo(6 * 0.7 * 1.6, 5);
    // Second in the list its position factor (0.917) is already above the floor.
    const early = [plainCream[0], plainCream[19], ...plainCream.slice(1, 19)];
    expect(scoreAt(early, "high")).toBeCloseTo(9 * positionWeights(early.map((i) => i.name))[1] * 1.6, 5);
  });

  it("leaves a non-fragrance irritant at 'very' exactly as it was", () => {
    for (const irritant of ["alcohol denat", "glycolic acid"]) {
      const list = [...plainCream.slice(0, 19), { ...plainCream[19], id: irritant, name: irritant }];
      const position = positionWeights(list.map((i) => i.name))[19];
      resetScoreCache();
      const match = matchProduct({ type: "moisturizer", ingredients: list }, at("high"));
      expect(match.breakdown.irritationPenalty).toBeCloseTo(ruleFor(list[19])!.weight * position * 1.6, 5);
    }
  });

  it("moves a real fragranced cream much more, until the 34-point cap stops it", () => {
    // Nivea Rose Care: parfum 23rd of 23, plus alcohol denat and four EU fragrance allergens.
    const nivea = SCORING_PRODUCTS.find((product) => product.id === "obf-4005900773845")!;
    const dictionary = dictionarySnapshot.ingredients as Record<
      string,
      Required<Pick<Ingredient, "safety" | "verified" | "functions">>
    >;
    const ingredients = nivea.inci.map((name): Ingredient => ({ id: name, name, comedogenic: 0, ...dictionary[name] }));
    expect(nivea.type).toBe("moisturizer");
    expect(byLevel("moisturizer", ingredients)).toEqual({
      none: { score: 65, penalty: 4.13 },
      some: { score: 45, penalty: 24.5 },
      unset: { score: 44, penalty: 24.5 },
      high: { score: 36, penalty: 34 },
    });
  });
});
