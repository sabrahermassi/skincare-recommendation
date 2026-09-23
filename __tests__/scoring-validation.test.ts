import type { Ingredient, SkinProfile } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { INGREDIENT_RULES, ruleMatches } from "@/lib/rules";
import { RETINYL_RETINOATE_NAME } from "@/lib/retinoid-salicylate-names";
import dictionarySnapshot from "../test-fixtures/scoring-dictionary.json";
import {
  SCORING_FIXTURE_SCHEMA_VERSION,
  SCORING_PRODUCTS,
  type ScoringProductFixture,
} from "../test-fixtures/scoring-products";

/**
 * This suite checks properties the scoring model is meant to preserve. It
 * deliberately does not assign a universal verdict to a product: suitability
 * depends on the user's profile, and a public formula is not clinical proof of
 * efficacy. Source-linked snapshots make the inputs auditable; profile
 * comparisons and one-ingredient synthetic controls make the expected
 * direction explicit without freezing a score.
 */

const byId = new Map(SCORING_PRODUCTS.map((product) => [product.id, product]));
type DictionaryMetadata = Required<Pick<Ingredient, "safety" | "verified" | "functions">>;
const dictionary = dictionarySnapshot.ingredients as Record<string, DictionaryMetadata>;

function profile(overrides: Partial<SkinProfile> = {}): SkinProfile {
  return {
    concerns: [],
    baseSkinType: "normal",
    sensitivity: "none",
    pregnancyStatus: "neither",
    ...overrides,
  };
}

function ingredientsFor(product: ScoringProductFixture): Ingredient[] {
  return product.inci.map((name) => {
    const metadata = dictionary[name];
    if (!metadata) throw new Error(`Missing dictionary snapshot for ${name}`);
    return {
      id: name,
      name,
      comedogenic: 0,
      safety: metadata.safety,
      verified: metadata.verified,
      functions: metadata.functions,
    };
  });
}

function scoreFormula(
  fixture: ScoringProductFixture,
  skinProfile: SkinProfile,
  ingredients: Ingredient[]
): number {
  const result = matchProduct(
    { type: fixture.type, ingredients },
    skinProfile
  );
  if (result.score === null) {
    throw new Error(`${fixture.name} unexpectedly returned ${result.unknownReason}`);
  }
  return result.score;
}

function score(productId: string, skinProfile: SkinProfile): number {
  const fixture = byId.get(productId);
  if (!fixture) throw new Error(`Unknown scoring fixture: ${productId}`);
  return scoreFormula(fixture, skinProfile, ingredientsFor(fixture));
}

type DirectionalInvariant = {
  productId: string;
  expectation: string;
  betterFor: SkinProfile;
  thanFor: SkinProfile;
};

