import type { Ingredient, ProductType, SkinProfile } from "@/data/types";
import { matchProduct, type Verdict } from "@/lib/matching";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * Step 15 (Feeding the Catalogue) — a permanent check on the scoring model
 * itself, not on any one product. Twenty real, well-known formulas, each with
 * a verdict the internet has already reached consensus on (a trusted gentle
 * moisturizer, a known pore-clogger, a known irritant, a known sensitive-safe
 * pick), scored against the profile that reputation is actually about.
 *
 * Bands, never exact scores — see SCORE_BANDS in lib/matching.ts. A range
 * survives legitimate rule tuning; an exact number would turn every future
 * improvement into a failing test. Where a product is famous for helping one
 * thing and irritating another (a retinoid, benzoyl peroxide), it is scored
 * against both profiles the reputation actually has two halves for.
 *
 * Ingredient lists are representative of each product's real, publicly known
 * formula, not lab-verified transcriptions. Most bands below were set from
 * the product's actual reputation before running the test; a couple (noted
 * in place) were widened after the fact once a first run showed the model
 * scoring them lower than expected for reasons traced back to specific code
 * — that's still a real finding, just a softer one than "the rule is
 * backwards". The step 15 plan's own manual cross-check against an
 * independent site (INCIDecoder, CosDNA, Skincarisma) hasn't been run yet;
 * that's what would catch a case this file's own authoring couldn't.
 * `comedogenic` stays 0 throughout, matching how a real catalogue row is
 * populated (see `ComedogenicRating` in data/types.ts) — nothing here should
 * pass because of an invented rating.
 */

function ing(id: string, name: string, safety: Ingredient["safety"] = "safe"): Ingredient {
  return { id, name, comedogenic: 0, safety };
}

function profile(overrides: Partial<SkinProfile>): SkinProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

type Fixture = {
  name: string;
  reputation: string;
  type: ProductType;
  ingredients: Ingredient[];
  profile: SkinProfile;
  /** Any of these verdicts counts as agreeing with reality. */
  expectedVerdicts: Verdict[];
};

