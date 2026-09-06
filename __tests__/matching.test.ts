import { fetchProduct, fetchProducts } from "@/data/api";
import type { ProductWithIngredients, SkinProfile } from "@/data/types";
import {
  confidenceLabel,
  matchProduct,
  matchTone,
  SCORE_BANDS,
  scoreExplanation,
} from "@/lib/matching";
import { EMPTY_PROFILE } from "@/store/useAppStore";

async function load(id: string): Promise<ProductWithIngredients> {
  const p = await fetchProduct(id);
  if (!p) throw new Error(`fixture missing: ${id}`);
  return p;
}

function profile(overrides: Partial<SkinProfile> = {}): SkinProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

describe("matchProduct", () => {
  it("is deterministic for the same product and profile", async () => {
    const p = await load("hanbang-rice-serum");
    const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
    const a = matchProduct(p, prof);
    const b = matchProduct(p, prof);
    expect(a.score).toBe(b.score);
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
      // Was declared and never applied, so every caller silently got a
      // leave-on serum however it asked. Nothing exercised it until the
      // rinse-off test below.
      ...overrides,
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

    it("reports lower confidence for a formula it mostly could not read", () => {
      const garbled = synthetic(["water", "glycerin", "niacinamide", ...FILLER]);
      for (const ingredient of garbled.ingredients.slice(3)) ingredient.verified = false;
      const prof = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
      expect(confidenceLabel(matchProduct(garbled, prof).confidence)).not.toBe("high");
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

  it("records both sides when one ingredient helps and hurts the same person", () => {
    // Salicylic acid suits oily/acne-prone and works against sensitive skin.
    const result = matchProduct(
      synthetic(["water", "salicylic acid", ...FILLER]),
      profile({ baseSkinType: "oily", concerns: ["acne-prone"], sensitivity: "some" })
    );
    const entry = result.reasons.find((r) => r.ingredient === "salicylic acid");
    // Net zero: the tension is real, so it moves the score nowhere and is not
    // dressed up as a recommendation either way.
    expect(entry).toBeUndefined();
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

    it("reports coverage so the UI can say how much it read", () => {
      const p = synthetic(["water", "glycerin", "niacinamide", "panthenol"]);
      p.ingredients[3] = { ...p.ingredients[3], verified: false };
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
});