const DIRECTIONAL_INVARIANTS: DirectionalInvariant[] = [
  {
    productId: "dailymed-950edb4e-fbba-41e3-9ec5-973806e555e7",
    expectation: "benzoyl peroxide's declared sensitive-skin harm makes it a worse match for dry, highly sensitive acne-prone skin than for tolerant oily acne-prone skin",
    betterFor: profile({ concerns: ["acne-prone"], baseSkinType: "oily", sensitivity: "none" }),
    thanFor: profile({ concerns: ["acne-prone"], baseSkinType: "dry", sensitivity: "high" }),
  },
  {
    productId: "dailymed-0e9cd3e5-cff8-7594-e063-6394a90aad90",
    expectation: "its mineral filters, cica, panthenol and ceramide favor reactive red skin",
    betterFor: profile({ concerns: ["redness"], sensitivity: "high" }),
    thanFor: profile(),
  },
  {
    productId: "dailymed-14a9b605-f1f0-00e5-e063-6394a90a5a51",
    expectation: "its emollient formula favors dry skin",
    betterFor: profile({ baseSkinType: "dry" }),
    thanFor: profile(),
  },
  {
    productId: "dailymed-37fee381-ce6b-4949-9a4a-778aa839fb84",
    expectation: "its mineral filters favor sensitive skin",
    betterFor: profile({ sensitivity: "high" }),
    thanFor: profile(),
  },
  {
    productId: "dailymed-1c31f466-6a0d-46ce-9346-d2a0eb46c8d0",
    expectation: "its rich oils favor dry skin over congestion-prone skin",
    betterFor: profile({ baseSkinType: "dry" }),
    thanFor: profile({ baseSkinType: "oily", concerns: ["acne-prone"] }),
  },
  {
    productId: "obf-0769915233179",
    expectation: "its peptide system favors fine-line concerns",
    betterFor: profile({ concerns: ["fine-lines"] }),
    thanFor: profile(),
  },
  {
    productId: "obf-8699956514185",
    expectation: "its humectants and barrier ingredients favor dry, atopic skin",
    betterFor: profile({ baseSkinType: "dry", concerns: ["atopic"] }),
    thanFor: profile(),
  },
  {
    productId: "obf-0717334243408",
    expectation: "its fragrance allergens and essential oils penalize reactive skin",
    betterFor: profile({ baseSkinType: "dry", concerns: ["dehydrated"] }),
    thanFor: profile({ baseSkinType: "dry", concerns: ["dehydrated"], sensitivity: "high" }),
  },
  {
    productId: "obf-4005900773845",
    expectation: "its alcohol and fragrance allergens penalize reactive skin",
    betterFor: profile({ baseSkinType: "dry", concerns: ["dehydrated"] }),
    thanFor: profile({ baseSkinType: "dry", concerns: ["dehydrated"], sensitivity: "high" }),
  },
  {
    productId: "obf-42420125",
    expectation: "its alcohol, menthol and fragrance allergens penalize reactive skin",
    betterFor: profile({ baseSkinType: "dry", concerns: ["redness"] }),
    thanFor: profile({ baseSkinType: "dry", concerns: ["redness"], sensitivity: "high" }),
  },
  {
    productId: "obf-8809657116544",
    expectation: "its humectants favor dehydrated skin",
    betterFor: profile({ concerns: ["dehydrated"] }),
    thanFor: profile(),
  },
  {
    productId: "obf-8809843673431",
    expectation: "its humectants favor dehydrated skin",
    betterFor: profile({ concerns: ["dehydrated"] }),
    thanFor: profile(),
  },
];

type SignalInvariant = {
  productId: string;
  signal: string;
  expectation: string;
  skinProfile: SkinProfile;
};

const SIGNAL_INVARIANTS: SignalInvariant[] = [
  {
    productId: "obf-0769915190373",
    signal: "lactic acid",
    expectation: "lactic acid contributes to dullness fit",
    skinProfile: profile({ concerns: ["dullness"] }),
  },
  {
    productId: "obf-8809416471655",
    signal: "betaine salicylate",
    expectation: "betaine salicylate contributes to oily, large-pore fit",
    skinProfile: profile({ baseSkinType: "oily", concerns: ["large-pores"] }),
  },
];