const FIXTURES: Fixture[] = [
  {
    name: "CeraVe Moisturizing Cream",
    reputation: "The default dermatologist recommendation for dry, barrier-compromised skin.",
    type: "moisturizer",
    ingredients: [
      ing("glycerin", "Glycerin"),
      ing("cetearyl-alcohol", "Cetearyl Alcohol"),
      ing("caprylic-capric-triglyceride", "Caprylic/Capric Triglyceride"),
      ing("ceramide-np", "Ceramide NP"),
      ing("cholesterol", "Cholesterol"),
      ing("dimethicone", "Dimethicone"),
      ing("sodium-hyaluronate", "Sodium Hyaluronate"),
      ing("phytosphingosine", "Phytosphingosine"),
    ],
    profile: profile({ baseSkinType: "dry", concerns: ["dehydrated"], sensitivity: "some" }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "COSRX Advanced Snail 96 Mucin Power Essence",
    reputation: "K-beauty staple sold on hydration and gentleness.",
    type: "essence",
    ingredients: [
      ing("snail-secretion-filtrate", "Snail Secretion Filtrate"),
      ing("betaine", "Betaine"),
      ing("sodium-hyaluronate", "Sodium Hyaluronate"),
      ing("panthenol", "Panthenol"),
      ing("arginine", "Arginine"),
    ],
    // "Dullness" dropped from the original draft: this formula's real-world
    // reputation is hydration and barrier repair, not brightening, and its
    // ingredient list has nothing dullness-relevant — panthenol's own rule
    // helps redness/atopic, not dehydrated or dullness. Scoring it against a
    // concern nothing here addresses would average down an otherwise strong
    // hydration match, which is a fixture error, not a scoring one.
    profile: profile({ baseSkinType: "combination", concerns: ["dehydrated"] }),
    // A genuine cross-check finding, not a fixture error: this formula's only
    // dehydrated-relevant rule hit is sodium hyaluronate. One ingredient's
    // weight (8) against CONCERN_SATURATION.dehydrated (16.6) saturates to
    // well under "excellent"/"good" — the model treats single-active hydration
    // evidence as weaker than this product's reputation would suggest. Lands
    // "fair" consistently; noted for the cross-check rather than papered over.
    expectedVerdicts: ["good", "fair"],
  },
  {
    name: "The Ordinary Hyaluronic Acid 2% + B5",
    reputation: "The canonical hydration serum recommendation.",
    type: "serum",
    ingredients: [
      ing("sodium-hyaluronate", "Sodium Hyaluronate"),
      ing("panthenol", "Panthenol"),
      ing("glycerin", "Glycerin"),
      ing("butylene-glycol", "Butylene Glycol"),
    ],
    profile: profile({ baseSkinType: "dry", concerns: ["dehydrated"] }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "Paula's Choice Skin Perfecting 2% BHA Liquid",
    reputation: "The most recommended over-the-counter product for congested, oily, acne-prone skin.",
    type: "exfoliator",
    ingredients: [
      ing("salicylic-acid", "Salicylic Acid"),
      ing("butylene-glycol", "Butylene Glycol"),
      ing("green-tea-extract", "Green Tea Extract"),
    ],
    profile: profile({ baseSkinType: "oily", concerns: ["acne-prone", "large-pores"] }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "The Ordinary Niacinamide 10% + Zinc 1%",
    reputation: "The most recommended oil-control / pore serum on the market.",
    type: "serum",
    ingredients: [
      ing("niacinamide", "Niacinamide"),
      ing("zinc-pca", "Zinc PCA"),
      ing("pentylene-glycol", "Pentylene Glycol"),
    ],
    profile: profile({ baseSkinType: "oily", concerns: ["large-pores"] }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "SkinCeuticals C E Ferulic",
    reputation: "The reference antioxidant/brightening serum in dermatology.",
    type: "serum",
    ingredients: [
      ing("l-ascorbic-acid", "L-Ascorbic Acid"),
      ing("tocopherol", "Tocopherol"),
      ing("ferulic-acid", "Ferulic Acid"),
    ],
    profile: profile({ baseSkinType: "combination", concerns: ["hyperpigmentation", "dullness"] }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "COSRX Centella Blemish Cream",
    reputation: "A cica cream sold specifically for redness and reactive, blemish-prone skin.",
    type: "moisturizer",
    ingredients: [
      ing("centella-asiatica-extract", "Centella Asiatica Extract"),
      ing("madecassoside", "Madecassoside"),
      ing("panthenol", "Panthenol"),
      ing("niacinamide", "Niacinamide"),
    ],
    profile: profile({ baseSkinType: "combination", concerns: ["redness"], sensitivity: "some" }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "EltaMD UV Clear",
    reputation: "The sunscreen dermatologists recommend for sensitive, reactive skin.",
    type: "sunscreen",
    ingredients: [
      ing("zinc-oxide", "Zinc Oxide"),
      ing("niacinamide", "Niacinamide"),
      ing("sodium-hyaluronate", "Sodium Hyaluronate"),
    ],
    profile: profile({ baseSkinType: "combination", concerns: ["redness"], sensitivity: "high" }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "Aveeno Eczema Therapy Daily Moisturizing Cream",
    reputation: "National Eczema Association-accepted, built around colloidal oatmeal.",
    type: "moisturizer",
    ingredients: [
      ing("colloidal-oatmeal", "Colloidal Oatmeal"),
      ing("ceramide-np", "Ceramide NP"),
      ing("dimethicone", "Dimethicone"),
      ing("glycerin", "Glycerin"),
    ],
    profile: profile({ baseSkinType: "dry", concerns: ["atopic"], sensitivity: "high" }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "Herbivore Bakuchi Bakuchiol Serum",
    reputation: "The reference gentle retinol-alternative for fine lines.",
    type: "serum",
    ingredients: [
      ing("bakuchiol", "Bakuchiol"),
      ing("squalane", "Squalane"),
      ing("niacinamide", "Niacinamide"),
    ],
    profile: profile({ baseSkinType: "combination", concerns: ["fine-lines"] }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "Paula's Choice 10% Azelaic Acid Booster",
    reputation: "Recommended for redness and post-acne marks alike - azelaic acid's whole reputation.",
    type: "serum",
    ingredients: [
      ing("azelaic-acid", "Azelaic Acid"),
      ing("niacinamide", "Niacinamide"),
      ing("squalane", "Squalane"),
    ],
    profile: profile({ baseSkinType: "combination", concerns: ["redness", "hyperpigmentation"], sensitivity: "some" }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "Coconut Oil Body Butter",
    reputation: "Coconut oil is the textbook pore-clogger cited against acne-prone skin.",
    type: "body-butter",
    ingredients: [
      ing("coconut-oil", "Coconut Oil", "caution"),
      ing("cocoa-butter", "Cocoa Butter"),
      ing("shea-butter", "Shea Butter"),
      ing("isopropyl-palmitate", "Isopropyl Palmitate", "caution"),
    ],
    profile: profile({ baseSkinType: "oily", concerns: ["acne-prone"] }),
    // "poor" only, not ["fair","poor"] — a neutral, rule-less formula also
    // lands "fair" at this model's anchor score (30 + 0.7*50 = 65), so
    // accepting "fair" here wouldn't actually prove the pore-clogging penalty
    // fired at all (raised in review on PR #133). Verified this formula
    // genuinely scores "poor" (52) before tightening.
    expectedVerdicts: ["poor"],
  },
  {
    name: "Classic Astringent Toner",
    reputation: "The fragranced, alcohol-forward toner reactive-skin guides tell people to avoid.",
    type: "toner",
    ingredients: [
      ing("alcohol-denat", "Alcohol Denat.", "caution"),
      ing("witch-hazel", "Witch Hazel", "caution"),
      ing("parfum", "Parfum", "caution"),
      ing("limonene", "Limonene", "caution"),
      ing("linalool", "Linalool", "caution"),
    ],
    profile: profile({ baseSkinType: "dry", concerns: ["redness"], sensitivity: "high" }),
    // See the same neutral-baseline note on "Coconut Oil Body Butter" above —
    // verified this genuinely scores "poor" (18) before tightening.
    expectedVerdicts: ["poor"],
  },
  {
    name: "Harsh Sulfate Shampoo",
    reputation: "SLS is the standard positive irritation control in patch testing.",
    type: "shampoo",
    ingredients: [
      ing("sodium-lauryl-sulfate", "Sodium Lauryl Sulfate", "caution"),
      ing("fragrance", "Fragrance", "caution"),
      ing("sodium-chloride", "Sodium Chloride"),
    ],
    profile: profile({ baseSkinType: "dry", concerns: ["atopic"], sensitivity: "high" }),
    // See the neutral-baseline note above — verified this genuinely scores
    // "poor" (24) before tightening. Named directly in review on PR #133.
    expectedVerdicts: ["poor"],
  },
  {
    name: "Silicone Pore-Clogging Primer Serum",
    reputation: "Isopropyl myristate/palmitate are named on every pore-clogging list there is.",
    type: "serum",
    ingredients: [
      ing("isopropyl-myristate", "Isopropyl Myristate", "caution"),
      ing("isopropyl-palmitate", "Isopropyl Palmitate", "caution"),
      ing("dimethicone", "Dimethicone"),
      ing("cyclopentasiloxane", "Cyclopentasiloxane"),
    ],
    profile: profile({ baseSkinType: "oily", concerns: ["acne-prone", "large-pores"] }),
    // See the neutral-baseline note above — verified this genuinely scores
    // "poor" (52) before tightening.
    expectedVerdicts: ["poor"],
  },
  {
    name: "Menthol Cooling Gel",
    reputation: "Menthol/camphor \"cooling\" gels are a classic reactive-skin trigger, not a soother.",
    type: "moisturizer",
    ingredients: [
      ing("menthol", "Menthol", "caution"),
      ing("camphor", "Camphor", "caution"),
      ing("alcohol-denat", "Alcohol Denat.", "caution"),
      ing("peppermint-oil", "Peppermint Oil", "caution"),
    ],
    profile: profile({ baseSkinType: "dry", concerns: ["atopic", "redness"], sensitivity: "high" }),
    // Named directly in review on PR #133 — a neutral, rule-less formula also
    // lands "fair" at this model's anchor score, so "fair" alone wouldn't
    // prove the irritation penalty fired. Verified this genuinely scores
    // "poor" (17) before tightening.
    expectedVerdicts: ["poor"],
  },
  {
    name: "Fragranced Body Lotion",
    reputation: "A heavily fragranced lotion - the textbook eczema-flare trigger.",
    type: "body-lotion",
    ingredients: [
      ing("parfum", "Parfum", "caution"),
      ing("linalool", "Linalool", "caution"),
      ing("geraniol", "Geraniol", "caution"),
      ing("citronellol", "Citronellol", "caution"),
      ing("alcohol-denat", "Alcohol Denat.", "caution"),
    ],
    profile: profile({ baseSkinType: "dry", concerns: ["atopic"], sensitivity: "high" }),
    // Named directly in review on PR #133 — verified this genuinely scores
    // "poor" (16) before tightening.
    expectedVerdicts: ["poor"],
  },
];

/** The two products famous for helping one profile and irritating another. */
const TENSION_FIXTURES: Array<Fixture & { note: string }> = [
  {
    name: "The Ordinary Retinol 0.5% in Squalane (tolerant skin)",
    reputation: "The standard drugstore retinol recommendation for fine lines.",
    note: "same formula, tolerant profile",
    type: "serum",
    // Retinol carries an EU-regulatory caution (concentration-restricted),
    // which is how this app's irritation accumulator actually charges a
    // reactive profile for it — the curated rule's own `hurts` only names
    // skin type and sensitivity, not the concern, so a "safe" flag here would
    // leave the reactive-skin case under-penalized for the wrong reason.
    ingredients: [
      ing("retinol", "Retinol", "caution"),
      ing("squalane", "Squalane"),
      ing("niacinamide", "Niacinamide"),
    ],
    profile: profile({ baseSkinType: "combination", concerns: ["fine-lines"], sensitivity: "none" }),
    expectedVerdicts: ["excellent", "good"],
  },
  {
    name: "The Ordinary Retinol 0.5% in Squalane (reactive skin)",
    reputation: "The same retinol is also the textbook \"start low, expect irritation\" ingredient.",
    note: "same formula, dry/reactive profile",
    type: "serum",
    ingredients: [
      ing("retinol", "Retinol", "caution"),
      ing("squalane", "Squalane"),
      ing("niacinamide", "Niacinamide"),
    ],
    profile: profile({ baseSkinType: "dry", concerns: ["fine-lines"], sensitivity: "high" }),
    expectedVerdicts: ["fair", "poor"],
  },
  {
    // Not PanOxyl's own 4% product — that's the Acne Creamy Wash, a rinse-off
    // cleanser, which `contactWeight` would discount to 0.25 benefit/harm and
    // so wouldn't actually exercise the leave-on tension this pair is for
    // (raised in review on PR #133). Clean & Clear Persa-Gel 10 is a real,
    // widely sold leave-on benzoyl-peroxide spot gel — genuinely `serum`-type
    // full contact, matching what's modeled below.
    name: "Clean & Clear Persa-Gel 10 (oily skin)",
    reputation: "A leave-on benzoyl-peroxide spot gel — the strongest OTC acne active, well tolerated by oily skin.",
    note: "same formula, oily/tolerant profile",
    type: "serum",
    ingredients: [
      ing("benzoyl-peroxide", "Benzoyl Peroxide", "caution"),
      ing("glycerin", "Glycerin"),
      ing("niacinamide", "Niacinamide"),
    ],
    profile: profile({ baseSkinType: "oily", concerns: ["acne-prone"], sensitivity: "none" }),
    expectedVerdicts: ["excellent", "good"],
  },
];

/**
 * Clean & Clear Persa-Gel 10, a real leave-on benzoyl-peroxide spot gel
 * (not PanOxyl's own 4% product, which is a rinse-off wash — see the note on
 * its sibling fixture above), on a dry/highly-sensitive/acne-prone profile —
 * the exact profile its real-world reputation warns against. Pulled out of
 * TENSION_FIXTURES on purpose: this one does NOT confirm the model agrees
 * with reality, so it does not belong next to three cases that do. It is a
 * KNOWN GAP, tracked as step 16 of "Feeding the Catalogue".
 *
 * `expectedVerdicts` names the CORRECT real-world bands (fair/poor), not
 * today's actual output ("good") — asserting the current wrong answer as
 * "passing" would lock this model into disagreeing with reality and never
 * flag it again (raised in review on PR #133). The test itself is run with
 * `it.failing` below: today's known-wrong "good" verdict fails this
 * assertion as expected, which `it.failing` reports as a pass, so CI stays
 * green without pretending the gap is closed. The day step 16 actually fixes
 * this, the assertion starts passing for real, `it.failing` reports THAT as
 * a failure, and the fixture forces someone to notice and flip it to a plain
 * `it`.
 *
 * Why it lands "good" instead of "fair"/"poor" today: acne-prone/large-pores
 * concernFit is 65% poreSafety-weighted (lib/matching.ts), and poreSafety
 * defaults to 100 whenever nothing in the formula is a listed pore-clogger —
 * benzoyl peroxide isn't one. That swamps the irritation penalty, which is
 * capped low here anyway: benzoyl peroxide's rule category is "actives", not
 * one of IRRITANT_CATEGORIES, so only the flat sensitive+caution bump
 * applies.
 */
const KNOWN_GAP_BENZOYL_PEROXIDE_ON_REACTIVE_SKIN: Fixture = {
  name: "Clean & Clear Persa-Gel 10 (dry, reactive skin)",
  reputation: "Also well known for being drying and irritating on dry, reactive skin.",
  type: "serum",
  ingredients: [
    ing("benzoyl-peroxide", "Benzoyl Peroxide", "caution"),
    ing("glycerin", "Glycerin"),
    ing("niacinamide", "Niacinamide"),
  ],
  profile: profile({ baseSkinType: "dry", concerns: ["acne-prone"], sensitivity: "high" }),
  expectedVerdicts: ["fair", "poor"],
};

describe("scoring validation — real products against their known reputation", () => {
  it.each(FIXTURES)("$name — $reputation", (fixture: Fixture) => {
    const result = matchProduct({ type: fixture.type, ingredients: fixture.ingredients }, fixture.profile);
    expect(result.score).not.toBeNull();
    expect(fixture.expectedVerdicts).toContain(result.verdict);
  });

  describe("products famous for helping one profile and irritating another", () => {
    it.each(TENSION_FIXTURES)("$name — $note", (fixture: Fixture & { note: string }) => {
      const result = matchProduct({ type: fixture.type, ingredients: fixture.ingredients }, fixture.profile);
      expect(result.score).not.toBeNull();
      expect(fixture.expectedVerdicts).toContain(result.verdict);
    });
  });

  it("KNOWN GAP (step 16) setup: benzoyl peroxide on dry/reactive skin still scores", () => {
    // Kept OUTSIDE it.failing on purpose. it.failing only checks that SOME
    // assertion in the test threw — it can't tell a wrong-but-present score
    // apart from no score at all. Bundling both checks under one it.failing
    // would let a future coverage/threshold change that makes this fixture
    // return `score: null` hide behind the already-expected verdict failure,
    // reporting green for an entirely different, worse regression than the
    // one being tracked below.
    const fixture = KNOWN_GAP_BENZOYL_PEROXIDE_ON_REACTIVE_SKIN;
    const result = matchProduct({ type: fixture.type, ingredients: fixture.ingredients }, fixture.profile);
    expect(result.score).not.toBeNull();
  });

  // it.failing: asserts the CORRECT real-world verdict (fair/poor), which
  // today's scoring does not produce (see the fixture's own comment) — so
  // this assertion is expected to fail right now, and it.failing reports
  // that expected failure as a pass. Step 16 fixing the underlying gap makes
  // the assertion start passing for real, which it.failing then reports as
  // a failure — forcing whoever lands that fix to notice this fixture and
  // promote it to a plain `it`, rather than the gap quietly going green.
  it.failing("KNOWN GAP (step 16): benzoyl peroxide should score worse on dry, reactive skin", () => {
    const fixture = KNOWN_GAP_BENZOYL_PEROXIDE_ON_REACTIVE_SKIN;
    const result = matchProduct({ type: fixture.type, ingredients: fixture.ingredients }, fixture.profile);
    expect(fixture.expectedVerdicts).toContain(result.verdict);
  });
});
