import { fetchProducts } from "@/data/api";
import { INGREDIENTS } from "@/data/ingredients";
import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { SENSITIVITY_UNSET_NOTE, matchProduct, resetScoreCache, scoreExplanation } from "@/lib/matching";
import { isSensitive, treatAsReactive } from "@/lib/profile";
import { UNSET_SENSITIVITY_REASON } from "@/lib/safety";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * "I don't know" sensitivity — and every other unset one — is judged at the
 * middle setting, not as "not sensitive" (#183). On the harm side only: a
 * sensitive-skin benefit is never credited on a non-answer, no label calls
 * them sensitive, and a visitor with no profile at all sees what they did.
 */

const verified = (name: string, safety: Ingredient["safety"] = "safe"): Ingredient => ({
  id: name,
  name,
  comedogenic: 0,
  safety,
  verified: true,
});

const product = (ingredients: Ingredient[]): Pick<ProductWithIngredients, "type" | "ingredients"> => ({
  type: "serum",
  ingredients,
});

// The AHA rule's only `hurts` key is `sensitive: true` — the class of rule a
// change to the reactive check alone could never reach (#183).
const AHA_SERUM = product([
  INGREDIENTS["niacinamide"],
  verified("Glycolic Acid"),
  INGREDIENTS["panthenol"],
  INGREDIENTS["butylene-glycol"],
]);
// A restricted (`caution`) ingredient no rule names as a reactive-skin harm.
const FRAGRANCED = product([
  INGREDIENTS["niacinamide"],
  INGREDIENTS["panthenol"],
  INGREDIENTS["butylene-glycol"],
  INGREDIENTS["fragrance"],
]);
// Allantoin helps sensitive skin (and redness, which this profile doesn't name).
const SOOTHING = product([
  INGREDIENTS["niacinamide"],
  verified("Allantoin"),
  INGREDIENTS["panthenol"],
  INGREDIENTS["butylene-glycol"],
]);

const at = (sensitivity: SkinProfile["sensitivity"]): SkinProfile => ({
  ...EMPTY_PROFILE,
  baseSkinType: "normal",
  concerns: ["dullness"],
  sensitivity,
});

beforeEach(() => resetScoreCache());

describe("the two predicates", () => {
  it("leaves isSensitive alone — an unset answer is still not 'sensitive'", () => {
    expect(isSensitive(at(null))).toBe(false);
  });

  it("treats a scored, unset profile as reactive, and no-one else who didn't say so", () => {
    expect(treatAsReactive(at(null))).toBe(true);
    expect(treatAsReactive(at("none"))).toBe(false);
    expect(treatAsReactive(at("some"))).toBe(true);
    expect(treatAsReactive(at("high"))).toBe(true);
    expect(treatAsReactive(EMPTY_PROFILE)).toBe(false);
  });
});

describe("the irritation charge, per answer", () => {
  const penalty = (p: typeof AHA_SERUM, s: SkinProfile["sensitivity"]) => {
    resetScoreCache();
    return matchProduct(p, at(s)).breakdown.irritationPenalty;
  };

  it("charges unset exactly like 'somewhat sensitive', below 'very' and above 'not'", () => {
    for (const p of [AHA_SERUM, FRAGRANCED]) {
      expect(penalty(p, null)).toBeCloseTo(penalty(p, "some"));
      expect(penalty(p, null)).toBeGreaterThan(penalty(p, "none"));
      expect(penalty(p, "high")).toBeGreaterThan(penalty(p, null));
    }
  });

  it("fires the sensitive-only AHA rule for an unset profile, and not for 'not sensitive'", () => {
    expect(matchProduct(AHA_SERUM, at(null)).irritants).toContain("Glycolic Acid");
    resetScoreCache();
    expect(matchProduct(AHA_SERUM, at("none")).irritants).not.toContain("Glycolic Acid");
  });
});

describe("benefits and words stay with what was said", () => {
  it("never credits a sensitive-skin benefit on a non-answer", () => {
    const typeFit = (s: SkinProfile["sensitivity"]) => {
      resetScoreCache();
      return matchProduct(SOOTHING, at(s)).breakdown.typeFit;
    };
    expect(typeFit(null)).toBe(typeFit("none"));
    expect(typeFit("some")).toBeGreaterThan(typeFit(null));
    resetScoreCache();
    expect(matchProduct(SOOTHING, at(null)).reasons.map((r) => r.ingredient)).not.toContain("Allantoin");
  });

  it("lists the charged irritant, so the count on screen and the penalty agree", () => {
    const result = matchProduct(FRAGRANCED, at(null));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toBe(UNSET_SENSITIVITY_REASON);
    expect(result.breakdown.irritationPenalty).toBeGreaterThan(0);
  });

  it("says why beside the irritation charge, and only when sensitivity is unset", () => {
    const line = (s: SkinProfile["sensitivity"]) => {
      resetScoreCache();
      return scoreExplanation(matchProduct(AHA_SERUM, at(s))).find((l) => l.label === "Irritation risk")?.detail;
    };
    expect(line(null)).toContain(SENSITIVITY_UNSET_NOTE);
    expect(line("some")).not.toContain(SENSITIVITY_UNSET_NOTE);
    expect(SENSITIVITY_UNSET_NOTE).not.toMatch(/you (told|said)|not sure/i);
  });

  it("shows a visitor with no profile exactly what it did: no score, no irritant warnings", () => {
    const result = matchProduct(FRAGRANCED, EMPTY_PROFILE);
    expect(result.unknownReason).toBe("not_personalized");
    expect(result.warnings).toEqual([]);
  });
});

// Not answering must never be the way to a better score.
it("never scores an unset profile above the same profile at 'somewhat sensitive'", async () => {
  const catalogue = await fetchProducts();
  expect(catalogue.length).toBeGreaterThan(0);
  for (const p of [...catalogue, AHA_SERUM, FRAGRANCED, SOOTHING]) {
    for (const concerns of [["dullness"], ["acne-prone"], ["redness"], []] as SkinProfile["concerns"][]) {
      const base = { ...EMPTY_PROFILE, baseSkinType: "combination" as const, concerns };
      resetScoreCache();
      const unset = matchProduct(p, { ...base, sensitivity: null }).score;
      resetScoreCache();
      const some = matchProduct(p, { ...base, sensitivity: "some" }).score;
      if (unset === null || some === null) continue;
      expect(unset).toBeLessThanOrEqual(some);
    }
  }
});