describe("scoring validation fixture provenance", () => {
  it("uses the current fixture schema and exactly 21 unique public records", () => {
    expect(SCORING_FIXTURE_SCHEMA_VERSION).toBe(1);
    expect(dictionarySnapshot.schemaVersion).toBe(1);
    expect(dictionarySnapshot.capturedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SCORING_PRODUCTS).toHaveLength(21);
    expect(new Set(SCORING_PRODUCTS.map(({ id }) => id)).size).toBe(21);
    expect(new Set(SCORING_PRODUCTS.map(({ sourceUrl }) => sourceUrl)).size).toBe(21);
    expect(Object.keys(dictionary).sort()).toEqual(
      [...new Set(SCORING_PRODUCTS.flatMap(({ inci }) => inci))].sort()
    );
  });

  it.each(SCORING_PRODUCTS)("$name has a complete, internally consistent snapshot", (product: ScoringProductFixture) => {
    expect(product.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(product.inci.length).toBeGreaterThanOrEqual(3);
    expect(product.inci.every((name) => name.length > 0)).toBe(true);
    expect(product.sourceUrl).toMatch(
      /^https:\/\/(dailymed\.nlm\.nih\.gov\/dailymed\/drugInfo\.cfm\?setid=|world\.openbeautyfacts\.org\/product\/)/
    );
    const sourceId = product.id.replace(/^(dailymed|obf)-/, "");
    expect(product.sourceUrl.endsWith(sourceId)).toBe(true);
    const ingredients = ingredientsFor(product);
    expect(ingredients.filter(({ safety }) => safety === "caution").map(({ name }) => name))
      .toEqual(product.caution);
    expect(ingredients.filter(({ safety }) => safety === "avoid").map(({ name }) => name))
      .toEqual(product.avoid);
    expect(ingredients.every(({ verified, functions }) =>
      typeof verified === "boolean" && Array.isArray(functions)
    )).toBe(true);
  });
});

describe("scoring validation invariants", () => {
  it.each(SCORING_PRODUCTS)("can score the exact $name snapshot", (product: ScoringProductFixture) => {
    const ingredients = ingredientsFor(product);
    const result = matchProduct({ type: product.type, ingredients }, profile());
    expect(result.score).toEqual(expect.any(Number));
    expect(result.coverage).toBeCloseTo(
      ingredients.filter(({ verified }) => verified).length / ingredients.length,
      10
    );
  });

  it.each(DIRECTIONAL_INVARIANTS)("$productId — $expectation", (testCase: DirectionalInvariant) => {
    expect(score(testCase.productId, testCase.betterFor)).toBeGreaterThan(
      score(testCase.productId, testCase.thanFor)
    );
  });

  it.each(SIGNAL_INVARIANTS)("$productId — $expectation", (testCase: SignalInvariant) => {
    const fixture = byId.get(testCase.productId);
    if (!fixture) throw new Error(`Unknown scoring fixture: ${testCase.productId}`);

    const ingredients = ingredientsFor(fixture);
    const signalMatches = ingredients.filter(({ name }) => name === testCase.signal);
    expect(signalMatches).toHaveLength(1);
    expect(signalMatches[0].safety).toBe("safe");

    // A synthetic control, not another product: change only this rule-bearing
    // name. Keep its position, verification, safety and every other ingredient
    // unchanged so no other signal or formula-coverage difference can explain
    // the score delta.
    const neutralized = ingredients.map((ingredient) =>
      ingredient.name === testCase.signal
        ? { ...ingredient, name: "unmatched test control" }
        : ingredient
    );

    expect(scoreFormula(fixture, testCase.skinProfile, ingredients)).toBeGreaterThan(
      scoreFormula(fixture, testCase.skinProfile, neutralized)
    );
  });

  it("uses dictionary function evidence when no named rule covers an ingredient", () => {
    const fixture = byId.get("obf-0717334243408");
    if (!fixture) throw new Error("Missing Origins moisturizer fixture");
    const ingredients = ingredientsFor(fixture);
    const signal = ingredients.find(({ name }) => name === "hydroxyethyl urea");
    expect(signal?.verified).toBe(true);
    expect(signal?.functions).toContain("humectant");
    expect(INGREDIENT_RULES.some((rule) => ruleMatches(rule, "hydroxyethyl urea"))).toBe(false);

    // Remove only this declared function. Named rules, INCI order, safety and
    // coverage remain identical, so a missing fallback-scoring layer fails.
    const withoutFunction = ingredients.map((ingredient) =>
      ingredient.name === "hydroxyethyl urea"
        ? { ...ingredient, functions: ingredient.functions?.filter((role) => role !== "humectant") }
        : ingredient
    );
    const dryProfile = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
    expect(scoreFormula(fixture, dryProfile, ingredients)).toBeGreaterThan(
      scoreFormula(fixture, dryProfile, withoutFunction)
    );
  });
});

describe("declared reactive-skin harm reaches the irritation penalty", () => {
  // No public fixture is a benzoyl-peroxide product, so this uses a synthetic
  // leave-on formula: only the benzoyl-peroxide slot changes between the two
  // arms, keeping its position, verification and safety identical.
  const formula = (active: string): Ingredient[] =>
    [
      "water", active, "glycerin", "propanediol", "carbomer",
      "xanthan gum", "allantoin", "panthenol", "disodium edta", "tocopherol",
    ].map((name) => ({
      id: name,
      name,
      comedogenic: 0,
      safety: "safe",
      verified: true,
      functions: [],
    }));
  const treatment = (active: string) => ({ type: "serum" as const, ingredients: formula(active) });
  const acne = (sensitivity: SkinProfile["sensitivity"], baseSkinType: SkinProfile["baseSkinType"] = "oily") =>
    profile({ concerns: ["acne-prone"], baseSkinType, sensitivity });
  const scoreOf = (active: string, skinProfile: SkinProfile) => {
    const result = matchProduct(treatment(active), skinProfile);
    if (result.score === null) throw new Error("unexpectedly unscored");
    return result;
  };

  it("benzoyl peroxide still helps acne-prone skin that tolerates it", () => {
    const tolerant = acne("none");
    expect(scoreOf("benzoyl peroxide", tolerant).score).toBeGreaterThan(
      scoreOf("unmatched test control", tolerant).score as number
    );
  });

  it("benzoyl peroxide costs more than it earns on highly sensitive acne-prone skin", () => {
    // Its acne benefit is real, but pore safety reads 100 for it, so the
    // benefit alone used to win here. The declared sensitive-skin harm must
    // now be charged as irritation and outweigh it.
    for (const skinProfile of [acne("high"), acne("high", "dry")]) {
      const withActive = scoreOf("benzoyl peroxide", skinProfile);
      const control = scoreOf("unmatched test control", skinProfile);
      expect(withActive.breakdown.irritationPenalty).toBeGreaterThan(
        control.breakdown.irritationPenalty
      );
      expect(withActive.score as number).toBeLessThan(control.score as number);
    }
  });

  it("the tolerant/reactive gap for benzoyl peroxide is larger than the profile difference alone", () => {
    const gap = (active: string) =>
      (scoreOf(active, acne("none")).score as number) -
      (scoreOf(active, acne("high", "dry")).score as number);
    expect(gap("benzoyl peroxide")).toBeGreaterThan(gap("unmatched test control"));
  });

  it("does not charge a caution-flagged active twice for the same declared harm", () => {
    // Benzoyl peroxide is both a rule-backed sensitive-skin harm and a
    // `caution` ingredient. Its rule now charges the irritation, so the generic
    // caution charge must not add a second one on top.
    const build = (safety: Ingredient["safety"]) =>
      formula("benzoyl peroxide").map((ingredient) =>
        ingredient.name === "benzoyl peroxide" ? { ...ingredient, safety } : ingredient
      );
    const penalty = (ingredients: Ingredient[]) =>
      matchProduct({ type: "serum", ingredients }, acne("high")).breakdown.irritationPenalty;
    expect(penalty(build("caution"))).toBe(penalty(build("safe")));
  });

  it("preserves the position curve instead of inflating a trace active through saturation", () => {
    const reactive = profile({ concerns: ["dullness"], sensitivity: "high" });
    const fillers = Array.from({ length: 40 }, (_, i) => `unmatched test control ${i}`);
    const penaltyAt = (active: string, index: number) => {
      const names = ["water", "glycerin", "propanediol", ...fillers];
      names.splice(index, 0, active);
      const ingredients: Ingredient[] = names.map((name) => ({
        id: name,
        name,
        comedogenic: 0,
        safety: "safe",
        verified: true,
        functions: [],
      }));
      return matchProduct({ type: "serum", ingredients }, reactive).breakdown.irritationPenalty;
    };
    for (const active of ["salicylic acid", "ascorbic acid", "retinol"]) {
      const ratio = penaltyAt(active, 33) / penaltyAt(active, 3);
      // Saturation used to lift this to about 0.5; a trace active must now cost well under half.
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(0.4);
    }
  });

  it("charges the real DailyMed benzoyl-peroxide gel's active as irritation on sensitive skin", () => {
    const fixture = byId.get("dailymed-950edb4e-fbba-41e3-9ec5-973806e555e7");
    if (!fixture) throw new Error("Missing benzoyl peroxide fixture");
    const ingredients = ingredientsFor(fixture);
    const neutralized = ingredients.map((ingredient) =>
      ingredient.name === "benzoyl peroxide" ? { ...ingredient, name: "unmatched test control" } : ingredient
    );
    const penalty = (skinProfile: SkinProfile, list: Ingredient[]) =>
      matchProduct({ type: fixture.type, ingredients: list }, skinProfile).breakdown.irritationPenalty;
    const reactive = acne("high");
    expect(penalty(reactive, ingredients)).toBeGreaterThan(penalty(reactive, neutralized));
    // A tolerant profile is not charged for it.
    expect(penalty(acne("none"), ingredients)).toBe(penalty(acne("none"), neutralized));
  });

  it.each(["ascorbyl glucoside", "3-o-ethyl ascorbic acid", "magnesium ascorbyl phosphate", "retinyl palmitate"])(
    "%s keeps its benefit without inheriting the parent active's irritation charge",
    (name: string) => {
      const ingredients = formula(name);
      const result = matchProduct(
        { type: "serum", ingredients },
        profile({ concerns: ["dullness", "hyperpigmentation"], sensitivity: "high" })
      );
      expect(result.breakdown.irritationPenalty).toBe(0);
      expect(result.reasons.some((reason) => reason.ingredient === name && reason.effect > 0)).toBe(true);
    }
  );

  // #256 round 2: retinyl retinoate previously shared its rule with plain
  // retinol, so it got retinol's full irritation weight too. It's now its
  // own rule, deliberately between retinol and the fully-discounted
  // retinyl-palmitate rule -- gentler than retinol, but (unlike retinyl
  // palmitate) not risk-free.
  it("retinyl retinoate is gentler than retinol but not risk-free", () => {
    const sensitiveDry = profile({ concerns: ["fine-lines"], sensitivity: "high", baseSkinType: "dry" });
    const retinolPenalty = matchProduct(treatment("retinol"), sensitiveDry).breakdown.irritationPenalty;
    const retinoatePenalty = matchProduct(
      treatment(RETINYL_RETINOATE_NAME),
      sensitiveDry
    ).breakdown.irritationPenalty;
    expect(retinoatePenalty).toBeGreaterThan(0);
    expect(retinoatePenalty).toBeLessThan(retinolPenalty as number);
  });

  it("keeps sparse hydration evidence partial rather than special-casing one formula", () => {
    const dehydrated = profile({ concerns: ["dehydrated"] });
    const sparse = ["water", "sodium hyaluronate", "unmatched test control"].map((name) => ({
      id: name, name, comedogenic: 0 as const, safety: "safe" as const, verified: true, functions: [],
    }));
    const broad = sparse.map((ingredient, index) =>
      index === 2 ? { ...ingredient, name: "glycerin", id: "glycerin" } : ingredient
    );
    const sparseResult = matchProduct({ type: "essence", ingredients: sparse }, dehydrated);
    const broadResult = matchProduct({ type: "essence", ingredients: broad }, dehydrated);
    expect(sparseResult.breakdown.concernFit).toBeGreaterThan(50);
    expect(broadResult.breakdown.concernFit).toBeGreaterThan(sparseResult.breakdown.concernFit!);
  });

  it("charges lactic acid's reactive-skin downside as irritation, not only sodium hydroxide's", () => {
    const fixture = byId.get("obf-0769915190373");
    if (!fixture) throw new Error("Missing lactic acid fixture");
    const ingredients = ingredientsFor(fixture);
    const neutralized = ingredients.map((ingredient) =>
      ingredient.name === "lactic acid" ? { ...ingredient, name: "unmatched test control" } : ingredient
    );
    const reactive = profile({ concerns: ["dullness"], sensitivity: "high" });
    const penalty = (list: Ingredient[]) =>
      matchProduct({ type: fixture.type, ingredients: list }, reactive).breakdown.irritationPenalty;
    expect(penalty(ingredients)).toBeGreaterThan(penalty(neutralized));
  });
});
