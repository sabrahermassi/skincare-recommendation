import type { Ingredient, ProductType, SkinProfile } from "@/data/types";
import { ALLERGEN_CHARGE, matchProduct, resetScoreCache } from "@/lib/matching";
import { contactWeight, positionWeights } from "@/lib/rules";
import { contraindications } from "@/lib/safety";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * #407: Annex III ("restricted") never charges anyone by itself. Only the EU's
 * allergen entries do, once per ingredient, at the higher of the allergen
 * charge and whatever irritant rule already names it.
 */

const ing = (name: string, safety: Ingredient["safety"] = "safe"): Ingredient => ({ id: name, name, comedogenic: 0, safety, verified: true });
const FILLER = ["water", "glycerin", "propanediol", "carbomer", "xanthan gum", "panthenol", "disodium edta", "tocopherol"].map((n) => ing(n));

/** A formula with `target` at position 4, where its weight is not the position floor. */
const formula = (target: Ingredient, type: ProductType = "serum") => ({ type, ingredients: [...FILLER.slice(0, 4), target, ...FILLER.slice(4)] });
const position = (product: ReturnType<typeof formula>) => positionWeights(product.ingredients.map((i) => i.name))[4];

const profile = (sensitivity: SkinProfile["sensitivity"]): SkinProfile => ({
  ...EMPTY_PROFILE,
  concerns: ["dullness"],
  baseSkinType: "normal",
  sensitivity,
});
const score = (product: ReturnType<typeof formula>, p: SkinProfile) => {
  resetScoreCache();
  return matchProduct(product, p);
};

describe("an EU allergen is charged once, at the higher of the two", () => {
  it("charges limonene its fragrance rule's weight (6), not the rule plus the allergen charge", () => {
    const product = formula(ing("limonene", "caution"));
    const result = score(product, profile("some"));
    expect(result.breakdown.irritationPenalty).toBeCloseTo(6 * position(product), 5);
    expect(result.irritants).toEqual(["limonene"]);
  });

  it("keeps the 'very sensitive' floor for the fragrance rule, and still charges once", () => {
    // Last in a long list its position factor is under the 0.7 floor; the rule's floored charge is what counts.
    const tail = Array.from({ length: 18 }, (_, i) => ing(`filler ${String.fromCharCode(97 + i)}`));
    const product = { type: "moisturizer" as const, ingredients: [...FILLER, ...tail, ing("linalool", "caution")] };
    const factor = positionWeights(product.ingredients.map((i) => i.name))[product.ingredients.length - 1];
    expect(factor).toBeLessThan(0.7);
    const result = score(product, profile("high"));
    expect(result.breakdown.irritationPenalty).toBeCloseTo(6 * 0.7 * contactWeight("moisturizer").harm * 1.6, 5);
  });

  it("floors the main scent when it is an allergen no rule names, and only then (Codex review)", () => {
    const tail = Array.from({ length: 18 }, (_, i) => ing(`filler ${String.fromCharCode(97 + i)}`));
    const factorOf = (list: Ingredient[], name: string) => positionWeights(list.map((i) => i.name))[list.findIndex((i) => i.name === name)];
    // Vanillin alone, last in a long list: its position factor is under the floor, so "very sensitive" charges 0.7 of the allergen charge.
    const alone = { type: "moisturizer" as const, ingredients: [...FILLER, ...tail, ing("vanillin")] };
    expect(factorOf(alone.ingredients, "vanillin")).toBeLessThan(0.7);
    expect(score(alone, profile("high")).breakdown.irritationPenalty).toBeCloseTo(ALLERGEN_CHARGE * 0.7 * 1.6, 5);
    // "Somewhat" keeps the position factor.
    expect(score(alone, profile("some")).breakdown.irritationPenalty).toBeCloseTo(ALLERGEN_CHARGE * factorOf(alone.ingredients, "vanillin"), 5);
    // With parfum in the list, parfum is the main scent and vanillin keeps its position factor.
    const withParfum = { type: "moisturizer" as const, ingredients: [...FILLER, ing("parfum"), ...tail, ing("vanillin")] };
    const list = withParfum.ingredients;
    expect(score(withParfum, profile("high")).breakdown.irritationPenalty).toBeCloseTo(
      (9 * Math.max(factorOf(list, "parfum"), 0.7) + ALLERGEN_CHARGE * factorOf(list, "vanillin")) * 1.6,
      5
    );
  });

  it("charges an allergen with no rule of its own the allergen charge, and names it as charged", () => {
    const product = formula(ing("vanillin"));
    const result = score(product, profile("some"));
    expect(result.breakdown.irritationPenalty).toBeCloseTo(ALLERGEN_CHARGE * position(product), 5);
    expect(result.irritants).toEqual(["vanillin"]);
    expect(result.warnings).toHaveLength(1);
  });

  it("charges an allergen the dictionary calls safe (hexyl cinnamal, methyl 2-octynoate), which a note-based rule would miss", () => {
    for (const name of ["methyl 2-octynoate", "anise alcohol"]) {
      const result = score(formula(ing(name)), profile("some"));
      expect(result.breakdown.irritationPenalty).toBeGreaterThan(0);
      expect(result.warnings.map((w) => w.ingredient.name)).toEqual([name]);
    }
  });

  it("scales the allergen charge by the product type's contact weight, never above it", () => {
    const wash = formula(ing("vanillin"), "cleanser");
    expect(score(wash, profile("some")).breakdown.irritationPenalty).toBeCloseTo(ALLERGEN_CHARGE * position(wash) * contactWeight("cleanser").harm, 5);
    expect(contactWeight("cleanser").harm).toBeLessThan(1);
  });

  it("charges an 'allergy warning' entry the same way (resorcinol, entry 22)", () => {
    const product = formula(ing("resorcinol", "caution"));
    const result = score(product, profile("some"));
    expect(result.warnings.map((w) => w.reason)).toEqual([expect.stringMatching(/can cause allergic reactions/)]);
    expect(result.breakdown.irritationPenalty).toBeGreaterThan(0);
  });
});

