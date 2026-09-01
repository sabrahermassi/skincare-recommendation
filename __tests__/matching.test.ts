import { fetchProduct, fetchProducts } from "@/data/api";
import type { ProductWithIngredients, SkinProfile } from "@/data/types";
import { matchProduct, matchTone } from "@/lib/matching";
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
   */
  it("derives skin-type fit from the ingredients, not from product tags", async () => {
    const p = await load("aqua-ceramide-cream"); // ceramide np, squalane, panthenol
    expect(p.suitableFor.length).toBeGreaterThan(0); // sample data still has tags…
    const dry = matchProduct(p, profile({ baseSkinType: "dry" }));
    const oily = matchProduct(p, profile({ baseSkinType: "oily" }));
    // …but the difference must come from the formula, not from them.
    expect(dry.score).toBeGreaterThan(oily.score as number);
    expect(dry.reasons.some((r) => /ceramide|squalane/i.test(r.ingredient))).toBe(true);
  });

  it("rewards overlapping concerns", async () => {
    const p = await load("hanbang-rice-serum"); // targets dehydrated, dullness
    const withConcern = matchProduct(p, profile({ concerns: ["dehydrated"] }));
    const without = matchProduct(p, profile({ concerns: ["fine-lines"] }));
    expect(withConcern.score).toBeGreaterThan(without.score as number);
  });

  it("rewards sensitivity matching a product's suitableFor list", async () => {
    const p = await load("aqua-ceramide-cream"); // suitableFor includes 'sensitive'
    const withSensitive = matchProduct(p, profile({ baseSkinType: "dry", sensitive: true }));
    const without = matchProduct(p, profile({ baseSkinType: "dry", sensitive: false }));
    expect(withSensitive.score).toBeGreaterThan(without.score as number);
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

    it("demographics alone (no skin type, no concerns) still yield a null score", async () => {
      const p = await load("hanbang-rice-serum");
      const demographicsOnly = profile({ gender: "female", ageGroup: "25-34" });
      expect(matchProduct(p, demographicsOnly).score).toBeNull();
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
  it("maps scores to bands at the documented boundaries", () => {
    expect(matchTone(80)).toBe("high");
    expect(matchTone(79)).toBe("medium");
    expect(matchTone(65)).toBe("medium");
    expect(matchTone(64)).toBe("low");
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

  const FILLER = ["water", "butylene glycol", "glycerin", "1,2-hexanediol", "xanthan gum"];

  /**
   * INCI order is regulated descending-concentration data, and nothing in the
   * app used it before. Fragrance second in the list is a real exposure; the
   * same word last is a trace, and the score has to say so.
   */
  it("weights an irritant by where it sits in the INCI list", () => {
    const prof = profile({ baseSkinType: "normal", sensitive: true });
    const high = matchProduct(synthetic(["water", "parfum", ...FILLER]), prof);
    const low = matchProduct(synthetic(["water", ...FILLER, ...FILLER, ...FILLER, "parfum"]), prof);

    expect(high.score).toBeLessThan(low.score as number);
    expect(high.reasons[0].ingredient).toBe("parfum");
  });

  it("records both sides when one ingredient helps and hurts the same person", () => {
    // Salicylic acid suits oily/acne-prone and works against sensitive skin.
    const result = matchProduct(
      synthetic(["water", "salicylic acid", ...FILLER]),
      profile({ baseSkinType: "oily", concerns: ["acne-prone"], sensitive: true })
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
