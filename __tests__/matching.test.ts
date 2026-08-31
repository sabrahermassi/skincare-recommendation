import { fetchProduct } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { matchProduct, matchTone } from "@/lib/matching";

async function load(id: string): Promise<ProductWithIngredients> {
  const p = await fetchProduct(id);
  if (!p) throw new Error(`fixture missing: ${id}`);
  return p;
}

describe("matchProduct", () => {
  it("is deterministic for the same product and profile", async () => {
    const p = await load("hanbang-rice-serum");
    const a = matchProduct(p, "dry", ["dehydrated"]);
    const b = matchProduct(p, "dry", ["dehydrated"]);
    expect(a.score).toBe(b.score);
  });

  it("rewards a skin-type match", async () => {
    const p = await load("hanbang-rice-serum"); // suitableFor includes 'dry'
    const matched = matchProduct(p, "dry", []);
    const unmatched = matchProduct(p, "oily", []);
    expect(matched.score).toBeGreaterThan(unmatched.score);
  });

  it("rewards overlapping concerns", async () => {
    const p = await load("hanbang-rice-serum"); // targets dehydrated, dullness
    const withConcern = matchProduct(p, null, ["dehydrated"]);
    const without = matchProduct(p, null, ["fine-lines"]);
    expect(withConcern.score).toBeGreaterThan(without.score);
  });

  it("stays within 0-99 and returns an integer", async () => {
    const p = await load("hanbang-rice-serum");
    const { score } = matchProduct(p, "dry", ["dehydrated", "dullness"]);
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(99);
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
      const { score, warnings } = matchProduct(p, "oily", ["acne-prone", "large-pores"]);

      expect(warnings.length).toBeGreaterThan(0);
      expect(score).toBeLessThan(65);          // never "medium" or "high" tone
      expect(matchTone(score)).toBe("low");
    });

    it("names the offending ingredient so the UI can explain itself", async () => {
      const p = await load("snail-repair-ampoule");
      const { warnings } = matchProduct(p, "oily", ["acne-prone"]);
      expect(warnings.map((w) => w.ingredient.id)).toContain("isopropyl-myristate");
    });

    it("ranks a clean product above a contraindicated one for the same profile", async () => {
      const clean = await load("aqua-ceramide-cream");
      const risky = await load("snail-repair-ampoule");
      const profile = ["acne-prone"] as const;
      expect(matchProduct(clean, "oily", [...profile]).score).toBeGreaterThan(
        matchProduct(risky, "oily", [...profile]).score
      );
    });

    it("still flags 'avoid' ingredients for a user with no profile", async () => {
      const p = await load("snail-repair-ampoule");
      expect(matchProduct(p, null, []).warnings.length).toBeGreaterThan(0);
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