describe("Annex III alone adds no charge", () => {
  it.each(["sodium hydroxide", "triethanolamine", "zinc gluconate", "talc"])("charges nothing for %s, restricted for another reason", (name: string) => {
    const product = formula(ing(name, "caution"));
    for (const sensitivity of ["none", "some", null, "high"] as const) {
      const result = score(product, profile(sensitivity));
      expect(result.breakdown.irritationPenalty).toBe(0);
      expect(result.warnings).toEqual([]);
      expect(result.irritants).toEqual([]);
    }
  });

  it("charges nothing for benzyl alcohol, on the list but exempt (a preservative, which a label cannot tell)", () => {
    const result = score(formula(ing("benzyl alcohol", "caution")), profile("high"));
    expect(result.breakdown.irritationPenalty).toBe(0);
    expect(result.warnings).toEqual([]);
  });
});

describe("who is charged", () => {
  const product = formula(ing("vanillin"));

  it("charges somewhat, very and unset sensitivity, in that order, and not 'none'", () => {
    const penalty = (s: SkinProfile["sensitivity"]) => score(product, profile(s)).breakdown.irritationPenalty;
    expect(penalty("none")).toBe(0);
    expect(penalty(null)).toBeCloseTo(penalty("some"), 5);
    expect(penalty("high")).toBeGreaterThan(penalty("some"));
  });

  it("charges and warns about nobody with no profile at all", () => {
    expect(score(product, EMPTY_PROFILE).warnings).toEqual([]);
    expect(contraindications(product.ingredients, EMPTY_PROFILE)).toEqual([]);
  });

  it("lists exactly what it charges, so the count on screen and the penalty agree", () => {
    const mixed = { type: "serum" as const, ingredients: [...FILLER, ing("vanillin"), ing("limonene", "caution"), ing("sodium hydroxide", "caution"), ing("benzyl alcohol", "caution")] };
    const result = score(mixed, profile("some"));
    expect(result.warnings.map((w) => w.ingredient.name).sort()).toEqual(["limonene", "vanillin"]);
    expect([...result.irritants].sort()).toEqual(["limonene", "vanillin"]);
  });

  it("leaves a prohibited ingredient the hazard alone, even when its name is on the list", () => {
    const result = score(formula(ing("limonene", "avoid")), profile("high"));
    expect(result.warnings.map((w) => w.severity)).toEqual(["hazard"]);
  });

  it("does not charge a name it did not recognise", () => {
    const result = score(formula({ ...ing("vanillin"), verified: false }), profile("high"));
    expect(result.breakdown.irritationPenalty).toBe(0);
  });
});

describe("the three rules added with it (#407)", () => {
  const penalty = (name: string) => score(formula(ing(name)), profile("some")).breakdown.irritationPenalty;

  it.each(["hydrogen peroxide", "benzalkonium chloride", "stearalkonium chloride", "steartrimonium chloride"])("charges %s as an irritant for reactive skin, and not for 'none'", (name: string) => {
    expect(penalty(name)).toBeGreaterThan(0);
    expect(score(formula(ing(name)), profile("none")).breakdown.irritationPenalty).toBe(0);
  });

  it.each(["pinus sylvestris leaf oil", "abies sibirica oil", "cupressus sempervirens oil"])("charges %s like the other essential oils", (name: string) => {
    const result = score(formula(ing(name)), profile("some"));
    expect(result.irritants).toEqual([name]);
    expect(result.reasons[0].reason).toMatch(/essential oil/i);
  });

  it("does not charge a pine bark extract, an antioxidant, or an unrelated oil", () => {
    expect(penalty("pinus pinaster bark extract")).toBe(0);
    expect(penalty("abies balsamea resin")).toBe(0);
    expect(penalty("olea europaea fruit oil")).toBe(0);
  });
});
