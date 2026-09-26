import { fetchProduct } from "@/data/api";
import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import {
  confidenceLabel,
  isLowCoverage,
  matchProduct,
  matchTone,
  resetScoreCache,
  SCORE_BANDS,
  scoreExplanation,
  verdictHeadline,
  type MatchResult,
} from "@/lib/matching";
import { EMPTY_PROFILE } from "@/store/useAppStore";
import { ingredientLabel } from "@/lib/ingredient-labels";
import { isPersonalized } from "@/lib/profile";
import { EU_PROHIBITED_SOURCE, type Contraindication } from "@/lib/safety";

async function load(id: string): Promise<ProductWithIngredients> {
  const result = await fetchProduct(id);
  if (!result.ok) throw new Error(`fixture unreadable: ${id} (${result.failure.kind})`);
  if (!result.value) throw new Error(`fixture missing: ${id}`);
  return result.value;
}

function profile(overrides: Partial<SkinProfile> = {}): SkinProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

describe("matchProduct", () => {
  it("is deterministic for the same product and profile", async () => {
    const p = await load("hanbang-rice-serum");
    // Two equal but *distinct* profile objects, so the second call actually
    // recomputes. Passing the same object twice would be answered by the score
    // cache, and this assertion would hold even if the scoring were broken.
    const a = matchProduct(p, profile({ baseSkinType: "dry", concerns: ["dehydrated"] }));
    const b = matchProduct(p, profile({ baseSkinType: "dry", concerns: ["dehydrated"] }));
    expect(a).not.toBe(b);
    expect(a.score).toBe(b.score);
    expect(a.verdict).toBe(b.verdict);
  });

  /**
   * Skin-type fit now comes from the formula, not from product tags. The old
   * version of this test read `suitableFor`, which arrives empty from every
   * real source — only the hand-written samples ever had it. This one reads a
   * ceramide barrier cream, which the rules table favours for dry skin.
   *
   * The oily half used to compare scores. It cannot any more, and that is the
   * point: this formula holds nothing an oily profile cares about, so the
   * engine now declines rather than returning the untouched base score. The
   * assertion is the same one either way — the verdict must differ by skin
   * type, and it must differ because of what is in the jar.
   */
  it("derives skin-type fit from the ingredients, not from product tags", async () => {
    const p = await load("aqua-ceramide-cream"); // ceramide np, squalane, panthenol
    expect(p.suitableFor.length).toBeGreaterThan(0); // sample data still has tags…
    const dry = matchProduct(p, profile({ baseSkinType: "dry" }));
    const oily = matchProduct(p, profile({ baseSkinType: "oily" }));

    // …but the difference must come from the formula, not from them.
    expect(dry.score).not.toBeNull();
    expect(dry.reasons.some((r) => /ceramide|squalane/i.test(r.ingredient))).toBe(true);
    // This fixture is barrier-repair: ceramide, shea butter, squalane,
    // panthenol, centella. All of it speaks to dry skin and none of it to a
    // plain oily profile, so the gap has to be visible in the number.
    expect(oily.score).not.toBeNull();
    expect(dry.score as number).toBeGreaterThan(oily.score as number);
  });

  it("rewards overlapping concerns", async () => {
    const p = await load("hanbang-rice-serum"); // targets dehydrated, dullness
    const withConcern = matchProduct(p, profile({ concerns: ["dehydrated"] }));
    const without = matchProduct(p, profile({ concerns: ["fine-lines"] }));
    expect(withConcern.score).toBeGreaterThan(without.score as number);
  });

  it("rewards sensitivity matching a product's suitableFor list", async () => {
    const p = await load("aqua-ceramide-cream"); // suitableFor includes 'sensitive'
    const withSensitive = matchProduct(p, profile({ baseSkinType: "dry", sensitivity: "some" }));
    const without = matchProduct(p, profile({ baseSkinType: "dry", sensitivity: "none" }));
    expect(withSensitive.score).toBeGreaterThan(without.score as number);
  });

  /**
   * A cleanser is rinsed off within a minute; a serum sits on the skin for
   * hours. Scoring the same ingredient identically in both overstated actives
   * and, worse, irritants in a face wash.
   */
  it("weights a rinse-off product's ingredients below a leave-on one's", async () => {
    const cleanser = await load("mugwort-gel-cleanser");
    const prof = profile({ baseSkinType: "dry", sensitivity: "some" });
    const result = matchProduct(cleanser, prof);
    if (result.reasons.length > 0) {
      const strongest = Math.max(...result.reasons.map((r) => Math.abs(r.effect)));
      // Full weight for the top rule at position 1 would be its raw weight;
      // rinse-off caps it well below that.
      expect(strongest).toBeLessThan(11);
    }
  });

  it("recognises eczema-prone skin as its own concern", async () => {
    const p = await load("aqua-ceramide-cream");
    const atopic = matchProduct(p, profile({ concerns: ["atopic"] }));
    // Ceramides, panthenol and niacinamide all now speak to it, so this must
    // produce reasons rather than falling through to "can't tell".
    expect(atopic.reasons.length).toBeGreaterThan(0);
    expect(atopic.score).not.toBeNull();
  });

  it("stays within 0-99 and returns an integer", async () => {
    const p = await load("hanbang-rice-serum");
    const { score } = matchProduct(p, profile({ baseSkinType: "dry", concerns: ["dehydrated", "dullness"] }));
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(99);
  });

  describe("no profile (skipped onboarding)", () => {
    it("returns a null score rather than a meaningless number", async () => {
      const p = await load("hanbang-rice-serum");
      expect(matchProduct(p, EMPTY_PROFILE).score).toBeNull();
    });

    // Sensitivity scales how harshly irritants are judged; it does not say
    // what a formula should be doing for you, so on its own it is not a
    // profile to match against.
    it("sensitivity alone (no skin type, no concerns) still yields a null score", async () => {
      const p = await load("hanbang-rice-serum");
      const sensitivityOnly = profile({ sensitivity: "high" });
      expect(matchProduct(p, sensitivityOnly).score).toBeNull();
    });

    it("still flags 'avoid' ingredients for a user with no profile", async () => {
      const p = await load("snail-repair-ampoule");
      expect(matchProduct(p, EMPTY_PROFILE).warnings.length).toBeGreaterThan(0);
    });
  });

  /**
   * Regression test for the review finding: this ampoule is tagged
   * `targets: ["acne-prone", ...]` and `suitableFor: ["oily", ...]`, so on
   * tags alone it scored 99% — the maximum — for an acne-prone user, while
   * its INCI list contains isopropyl myristate (comedogenic 5, "avoid").
   */
  describe("contraindicated products (regression)", () => {
    it("does not present a comedogenic-5 product as a good match to acne-prone users", async () => {
      const p = await load("snail-repair-ampoule");
      const prof = profile({ baseSkinType: "oily", concerns: ["acne-prone", "large-pores"] });
      const { score, warnings } = matchProduct(p, prof);

      expect(warnings.length).toBeGreaterThan(0);
      expect(score).not.toBeNull();
      expect(score as number).toBeLessThan(65); // never "medium" or "high" tone
      expect(matchTone(score as number)).toBe("low");
    });

    it("names the offending ingredient so the UI can explain itself", async () => {
      const p = await load("snail-repair-ampoule");
      const { warnings } = matchProduct(p, profile({ baseSkinType: "oily", concerns: ["acne-prone"] }));
      expect(warnings.map((w) => w.ingredient.id)).toContain("isopropyl-myristate");
    });

    it("ranks a clean product above a contraindicated one for the same profile", async () => {
      const clean = await load("aqua-ceramide-cream");
      const risky = await load("snail-repair-ampoule");
      const prof = profile({ baseSkinType: "oily", concerns: ["acne-prone"] });
      expect(matchProduct(clean, prof).score as number).toBeGreaterThan(
        matchProduct(risky, prof).score as number
      );
    });
  });
});

