import type { Ingredient, SkinProfile } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import {
  SCORING_FIXTURE_SCHEMA_VERSION,
  SCORING_PRODUCTS,
  type ScoringProductFixture,
} from "../test-fixtures/scoring-products";

/**
 * This suite checks properties the scoring model is meant to preserve. It
 * deliberately does not assign a universal verdict to a product: suitability
 * depends on the user's profile, and a public formula is not clinical proof of
 * efficacy. Source-linked snapshots make the inputs auditable; same-formula
 * comparisons make the expected direction explicit without freezing a score.
 */

const byId = new Map(SCORING_PRODUCTS.map((product) => [product.id, product]));

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
  const caution = new Set(product.caution);
  const avoid = new Set(product.avoid);

  return product.inci.map((name, position) => ({
    id: `${product.id}:${position}`,
    name,
    comedogenic: 0,
    safety: avoid.has(name) ? "avoid" : caution.has(name) ? "caution" : "safe",
    verified: true,
  }));
}

function score(productId: string, skinProfile: SkinProfile): number {
  const fixture = byId.get(productId);
  if (!fixture) throw new Error(`Unknown scoring fixture: ${productId}`);

  const result = matchProduct(
    { type: fixture.type, ingredients: ingredientsFor(fixture) },
    skinProfile
  );
  if (result.score === null) {
    throw new Error(`${fixture.name} unexpectedly returned ${result.unknownReason}`);
  }
  return result.score;
}

type DirectionalInvariant = {
  productId: string;
  expectation: string;
  betterFor: SkinProfile;
  thanFor: SkinProfile;
};

const DIRECTIONAL_INVARIANTS: DirectionalInvariant[] = [
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
    productId: "obf-0769915190373",
    expectation: "lactic acid favors dull skin that is not reactive",
    betterFor: profile({ concerns: ["dullness"] }),
    thanFor: profile({ concerns: ["dullness"], sensitivity: "high" }),
  },
  {
    productId: "obf-0769915233506",
    expectation: "its hyaluronic-acid system favors dehydrated skin",
    betterFor: profile({ baseSkinType: "dry", concerns: ["dehydrated"] }),
    thanFor: profile(),
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
    productId: "obf-8809416471655",
    expectation: "betaine salicylate favors oily, congestion-prone skin",
    betterFor: profile({ baseSkinType: "oily", concerns: ["large-pores"] }),
    thanFor: profile(),
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

describe("scoring validation fixture provenance", () => {
  it("uses the current fixture schema and exactly 20 unique public records", () => {
    expect(SCORING_FIXTURE_SCHEMA_VERSION).toBe(1);
    expect(SCORING_PRODUCTS).toHaveLength(20);
    expect(new Set(SCORING_PRODUCTS.map(({ id }) => id)).size).toBe(20);
    expect(new Set(SCORING_PRODUCTS.map(({ sourceUrl }) => sourceUrl)).size).toBe(20);
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
    expect(product.caution.every((name) => product.inci.includes(name))).toBe(true);
    expect(product.avoid.every((name) => product.inci.includes(name))).toBe(true);
  });
});

describe("scoring validation invariants", () => {
  it.each(SCORING_PRODUCTS)("can score the exact $name snapshot", (product: ScoringProductFixture) => {
    expect(score(product.id, profile())).toEqual(expect.any(Number));
  });

  it.each(DIRECTIONAL_INVARIANTS)("$productId — $expectation", (testCase: DirectionalInvariant) => {
    expect(score(testCase.productId, testCase.betterFor)).toBeGreaterThan(
      score(testCase.productId, testCase.thanFor)
    );
  });
});
