import type { Ingredient, SkinProfile } from "@/data/types";
import { matchProduct, resetScoreCache, ruleFor } from "@/lib/matching";
import { positionWeights } from "@/lib/rules";
import dictionarySnapshot from "../test-fixtures/scoring-dictionary.json";
import { SCORING_PRODUCTS } from "../test-fixtures/scoring-products";

/**
 * #301: what "very sensitive" does to a fragranced product today. A record of
 * current behaviour, not a target — the investigation and the options are in
 * docs/scoring-validation-gaps.md. If a scoring change moves these numbers on
 * purpose, update them in the same PR.
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

describe("#301: 'very sensitive' and a fragranced product, today", () => {
  it("costs a plain cream only two more points than 'somewhat', because its parfum is last", () => {
    expect(byLevel("moisturizer", plainCream)).toEqual({
      none: { score: 84, penalty: 0 },
      some: { score: 81, penalty: 3.32 },
      unset: { score: 81, penalty: 3.32 },
      high: { score: 79, penalty: 5.31 },
    });
  });

  it("because the position discount shrinks parfum's weight before the multiplier sees it", () => {
    const parfum = plainCream[19];
    const weight = ruleFor(parfum)!.weight;
    const position = positionWeights(PLAIN_CREAM)[19];
    // 9 × 0.369 = 3.32 of irritation; × 1 ("somewhat") vs × 1.6 ("very").
    expect(weight).toBe(9);
    expect(position).toBeCloseTo(0.369, 3);
    expect(weight * position).toBeCloseTo(3.32, 2);
    expect(weight * position * 1.6).toBeCloseTo(5.31, 2);
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