describe("matchTone", () => {
  // The MVP locks these four bands, so they are pinned rather than left to a
  // comment: 90-100 excellent, 75-89 good, 60-74 fair, 0-59 poor.
  it("maps scores to bands at the MVP boundaries", () => {
    expect(matchTone(75)).toBe("high");
    expect(matchTone(74)).toBe("medium");
    expect(matchTone(60)).toBe("medium");
    expect(matchTone(59)).toBe("low");
  });

  it("uses the same cutoffs the verdict bands do", () => {
    expect(SCORE_BANDS).toEqual({ excellent: 90, good: 75, fair: 60 });
    // A badge has one colour to spend, so excellent and good share "high" —
    // but they must not disagree about where "high" starts.
    expect(matchTone(SCORE_BANDS.excellent)).toBe("high");
    expect(matchTone(SCORE_BANDS.good)).toBe("high");
    expect(matchTone(SCORE_BANDS.fair)).toBe("medium");
  });
});

/**
 * The behaviours the pivot rests on. The app's whole output is now "does this
 * suit you, and why", so these pin that the number is derived and that we
 * decline to produce one when we can't read the formula.
 */
describe("verdict engine", () => {
  function synthetic(
    names: string[],
    overrides: Partial<ProductWithIngredients> = {}
  ): ProductWithIngredients {
    return {
      id: "synthetic",
      barcode: "0000000000000",
      brand: "Test",
      name: "Test",
      type: "serum",
      productType: "serum",
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
      // Was declared and never applied, so every caller silently got a
      // leave-on serum however it asked. Nothing exercised it until the
      // rinse-off test below.
      ...overrides,
    };
  }

  function resultAt(
    score: number,
    breakdown: Partial<MatchResult["breakdown"]> = {}
  ): MatchResult {
    const seed = matchProduct(
      synthetic(["water", "glycerin", "xanthan gum"]),
      profile({ baseSkinType: "normal" })
    );
    const verdict =
      score >= SCORE_BANDS.excellent
        ? "excellent"
        : score >= SCORE_BANDS.good
          ? "good"
          : score >= SCORE_BANDS.fair
            ? "fair"
            : "poor";

    return {
      ...seed,
      score,
      verdict,
      warnings: [],
      breakdown: {
        concernFit: 50,
        typeFit: 50,
        irritationPenalty: 0,
        porePenalty: 0,
        ...breakdown,
      },
    };
  }

  const FILLER = ["water", "butylene glycol", "glycerin", "1,2-hexanediol", "xanthan gum"];

  /**
   * The behaviours the rebuilt engine exists to produce, pinned as numbers so
   * a future weight change has to declare what it moved rather than sliding
   * the whole scale quietly. Ranges rather than exact values: these assert the
   * band and the gap, which is what a user sees, not the arithmetic.
   */
  describe("golden behaviours", () => {
    const CLEAN = ["water", "glycerin", "niacinamide", "panthenol", "allantoin"];
    // Coconut oil, IPM and myristyl myristate are the high-confidence entries
    // in lib/pore-clogging.ts — the ones every published list agrees on.
    const CLOGGY = [
      "water", "cocos nucifera oil", "isopropyl myristate", "myristyl myristate", "glycerin",
    ];

    it("rates a clean formula well for blemish-prone skin, even with no acne actives", () => {
      // Not causing breakouts IS the win. Scoring acne on "does it contain
      // salicylic acid" made an ordinary gentle moisturiser look mediocre to
      // exactly the person it suits — the median real formula carries no acne
      // active at all.
      const prof = profile({ baseSkinType: "oily", concerns: ["acne-prone"] });
      expect(matchProduct(synthetic(CLEAN), prof).score as number).toBeGreaterThanOrEqual(75);
    });

    it("punishes a pore-clogging formula for the same profile", () => {
      const prof = profile({ baseSkinType: "oily", concerns: ["acne-prone"] });
      const clean = matchProduct(synthetic(CLEAN), prof).score as number;
      const cloggy = matchProduct(synthetic(CLOGGY), prof).score as number;
      expect(cloggy).toBeLessThan(60);
      expect(clean - cloggy).toBeGreaterThan(20);
    });

    it("does not punish that same formula for dry skin", () => {
      // Coconut oil and IPM are emollients. They are a problem for congestion,
      // not for dryness, and the score has to say so rather than treating
      // "pore-clogging" as a property of the jar.
      const acne = profile({ baseSkinType: "oily", concerns: ["acne-prone"] });
      const dry = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
      const forDry = matchProduct(synthetic(CLOGGY), dry).score as number;
      const forAcne = matchProduct(synthetic(CLOGGY), acne).score as number;
      expect(forDry).toBeGreaterThan(forAcne + 15);
    });

    it("scales an irritant by the three sensitivity levels", () => {
      const fragranced = ["water", "parfum", "limonene", "glycerin", "allantoin"];
      const at = (sensitivity: "none" | "some" | "high") =>
        matchProduct(
          synthetic(fragranced),
          profile({ baseSkinType: "normal", concerns: ["redness"], sensitivity })
        ).score as number;

      // Strictly decreasing: this is the whole point of widening the old
      // boolean, and a monotonic assertion catches a multiplier that stops
      // being applied at all.
      expect(at("none")).toBeGreaterThan(at("some"));
      expect(at("some")).toBeGreaterThan(at("high"));
    });

    it("softens the same formula when it rinses off", () => {
      const fragranced = ["water", "parfum", "limonene", "glycerin", "allantoin"];
      const prof = profile({ baseSkinType: "normal", concerns: ["redness"], sensitivity: "high" });
      const leaveOn = matchProduct(synthetic(fragranced), prof).score as number;
      const rinseOff = matchProduct(
        synthetic(fragranced, { type: "cleanser" }),
        prof
      ).score as number;
      expect(rinseOff).toBeGreaterThan(leaveOn);
    });

    it("discounts benefit but not harm when a product type has ambiguous contact", () => {
      const active = ["water", "salicylic acid", ...FILLER];
      const benefitProfile = profile({
        baseSkinType: "oily",
        concerns: ["acne-prone"],
        sensitivity: "none",
      });
      const leaveOn = matchProduct(synthetic(active), benefitProfile);
      const ambiguous = matchProduct(
        synthetic(active, { type: "exfoliator" }),
        benefitProfile
      );
      const leaveOnEffect = leaveOn.reasons.find((r) => r.ingredient === "salicylic acid")?.effect;
      const ambiguousEffect = ambiguous.reasons.find(
        (r) => r.ingredient === "salicylic acid"
      )?.effect;

      expect(leaveOn.score as number).toBeGreaterThan(ambiguous.score as number);
      expect(ambiguousEffect).toBeCloseTo((leaveOnEffect as number) * 0.5);

      const irritating = ["water", "parfum", "limonene", ...FILLER];
      const harmProfile = profile({
        baseSkinType: "normal",
        concerns: ["redness"],
        sensitivity: "high",
      });
      const leaveOnHarm = matchProduct(synthetic(irritating), harmProfile);
      const ambiguousHarm = matchProduct(
        synthetic(irritating, { type: "exfoliator" }),
        harmProfile
      );
      expect(ambiguousHarm.breakdown.irritationPenalty).toBeCloseTo(
        leaveOnHarm.breakdown.irritationPenalty
      );
    });

    it("scores from a declared function when no curated rule applies", () => {
      // Layer 2: ~83% of catalogue ingredients carry CosIng roles, and nothing
      // scored on them before. `sodium pca` has no rule, but is declared a
      // humectant, which is a real fact about it.
      const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
      const bare = synthetic(["water", "xanthan gum", "carbomer", "disodium edta"]);
      const withHumectant = synthetic(["water", "sodium pca", "xanthan gum", "carbomer"]);
      withHumectant.ingredients[1].functions = ["humectant"];
      expect(matchProduct(withHumectant, prof).score as number).toBeGreaterThan(
        matchProduct(bare, prof).score as number
      );
    });

    it("uses the benefit contact weight for declared-function fallback", () => {
      const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
      const leaveOn = synthetic(["water", "sodium pca", "xanthan gum", "carbomer"]);
      const ambiguous = synthetic(
        ["water", "sodium pca", "xanthan gum", "carbomer"],
        { type: "exfoliator" }
      );
      leaveOn.ingredients[1].functions = ["humectant"];
      ambiguous.ingredients[1].functions = ["humectant"];

      const leaveOnResult = matchProduct(leaveOn, prof);
      const ambiguousResult = matchProduct(ambiguous, prof);
      const leaveOnEffect = leaveOnResult.reasons.find((r) => r.ingredient === "sodium pca")?.effect;
      const ambiguousEffect = ambiguousResult.reasons.find(
        (r) => r.ingredient === "sodium pca"
      )?.effect;

      expect(ambiguousEffect).toBeCloseTo((leaveOnEffect as number) * 0.5);
    });

    it("explains the score in order of what actually moved it", () => {
      // A fragranced formula for someone with redness: irritation should be
      // the loudest line, not buried under a neutral concern-fit note.
      const prof = profile({ baseSkinType: "normal", concerns: ["redness"], sensitivity: "high" });
      const lines = scoreExplanation(
        matchProduct(synthetic(["water", "parfum", "limonene", "glycerin"]), prof)
      );
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0].label).toBe("Irritation risk");
      expect(lines[0].direction).toBe("down");
    });

    it("has nothing to explain when it declined to score", () => {
      const unscored = matchProduct(synthetic(["water", "glycerin"]), EMPTY_PROFILE);
      expect(unscored.score).toBeNull();
      expect(scoreExplanation(unscored)).toEqual([]);
    });

    it.each([
      [0, "poor", "down"],
      [59, "poor", "down"],
      [60, "fair", null],
      [74, "fair", null],
      [75, "good", "up"],
      [89, "good", "up"],
      [90, "excellent", "up"],
      [100, "excellent", "up"],
    ] as const)(
      "keeps a score of %i consistent with its %s explanation",
      (
        score: number,
        _verdict: "poor" | "fair" | "good" | "excellent",
        requiredDirection: "up" | "down" | null
      ) => {
        const lines = scoreExplanation(resultAt(score));
        if (requiredDirection === null) {
          // Fair is the mixed middle: with no material factor there is no
          // invented positive or negative claim — only the neutral concern
          // line, which is said whenever concerns were named (#292).
          expect(lines).toEqual([
            { label: "Your concerns", detail: "Nothing here strongly targets what you asked about", direction: "down" },
          ]);
        } else {
          // The label too, not only the direction: the neutral concern line
          // (#292) points down but moved nothing, so it must not lead a Poor
          // explanation in place of the honest aggregate.
          expect(lines[0]).toMatchObject({ label: "Overall match", direction: requiredDirection });
        }
      }
    );

    it("does not let a positive factor make a Poor explanation entirely positive", () => {
      const lines = scoreExplanation(resultAt(59, { concernFit: 90 }));
      expect(lines[0]).toMatchObject({ label: "Overall match", direction: "down" });
      expect(lines.some((line) => line.direction === "up")).toBe(true);
    });

    it("leads a Good explanation with support even when a penalty is the largest factor", () => {
      const lines = scoreExplanation(
        resultAt(75, { concernFit: 75, irritationPenalty: 30 })
      );
      expect(lines[0]).toMatchObject({ label: "Your concerns", direction: "up" });
      expect(lines.some((line) => line.direction === "down")).toBe(true);
    });

    it("names a hazard cap before otherwise positive evidence", () => {
      const product = synthetic(["water", "isopropyl myristate", "glycerin"]);
      const result = resultAt(45, { concernFit: 90 });
      result.warnings = [
        {
          ingredient: product.ingredients[1],
          reason: "Flagged as best avoided",
          severity: "hazard",
          origin: "avoid",
        },
      ];

      expect(scoreExplanation(result)[0]).toMatchObject({
        label: "Safety warning",
        direction: "down",
      });
    });

    it("names every hazard, not only the first", () => {
      const product = synthetic(["water", "isopropyl myristate", "glycerin"]);
      const result = resultAt(40, { concernFit: 90 });
      result.warnings = [1, 2].map((i) => ({
        ingredient: product.ingredients[i],
        reason: "Flagged as best avoided",
        severity: "hazard" as const,
        origin: "avoid" as const,
      }));
      const detail = scoreExplanation(result)[0].detail;
      expect(detail).toContain(product.ingredients[1].name);
      expect(detail).toContain(product.ingredients[2].name);
    });

    // #347: the EU prohibition behind an "avoid" hazard is linked under the line.
    it("links the EU source under a hazard line only when it backs every name in it", () => {
      const product = synthetic(["water", "isopropyl myristate", "glycerin"]);
      const avoid = (i: number): Contraindication => ({
        ingredient: product.ingredients[i],
        reason: "Flagged as best avoided",
        severity: "hazard",
        origin: "avoid",
        source: EU_PROHIBITED_SOURCE,
      });
      const result = resultAt(40, { concernFit: 90 });
      result.warnings = [avoid(1), avoid(2)];
      expect(scoreExplanation(result)[0]).toMatchObject({ label: "Safety warning", source: EU_PROHIBITED_SOURCE });

      result.warnings = [
        avoid(1),
        { ingredient: product.ingredients[2], reason: "Pore-clogging (4/5)", severity: "hazard", origin: "comedogenic" },
      ];
      const [line] = scoreExplanation(result);
      expect(line.label).toBe("Safety warning");
      expect(line).not.toHaveProperty("source");
    });

    it("does not present neutral concern evidence as positive", () => {
      expect(scoreExplanation(resultAt(60, { concernFit: 50 }))).toEqual([
        { label: "Your concerns", detail: "Nothing here strongly targets what you asked about", direction: "down" },
      ]);
      expect(scoreExplanation(resultAt(75, { concernFit: 50 }))[0]).toMatchObject({
        label: "Overall match",
        direction: "up",
      });
    });

    // #292: someone who named concerns always sees how the product met them.
    it.each([
      [80, "up", "This formula works on what you asked about"],
      [53, "down", "Nothing here strongly targets what you asked about"],
      [20, "down", "This formula works against what you asked about"],
    ] as const)("always explains concern fit %i", (concernFit: number, direction: "up" | "down", detail: string) => {
      const lines = scoreExplanation(resultAt(65, { concernFit }));
      expect(lines.find((line) => line.label === "Your concerns")).toEqual({ label: "Your concerns", detail, direction });
    });

    it("shows no concern line when no concerns were named", () => {
      const lines = scoreExplanation(resultAt(65, { concernFit: null }));
      expect(lines.some((line) => line.label === "Your concerns")).toBe(false);
    });

    it("sorts the neutral concern line after anything that moved the score", () => {
      const lines = scoreExplanation(resultAt(65, { concernFit: 50, irritationPenalty: 6 }));
      expect(lines.map((line) => line.label)).toEqual(["Irritation risk", "Your concerns"]);
    });

    it("reports lower confidence for a formula it mostly could not read", () => {
      const garbled = synthetic(["water", "glycerin", "niacinamide", ...FILLER]);
      for (const ingredient of garbled.ingredients.slice(3)) ingredient.verified = false;
      const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
      expect(confidenceLabel(matchProduct(garbled, prof).confidence)).not.toBe("high");
    });

    /**
     * Real catalogue formulas across five profiles, rather than only the
     * constructed ones above. Bands and orderings rather than exact numbers:
     * those are what a user sees, and a pinned integer would fail on any
     * weight change without saying whether the change was wrong.
     */
    it("scores real fixtures differently for the profiles they suit", async () => {
      const barrier = await load("aqua-ceramide-cream"); // ceramide, shea, squalane, panthenol, centella
      const eczema = matchProduct(
        barrier,
        profile({ baseSkinType: "dry", concerns: ["redness", "atopic"], sensitivity: "high" })
      ).score as number;
      const pigment = matchProduct(
        barrier,
        profile({ baseSkinType: "combination", concerns: ["hyperpigmentation", "dullness"] })
      ).score as number;

      // A barrier-repair cream is what eczema-prone skin wants and does
      // nothing at all for pigmentation. The gap is the personalisation.
      expect(eczema).toBeGreaterThanOrEqual(75);
      expect(eczema - pigment).toBeGreaterThan(12);
    });

    it("caps a hazard formula at the same score for every profile", async () => {
      // snail-repair-ampoule carries isopropyl myristate, rated "avoid" in the
      // sample catalogue. A hazard is not profile-dependent: it must not be
      // scoreable away by an otherwise-flattering match, and it must land
      // identically on skin it would otherwise suit.
      const hazardous = await load("snail-repair-ampoule");
      const scores = [
        profile({ baseSkinType: "oily", concerns: ["acne-prone"] }),
        profile({ baseSkinType: "dry", concerns: ["dehydrated"], sensitivity: "some" }),
        profile({ baseSkinType: "normal", concerns: ["fine-lines"], sensitivity: "high" }),
      ].map((p) => matchProduct(hazardous, p).score as number);

      expect(new Set(scores).size).toBe(1);
      expect(scores[0]).toBeLessThan(60);
    });

    it("lets a named rule outrank a declared function for the same ingredient", () => {
      // Glycerin has both a curated rule and a `humectant` role. It must be
      // counted once, by the rule — double-counting would let an ingredient
      // with a verbose CosIng entry quietly outweigh a stronger one.
      const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
      const plain = synthetic(["water", "glycerin", "xanthan gum", "carbomer"]);
      const tagged = synthetic(["water", "glycerin", "xanthan gum", "carbomer"]);
      tagged.ingredients[1].functions = ["humectant", "skin-conditioning"];
      expect(matchProduct(tagged, prof).score).toBe(matchProduct(plain, prof).score);
    });
  });

  /**
   * INCI order is regulated descending-concentration data, and nothing in the
   * app used it before. Fragrance second in the list is a real exposure; the
   * same word last is a trace, and the score has to say so.
   */
  it("weights an irritant by where it sits in the INCI list", () => {
    const prof = profile({ baseSkinType: "normal", sensitivity: "some" });
    const high = matchProduct(synthetic(["water", "parfum", ...FILLER]), prof);
    const low = matchProduct(synthetic(["water", ...FILLER, ...FILLER, ...FILLER, "parfum"]), prof);

    expect(high.score).toBeLessThan(low.score as number);
    expect(high.reasons[0].ingredient).toBe("parfum");
  });

  it("records both sides only when both are actually counted in the score", () => {
    // Salicylic acid helps acne-prone skin (a concern match, real fit
    // evidence) and hurts dry skin (a skinType match, also real fit
    // evidence) — both paths genuinely move the score, unlike a profile that
    // is merely `sensitive` with no matching concern or skinType, which
    // `targetApplies` still treats as "hurts" but which the score does not
    // otherwise count (see the next test, and PR #127's review).
    const result = matchProduct(
      synthetic(["water", "salicylic acid", ...FILLER]),
      profile({ baseSkinType: "dry", concerns: ["acne-prone"], sensitivity: "none" })
    );
    const entry = result.reasons.find((r) => r.ingredient === "salicylic acid");
    // Net zero on a leave-on product: equal weight in both directions, and
    // both sides are real, so the tension genuinely cancels rather than
    // producing a claim the score doesn't back up.
    expect(entry).toBeUndefined();
  });

  it("shows net harm only from harm the score actually applies", () => {
    // Same genuinely-counted tension as above (concern-matched benefit,
    // skinType-matched harm), but on an ambiguous-contact type: harm stays
    // at full weight while benefit is halved, so it no longer cancels.
    const result = matchProduct(
      synthetic(["water", "salicylic acid", ...FILLER], { type: "exfoliator" }),
      profile({ baseSkinType: "dry", concerns: ["acne-prone"], sensitivity: "none" })
    );
    const entry = result.reasons.find((r) => r.ingredient === "salicylic acid");

    expect(entry?.effect).toBeLessThan(0);
  });

  it("keeps a pore-clogging reason even when its concern bump is skipped", () => {
    // Lauric acid's `hurts` is concern-only (acne-prone), no skinType, so
    // `baseSkinType: "combination"` here deliberately matches neither
    // `helps.skinTypes` nor `hurts.skinTypes` on any rule that names it —
    // the exact shape review found: `harmApplied` must not fall back to
    // "false" just because the concernEvidence loop skips its own bump for
    // pore-led concerns. That skip prevents double-billing concernEvidence
    // against `poreCloggingHits`' own `poreLoad`/`poreSafety` path — it
    // does not mean the harm goes uncounted, since `poreCloggingHits` scans
    // "lauric acid" unconditionally and bills the same acne-prone concern
    // through a different accumulator. Raised by review on PR #127.
    const withClogger = matchProduct(
      synthetic(["water", "lauric acid", ...FILLER]),
      profile({ baseSkinType: "combination", concerns: ["acne-prone"] })
    );
    const entry = withClogger.reasons.find((r) => r.ingredient === "lauric acid");

    expect(entry?.effect).toBeLessThan(0);

    // And the harm is real, not just displayed: the same formula scores
    // worse for this profile than one with no clogger at all.
    const clean = matchProduct(
      synthetic(["water", ...FILLER]),
      profile({ baseSkinType: "combination", concerns: ["acne-prone"] })
    );
    expect((withClogger.score as number)).toBeLessThan(clean.score as number);
  });

  it("shows a reactive-skin harm only because the score now charges it", () => {
    // Originally a review catch on PR #127: `targetApplies` treats `hurts` as
    // true when ANY condition matches, including `sensitive` alone, and for a
    // sensitive, oily, acne-prone user salicylic acid's harm was in the reasons
    // list but charged nowhere in the score, so "why this score" listed an
    // ingredient as working against the user for harm the score never applied.
    // Step 16 closed that the other way round: a declared sensitive-skin harm
    // is now an irritation charge, so a negative reason is honest. The
    // invariant this test guards is unchanged — a reason must never claim more
    // harm than the score charged — and the two halves below check both sides.
    const oilyAcne = { baseSkinType: "oily" as const, concerns: ["acne-prone" as const] };
    const product = synthetic(["water", "salicylic acid", ...FILLER], { type: "exfoliator" });
    const reactive = matchProduct(product, profile({ ...oilyAcne, sensitivity: "some" }));
    const tolerant = matchProduct(product, profile({ ...oilyAcne, sensitivity: "none" }));
    const entry = reactive.reasons.find((r) => r.ingredient === "salicylic acid");

    expect(entry?.effect).toBeLessThan(0);
    expect(reactive.breakdown.irritationPenalty).toBeGreaterThan(
      tolerant.breakdown.irritationPenalty
    );
    // A tolerant profile is charged nothing extra and still sees the benefit.
    expect(tolerant.reasons.find((r) => r.ingredient === "salicylic acid")?.effect).toBeGreaterThan(0);
  });

  it("still flags an active that was charged as an irritant when its benefit cancels the harm", () => {
    // Retinol helps fine lines and, for reactive skin, is charged as an irritant.
    // On a full-contact product the two weights are equal, so the net reason
    // effect is zero and the reason line drops out; the ingredient must still not
    // read as a plain good one. Charged, not warned: Watch (#324).
    const product = synthetic(["water", "retinol", ...FILLER], { type: "serum" });
    const result = matchProduct(product, profile({ concerns: ["fine-lines"], sensitivity: "high" }));
    const retinol = product.ingredients.find((ingredient) => ingredient.name === "retinol");

    expect(result.irritants).toContain("retinol");
    expect(result.breakdown.irritationPenalty).toBeGreaterThan(0);
    expect(ingredientLabel(retinol as Ingredient, result, true)).toBe("watch");
  });

  it("counts a net-zero active as scoring evidence, so confidence is not understated", () => {
    // Same formula twice; only the retinol slot changes. Retinol's benefit and its
    // reactive-skin harm cancel to a zero reason effect, but both moved the score,
    // so the read is more confident than the control with nothing scored.
    const reactive = profile({ concerns: ["fine-lines"], sensitivity: "high" });
    const withRetinol = matchProduct(synthetic(["water", "retinol", ...FILLER], { type: "serum" }), reactive);
    const control = matchProduct(synthetic(["water", "unmatched test control", ...FILLER], { type: "serum" }), reactive);
    expect(withRetinol.confidence).toBeGreaterThan(control.confidence);
  });

  it("charges no irritant on a tolerant profile", () => {
    const product = synthetic(["water", "retinol", ...FILLER], { type: "serum" });
    const result = matchProduct(product, profile({ concerns: ["fine-lines"], sensitivity: "none" }));
    expect(result.irritants).not.toContain("retinol");
  });

  it("explains itself — every scored product returns its reasons", () => {
    const result = matchProduct(
      synthetic(["water", "niacinamide", "sodium hyaluronate", ...FILLER]),
      profile({ baseSkinType: "oily", concerns: ["large-pores"] })
    );
    expect(result.score).not.toBeNull();
    expect(result.reasons.length).toBeGreaterThan(0);
    for (const r of result.reasons) {
      expect(r.reason.trim().length).toBeGreaterThan(10);
    }
  });

  // #290: the ingredient list's badge must tell the same story as the score,
  // the risk cards and the CLOGGING tag on the same row. The badge is
  // `ingredientLabel` (#324).
  describe("ingredient labels agree with the score", () => {
    const FILL = ["glycerin", "propanediol", "carbomer", "xanthan gum", "allantoin", "panthenol", "tocopherol"];
    const withClogger = synthetic(["water", "glyceryl stearate se", ...FILL]);
    const clogger = withClogger.ingredients.find((i) => i.name === "glyceryl stearate se") as Ingredient;
    const cloggerLabel = (skin: SkinProfile) =>
      ingredientLabel(clogger, matchProduct(withClogger, skin), isPersonalized(skin));

    it("labels a listed clogger Watch for an acne-prone profile, whose score it cost", () => {
      const result = matchProduct(withClogger, profile({ concerns: ["acne-prone"] }));
      expect(result.cloggersCharged).toEqual(["glyceryl stearate se"]);
      expect(ingredientLabel(clogger, result, true)).toBe("watch");
    });

    it("labels the same clogger Watch, never Good, when no pore-led concern is set", () => {
      expect(matchProduct(withClogger, profile({ baseSkinType: "dry" })).cloggersCharged).toEqual([]);
      expect(cloggerLabel(profile({ baseSkinType: "dry" }))).toBe("watch");
    });

    it("labels the same clogger Watch when there is no profile at all", () => {
      expect(cloggerLabel(EMPTY_PROFILE)).toBe("watch");
    });

    it("does not warn about a contested clogger, which charged nothing", () => {
      const contested = synthetic(["water", "steareth-20", ...FILL]);
      const result = matchProduct(contested, profile({ concerns: ["acne-prone"] }));
      expect(result.cloggersCharged).toEqual([]);
      const steareth = contested.ingredients.find((i) => i.name === "steareth-20") as Ingredient;
      expect(ingredientLabel(steareth, result, true)).not.toBe("watch");
      expect(ingredientLabel(steareth, result, true)).not.toBe("avoid");
    });

    it("with no profile, gives neither Good nor a Watch that depends on the person", () => {
      // Tea tree only stings reactive skin; fragrance is flagged for everyone (#345).
      const scented = synthetic(["water", "tea tree oil", "parfum", ...FILL]);
      const result = matchProduct(scented, EMPTY_PROFILE);
      const find = (name: string) => scented.ingredients.find((i) => i.name === name) as Ingredient;
      expect(ingredientLabel(find("tea tree oil"), result, false)).toBeNull();
      expect(ingredientLabel(find("glycerin"), result, false)).toBeNull();
      expect(ingredientLabel(find("parfum"), result, false)).toBe("watch");
    });

    it("keeps every reason, so an effect past the sixth still reaches the badge", () => {
      const rich = synthetic([
        "water",
        "glycerin",
        "niacinamide",
        "sodium hyaluronate",
        "panthenol",
        "ceramide np",
        "squalane",
        "allantoin",
        "centella asiatica extract",
        "butylene glycol",
        "tocopherol",
      ]);
      const result = matchProduct(rich, profile({ baseSkinType: "dry", concerns: ["dehydrated", "redness"] }));
      expect(result.reasons.length).toBeGreaterThan(6);
    });
  });

  describe("refusing to guess", () => {
    /**
     * The gate this asserts was added after measuring that it fires: on 104
     * real products, nothing in the rules table applied to an oily,
     * acne-prone profile for 29 of them, while ~92% of their ingredients were
     * recognised. Coverage says we read the label; it does not say we have
     * anything to tell you.
     *
     * Built from a synthetic product rather than a catalogue fixture: a real
     * product can gain a matching rule later without anyone noticing this
     * test stopped exercising the gate. `disodium edta`, `xanthan gum` and
     * `carbomer` are chelator/thickener/gelling agents with no entry in
     * `lib/rules.ts` by design — they are exactly the "genuinely inert"
     * ingredients the gate exists for, not merely inert today by omission.
     */
    it("scores a formula it has nothing to say about, but with low confidence", () => {
      const p = synthetic(["water", "disodium edta", "xanthan gum", "carbomer", "phenoxyethanol"]);
      const irrelevant = matchProduct(p, profile({ concerns: ["hyperpigmentation"] }));
      expect(irrelevant.reasons).toHaveLength(0);
      expect(irrelevant.warnings).toHaveLength(0);

      // This used to be a third refusal, which fired on 29-37 of 104 real
      // products depending on the profile. Reading a formula and finding
      // little to say about it is a LOW-CONFIDENCE result, not an absent one
      // — refusing here told a user "we can't tell" about a jar of entirely
      // inert excipients, which is itself the answer.
      expect(irrelevant.score).not.toBeNull();
      expect(irrelevant.confidence).toBeLessThan(0.6);

      // …and it must not read as a recommendation. Nothing here helps the
      // stated concern, so it cannot land in the top bands.
      expect(irrelevant.score as number).toBeLessThan(75);
    });

    it("is more confident about a formula it recognises and can speak to", () => {
      const inert = synthetic(["water", "disodium edta", "xanthan gum", "carbomer", "phenoxyethanol"]);
      const substantive = synthetic([
        "water", "glycerin", "niacinamide", "sodium hyaluronate", "panthenol", "allantoin",
      ]);
      const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
      expect(matchProduct(substantive, prof).confidence).toBeGreaterThan(
        matchProduct(inert, prof).confidence
      );
    });

    it("returns no score when too little of the formula is recognised", () => {
      const p = synthetic(["water", "glycerin", "niacinamide", ...FILLER]);
      // Simulate an OCR'd label where most names came out garbled.
      p.ingredients = p.ingredients.map((i, idx) =>
        idx < 6 ? { ...i, verified: false } : i
      );
      const result = matchProduct(p, profile({ baseSkinType: "dry" }));
      expect(result.score).toBeNull();
      expect(result.verdict).toBe("unknown");
      expect(result.coverage).toBeLessThan(0.5);
    });

    it("returns no score for a fragment of a list", () => {
      const result = matchProduct(synthetic(["water", "glycerin"]), profile({ baseSkinType: "dry" }));
      expect(result.score).toBeNull();
      expect(result.verdict).toBe("unknown");
    });

    it("scores exactly at the documented evidence floor", () => {
      // Three identified ingredients out of twelve is exactly 25% coverage:
      // both refusal boundaries are inclusive, so this is enough to answer.
      const p = synthetic([
        "water", "glycerin", "niacinamide", "unknown-1", "unknown-2", "unknown-3",
        "unknown-4", "unknown-5", "unknown-6", "unknown-7", "unknown-8", "unknown-9",
      ]);
      p.ingredients = p.ingredients.map((ingredient, index) => ({
        ...ingredient,
        verified: index < 3,
      }));

      const result = matchProduct(p, profile({ baseSkinType: "dry" }));
      expect(result.coverage).toBe(0.25);
      expect(result.score).not.toBeNull();
      expect(result.unknownReason).toBeUndefined();
    });

    it("refuses just below 25% coverage even when three ingredients are identified", () => {
      const p = synthetic([
        "water", "glycerin", "niacinamide", "unknown-1", "unknown-2", "unknown-3",
        "unknown-4", "unknown-5", "unknown-6", "unknown-7", "unknown-8", "unknown-9",
        "unknown-10",
      ]);
      p.ingredients = p.ingredients.map((ingredient, index) => ({
        ...ingredient,
        verified: index < 3,
      }));

      const result = matchProduct(p, profile({ baseSkinType: "dry" }));
      expect(result.coverage).toBeLessThan(0.25);
      expect(result.score).toBeNull();
      expect(result.unknownReason).toBe("low_coverage");
    });

    it("refuses fewer than three identified ingredients even above 25% coverage", () => {
      const p = synthetic(["water", "glycerin", "unknown"]);
      p.ingredients[2] = { ...p.ingredients[2], verified: false };

      const result = matchProduct(p, profile({ baseSkinType: "dry" }));
      expect(result.coverage).toBeGreaterThan(0.25);
      expect(result.score).toBeNull();
      expect(result.unknownReason).toBe("low_coverage");
    });

    // #214's PR review: `computeMatch` checks `isPersonalized` first and
    // refuses "not_personalized" unconditionally, so `unknownReason` is
    // never "low_coverage" with no profile set — a caller that needs to know
    // "is this formula unreadable at all" (app/label-result.tsx, for a
    // first-time user who has no profile yet) can't read that off
    // `matchProduct`'s own result and needs `isLowCoverage` instead.
    it("isLowCoverage answers the coverage question on its own, independent of profile state", () => {
      const p = synthetic(["water", "glycerin", "unknown"]);
      p.ingredients[2] = { ...p.ingredients[2], verified: false };

      expect(isLowCoverage(p.ingredients)).toBe(true);
      // Same formula, no profile at all: matchProduct's own reason is masked...
      expect(matchProduct(p, profile()).unknownReason).toBe("not_personalized");
      // ...but isLowCoverage still reports it accurately.
      expect(isLowCoverage(p.ingredients)).toBe(true);
    });

    it("isLowCoverage is false for a formula that scores normally", () => {
      const p = synthetic(["water", "glycerin", "niacinamide"]);
      expect(isLowCoverage(p.ingredients)).toBe(false);
    });

    it("lets one unknown lower confidence without changing the score", () => {
      const names = [
        "water", "glycerin", "niacinamide", "sodium hyaluronate", "panthenol", "mystery blend",
      ];
      const allKnown = synthetic(names);
      const oneUnknown = synthetic(names);
      oneUnknown.ingredients[5] = { ...oneUnknown.ingredients[5], verified: false };
      const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
      const knownResult = matchProduct(allKnown, prof);
      const unknownResult = matchProduct(oneUnknown, prof);

      expect(unknownResult.score).toBe(knownResult.score);
      expect(unknownResult.confidence).toBeLessThan(knownResult.confidence);
      expect(unknownResult.verdict).not.toBe("unknown");
    });

    it("does not crash on blank or proprietary-looking unverified names", () => {
      const p = synthetic(["water", "glycerin", "niacinamide", "", "Bio-Restore Peptide Blend"]);
      p.ingredients[3] = { ...p.ingredients[3], verified: false };
      p.ingredients[4] = { ...p.ingredients[4], verified: false };

      expect(() => matchProduct(p, profile({ baseSkinType: "dry" }))).not.toThrow();
      const result = matchProduct(p, profile({ baseSkinType: "dry" }));
      expect(result.score).not.toBeNull();
      expect(result.coverage).toBe(0.6);
    });

    it("reports coverage so the UI can say how much it read", () => {
      const base = synthetic(["water", "glycerin", "niacinamide", "panthenol"]);
      // Built as a new product rather than edited in place. The old version
      // mutated `base.ingredients[3]` and was correct only by accident of
      // ordering — nothing had scored `base` yet. Now that `matchProduct`
      // caches on the product object, a score taken before such an edit would
      // be served again afterwards, so the edit has to produce a new object.
      const p = {
        ...base,
        ingredients: base.ingredients.map((ingredient, i) =>
          i === 3 ? { ...ingredient, verified: false } : ingredient
        ),
      };
      expect(matchProduct(p, profile({ baseSkinType: "dry" })).coverage).toBeCloseTo(0.75);
    });
  });

  it("never returns a jittered score — identical formulas score identically", () => {
    const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
    const a = synthetic(["water", "glycerin", "sodium hyaluronate", ...FILLER]);
    const b = synthetic(["water", "glycerin", "sodium hyaluronate", ...FILLER], {});
    b.id = "a-completely-different-id";
    expect(matchProduct(a, prof).score).toBe(matchProduct(b, prof).score);
  });

  // #187: a pregnancy caution never changes score or verdict, but the
  // headline must say so rather than reading like an unqualified "good fit".
  describe("verdictHeadline", () => {
    function withPregnancyHits(result: MatchResult, count = 1): MatchResult {
      return {
        ...result,
        warnings: Array.from({ length: count }, (_, i) => ({
          ingredient: { id: `retinol-${i}`, name: `Retinol ${i}`, comedogenic: 0, safety: "safe" as const, verified: true },
          reason: "A vitamin A derivative — commonly advised against in pregnancy and while breastfeeding",
          severity: "irritant" as const,
          origin: "pregnancy" as const,
        })),
      };
    }

    it("qualifies an excellent verdict with a singular pregnancy caution count", () => {
      const result = withPregnancyHits(resultAt(95, { concernFit: 95 }));
      expect(verdictHeadline(result)).toBe("Suits your skin — one thing to check while pregnant or breastfeeding");
    });

    it("qualifies a good verdict, pluralising more than one pregnancy hit", () => {
      const result = withPregnancyHits(resultAt(80, { concernFit: 80 }), 2);
      expect(verdictHeadline(result)).toBe("Suits your skin — 2 things to check while pregnant or breastfeeding");
    });

    it("leaves a good verdict unqualified with no pregnancy hit", () => {
      expect(verdictHeadline(resultAt(80, { concernFit: 80 }))).toBe("Looks like a good fit for your skin");
    });

    it("qualifies a fair verdict with a pregnancy caution", () => {
      const result = withPregnancyHits(resultAt(65, { concernFit: 65 }));
      expect(verdictHeadline(result)).toBe("Could work, and there's something to check while pregnant or breastfeeding");
    });

    // #257 review: a breastfeeding profile gets the same pregnancy-origin
    // hits, so a headline saying only "while pregnant" read as not applying.
    it("names breastfeeding too, with the warnings a breastfeeding profile really gets", () => {
      const product = synthetic(["water", "retinol", ...FILLER]);
      const real = matchProduct(product, profile({ baseSkinType: "normal", pregnancyStatus: "breastfeeding" }));
      expect(real.warnings.some((w) => w.origin === "pregnancy")).toBe(true);
      // Pinned to "good" so the qualified branch is exercised whatever this
      // formula happens to score; the warnings are the real ones.
      expect(verdictHeadline({ ...real, verdict: "good" })).toMatch(/while pregnant or breastfeeding$/);
    });

    it("does not qualify a poor verdict — it's already cautionary", () => {
      const result = withPregnancyHits(resultAt(40, { concernFit: 20 }));
      expect(verdictHeadline(result)).toBe("Probably not the right pick for you");
    });

    it("does not qualify the unknown verdict, even though the hit still shows in warnings", () => {
      const product = synthetic(["water", "tretinoin", ...FILLER]);
      const unpersonalizedPregnant = profile({ pregnancyStatus: "pregnant" });
      const result = matchProduct(product, unpersonalizedPregnant);
      expect(result.verdict).toBe("unknown");
      expect(result.warnings.some((w) => w.origin === "pregnancy")).toBe(true);
      expect(verdictHeadline(result)).toBe("Add your skin type or a concern and we can tell you how this suits you");
    });
  });
});

