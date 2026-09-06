import type { ProductWithIngredients, SkinProfile } from "@/data/types";
import { biggestConcern, matchProduct, positionWeightLabel } from "@/lib/matching";
import { CATEGORY_LABEL, INGREDIENT_RULES, type RuleCategory } from "@/lib/rules";
import { EMPTY_PROFILE } from "@/store/useAppStore";

function profile(overrides: Partial<SkinProfile> = {}): SkinProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

function synthetic(names: string[]): ProductWithIngredients {
  return {
    id: "synthetic",
    barcode: "0000000000000",
    brand: "Test",
    name: "Test",
    type: "serum",
    productType: "serum",
    area: "face",
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    ingredientIds: names,
    inStock: true,
    ingredients: names.map((name) => ({
      id: name,
      name,
      comedogenic: 0 as const,
      safety: "safe" as const,
      verified: true,
    })),
  };
}

const FILLER = ["water", "butylene glycol", "xanthan gum", "1,2-hexanediol"];

describe("rule categories", () => {
  /**
   * The explanation is grouped by category, so a rule without a valid one
   * would contribute to the score while being invisible in the breakdown —
   * the score and its stated reasons would disagree.
   */
  it("every rule declares a category that has a label", () => {
    for (const rule of INGREDIENT_RULES) {
      expect(typeof rule.category).toBe("string");
      expect(CATEGORY_LABEL[rule.category]).toBeTruthy();
    }
  });

  it("no rule sits in a category outside the union", () => {
    const valid = new Set(Object.keys(CATEGORY_LABEL) as RuleCategory[]);
    for (const rule of INGREDIENT_RULES) {
      expect(valid.has(rule.category)).toBe(true);
    }
  });
});

describe("scoreFactors", () => {
  it("rolls several ingredients up into one named factor", () => {
    const result = matchProduct(
      synthetic(["water", "glycerin", "sodium hyaluronate", "urea", ...FILLER]),
      profile({ baseSkinType: "dry", concerns: ["dehydrated"] })
    );
    const hydration = result.factors.find((f) => f.category === "hydration");
    expect(hydration).toBeDefined();
    expect(hydration!.ingredients.length).toBeGreaterThan(1);
    expect(hydration!.label).toBe("Hydration");
  });

  /**
   * `reasons` is capped at six for readability. The bars must aggregate every
   * contribution regardless, or a factor built from many small effects would
   * silently under-report.
   */
  it("aggregates every contribution, not just the six shown as reasons", () => {
    const many = [
      "water", "glycerin", "sodium hyaluronate", "urea", "panthenol", "allantoin",
      "centella asiatica extract", "bisabolol", "beta-glucan", "niacinamide",
    ];
    const result = matchProduct(many.length ? synthetic(many) : synthetic(FILLER), profile({
      baseSkinType: "dry",
      concerns: ["dehydrated", "redness"],
      sensitivity: "some",
    }));
    const counted = result.factors.reduce((n, f) => n + f.ingredients.length, 0);
    expect(result.reasons.length).toBeLessThanOrEqual(6);
    expect(counted).toBeGreaterThan(result.reasons.length);
  });

  it("drops factors that netted to zero rather than drawing an empty bar", () => {
    const result = matchProduct(
      synthetic(["water", "glycerin", ...FILLER]),
      profile({ baseSkinType: "dry", concerns: ["dehydrated"] })
    );
    for (const factor of result.factors) {
      expect(factor.delta).not.toBe(0);
    }
  });

  it("scales magnitude against the largest factor so bars stay readable", () => {
    const result = matchProduct(
      synthetic(["water", "parfum", "glycerin", ...FILLER]),
      profile({ baseSkinType: "dry", concerns: ["dehydrated"], sensitivity: "some" })
    );
    const magnitudes = result.factors.map((f) => f.magnitude);
    expect(Math.max(...magnitudes)).toBeCloseTo(1);
    for (const m of magnitudes) {
      expect(m).toBeGreaterThan(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });

  it("orders factors by how much they moved the score", () => {
    const result = matchProduct(
      synthetic(["water", "parfum", "niacinamide", "glycerin", ...FILLER]),
      profile({ baseSkinType: "oily", concerns: ["large-pores"], sensitivity: "some" })
    );
    const sizes = result.factors.map((f) => Math.abs(f.delta));
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it("returns no factors when it declined to score", () => {
    const result = matchProduct(synthetic(["water", "glycerin"]), profile({ baseSkinType: "dry" }));
    expect(result.score).toBeNull();
    expect(result.factors).toEqual([]);
  });
});

describe("biggestConcern", () => {
  it("names the largest factor working against the profile", () => {
    const result = matchProduct(
      synthetic(["water", "parfum", "glycerin", ...FILLER]),
      profile({ baseSkinType: "dry", concerns: ["dehydrated"], sensitivity: "some" })
    );
    const concern = biggestConcern(result);
    expect(concern?.category).toBe("fragrance");
    expect(concern!.delta).toBeLessThan(0);
  });

  it("is null when nothing works against the profile", () => {
    const result = matchProduct(
      synthetic(["water", "glycerin", "sodium hyaluronate", "panthenol", ...FILLER]),
      profile({ baseSkinType: "dry", concerns: ["dehydrated"] })
    );
    expect(biggestConcern(result)).toBeNull();
  });
});

describe("positionWeightLabel", () => {
  /** The words must track the maths, or the detail screen contradicts the score. */
  it("describes the concentration bands in the same order as the weighting", () => {
    expect(positionWeightLabel(0)).toBe("high concentration");
    expect(positionWeightLabel(4)).toBe("significant");
    expect(positionWeightLabel(8)).toBe("moderate");
    expect(positionWeightLabel(15)).toBe("low");
    expect(positionWeightLabel(30)).toBe("trace");
  });
});
