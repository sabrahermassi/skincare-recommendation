import { fetchProduct } from "@/data/api";
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

  it("rewards a skin-type match", async () => {
    const p = await load("hanbang-rice-serum"); // suitableFor includes 'dry'
    const matched = matchProduct(p, profile({ baseSkinType: "dry" }));
    const unmatched = matchProduct(p, profile({ baseSkinType: "oily" }));
    expect(matched.score).toBeGreaterThan(unmatched.score as number);
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

  it("favours low-maintenance product types for a minimal routine", async () => {
    const cleanser = await load("mugwort-gel-cleanser");
    const minimal = matchProduct(cleanser, profile({ baseSkinType: "oily", routineLength: "minimal" }));
    const balanced = matchProduct(cleanser, profile({ baseSkinType: "oily", routineLength: "balanced" }));
    expect(minimal.score).toBeGreaterThan(balanced.score as number);
  });

  /**
   * Load-bearing: onboarding skips the routine question entirely for body on
   * the strength of this. Every body product sits inside matchProduct's
   * "minimal" list and outside its "full" list, so a routine answer moves all
   * of them by the same amount — it can never change which body product
   * outranks which, and so carries no signal for choosing between them.
   *
   * If the catalogue gains a body product that breaks the pattern (a body
   * serum, say), these fail and the routine step should return for body.
   */
  describe("routine length carries no signal for body", () => {
    const BODY_IDS = ["green-tea-body-wash", "ceramide-body-lotion", "shea-hand-cream"];
    const ANSWERS = ["minimal", "balanced", "full", null] as const;
    const base = { baseSkinType: "dry" as const, concerns: ["dehydrated" as const] };

    async function scoresFor(routineLength: (typeof ANSWERS)[number]) {
      const products = await Promise.all(BODY_IDS.map(load));
      return products.map((p) => ({
        id: p.id,
        score: matchProduct(p, profile({ ...base, routineLength })).score as number,
      }));
    }

    it("ranks body products identically whatever the answer", async () => {
      const order = async (r: (typeof ANSWERS)[number]) =>
        (await scoresFor(r)).sort((a, b) => b.score - a.score).map((s) => s.id);

      const reference = await order("minimal");
      for (const answer of ANSWERS.slice(1)) {
        expect(await order(answer)).toEqual(reference);
      }
    });

    it("moves every body product by the same delta, never a relative one", async () => {
      const reference = await scoresFor(null);

      for (const answer of ANSWERS) {
        const deltas = (await scoresFor(answer)).map(
          (s, i) => s.score - reference[i].score
        );
        // One distinct delta across the whole body catalogue = a uniform shift.
        expect(new Set(deltas).size).toBe(1);
      }
    });
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