/**
 * The score cache sits inside `matchProduct`, so every screen gets it without
 * asking. These pin the two properties that make that safe to do invisibly:
 * a hit has to be the same answer, and a changed formula has to miss.
 */
describe("the score cache", () => {
  beforeEach(resetScoreCache);

  it("answers a repeat of the same product and profile from cache", async () => {
    const p = await load("aqua-ceramide-cream");
    const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });

    // The identical instance, not merely an equal one — that is what makes a
    // caller's `useMemo` on the result stable too.
    expect(matchProduct(p, prof)).toBe(matchProduct(p, prof));
  });

  it("recomputes when the profile changes", async () => {
    const p = await load("aqua-ceramide-cream");

    const dry = matchProduct(p, profile({ baseSkinType: "dry", concerns: ["dehydrated"] }));
    const oily = matchProduct(p, profile({ baseSkinType: "oily", concerns: ["acne-prone"] }));

    expect(oily).not.toBe(dry);
  });

  /**
   * The case an id-keyed cache gets wrong, and the reason this one is keyed on
   * the product object instead.
   *
   * Re-scanning a bottle *because* it was reformulated produces a row with the
   * same id and a different formula. `addScannedToCatalogue` folds that in as a
   * new object rather than mutating the old one, so the new formula is a new
   * key here and the old score cannot be served for it.
   */
  it("recomputes for a reformulated product carrying the same id", async () => {
    const original = await load("aqua-ceramide-cream");
    const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });

    const before = matchProduct(original, prof);
    expect(before.score).not.toBeNull();

    const reformulated = { ...original, ingredients: original.ingredients.slice(0, 1) };
    const after = matchProduct(reformulated, prof);

    expect(after).not.toBe(before);
    // Down to one ingredient, the engine declines rather than scoring — a
    // difference that could only come from reading the new formula.
    expect(after.unknownReason).toBe("low_coverage");
  });

  it("forgets everything on reset", async () => {
    const p = await load("aqua-ceramide-cream");
    const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });

    const first = matchProduct(p, prof);
    resetScoreCache();

    expect(matchProduct(p, prof)).not.toBe(first);
  });
});

describe("the shared result", () => {
  beforeEach(resetScoreCache);

  /**
   * A cache hit hands the *same* object to every screen showing the product,
   * so one caller sorting `reasons` in place would reorder the "Why" list
   * everywhere — and only after the first screen had rendered. Frozen in
   * development so the attempt throws where it is written instead of
   * surfacing as a wrong list somewhere else.
   */
  it("cannot be edited in place", async () => {
    const p = await load("aqua-ceramide-cream");
    const result = matchProduct(p, profile({ baseSkinType: "dry", concerns: ["dehydrated"] }));

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.reasons)).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    expect(Object.isFrozen(result.factors)).toBe(true);
  });
});
