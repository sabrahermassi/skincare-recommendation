import { irritationCounts } from "@/components/RiskCards";
import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { ingredientCheck, ingredientLabel } from "@/lib/ingredient-labels";
import { matchProduct, resetScoreCache } from "@/lib/matching";
import { contraindications } from "@/lib/safety";
import { safetyFor } from "../scripts/import-inci-dictionary.mjs";

/**
 * #361: petrolatum is `safe`, with a note saying why. As `caution` (0028) the
 * app read it as an EU-restricted irritant. Each test builds the row exactly
 * as the import now writes it, and checks the old `caution` row against the
 * same formula so the difference is the label and nothing else.
 */

const written = safetyFor("petrolatum", { en: "II/904" });

function row(safety: Ingredient["safety"]): Ingredient {
  return { id: "petrolatum", name: "petrolatum", comedogenic: 0, safety, verified: true, note: written.note ?? undefined };
}

const OTHERS = ["aqua", "glycerin", "cetearyl alcohol", "dimethicone", "panthenol", "tocopherol"].map(
  (name): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true })
);

/** A balm led by petrolatum, which is where it usually sits. */
const balm = (petrolatum: Ingredient): Pick<ProductWithIngredients, "type" | "ingredients"> => ({
  type: "moisturizer",
  ingredients: [OTHERS[0], petrolatum, ...OTHERS.slice(1)],
});

const SENSITIVE: SkinProfile = { concerns: ["dehydrated"], baseSkinType: "dry", sensitivity: "high", pregnancyStatus: null };

const match = (petrolatum: Ingredient, profile: SkinProfile) => {
  resetScoreCache();
  return matchProduct(balm(petrolatum), profile);
};

describe("petrolatum (#361)", () => {
  it("is written safe, keeping the note that says why", () => {
    expect(written.safety).toBe("safe");
    expect(written.note).toMatch(/^Allowed when fully refined\. .*\(EU Annex II\/904\)$/);
  });

  it("gets no warning for sensitive skin", () => {
    expect(contraindications(balm(row("safe")).ingredients, SENSITIVE)).toEqual([]);
    // What 0028's label did.
    expect(contraindications(balm(row("caution")).ingredients, SENSITIVE).map((w) => w.reason)).toEqual([
      "Common irritant for sensitive skin",
    ]);
  });

  it("costs a sensitive profile nothing on the score", () => {
    const safe = match(row("safe"), SENSITIVE);
    expect(safe.irritants).not.toContain("petrolatum");
    expect(safe.breakdown.irritationPenalty).toBe(0);
    expect(match(row("caution"), SENSITIVE).breakdown.irritationPenalty).toBeGreaterThan(0);
  });

  it("isn't counted by the Ingredient check or the Irritation risk card", () => {
    expect(ingredientCheck(balm(row("safe")).ingredients)).toMatchObject({ avoid: 0, watch: 0 });
    expect(ingredientCheck(balm(row("caution")).ingredients)).toMatchObject({ watch: 1 });

    const product = balm(row("safe"));
    const counts = irritationCounts(product, match(row("safe"), SENSITIVE));
    expect(counts.personal).toBe(0);
    expect(counts.restricted).toBe(0);
  });

  it("isn't labelled Watch in the ingredient list", () => {
    const petrolatum = row("safe");
    expect(ingredientLabel(petrolatum, match(petrolatum, SENSITIVE), true)).not.toBe("watch");
    expect(ingredientLabel(petrolatum, match(petrolatum, SENSITIVE), false)).toBeNull();
  });
});
