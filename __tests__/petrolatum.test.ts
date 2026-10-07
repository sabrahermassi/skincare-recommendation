import { irritationCounts } from "@/lib/risk";
import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { ingredientLabel } from "@/lib/ingredient-labels";
import { matchProduct, resetScoreCache } from "@/lib/matching";
import { contraindications, REFINED_GRADE_NOTE_START, regulatoryStatus } from "@/lib/safety";
import { EMPTY_PROFILE } from "@/store/useAppStore";
import { safetyFor } from "../scripts/import-inci-dictionary.mjs";

/**
 * #361: petrolatum is `safe`, with a note saying why. As `caution` (0028) the
 * app read it as an EU-restricted irritant. Each test builds the row exactly
 * as the import now writes it. Since #407 an Annex III row that is not an
 * allergen entry costs nothing either way, so the old `caution` row is
 * checked against it only to show the fix no longer rests on the label.
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
    // 0028's label, restricted: still no warning, because Annex III alone says nothing about skin (#407).
    expect(contraindications(balm(row("caution")).ingredients, SENSITIVE)).toEqual([]);
  });

  it("costs a sensitive profile nothing on the score", () => {
    const safe = match(row("safe"), SENSITIVE);
    expect(safe.irritants).not.toContain("petrolatum");
    expect(safe.breakdown.irritationPenalty).toBe(0);
    expect(match(row("caution"), SENSITIVE).breakdown.irritationPenalty).toBe(0);
  });

  it("isn't a watch-out in the ingredient list or counted by the Irritation risk card", () => {
    // The Safety tab's labels, the same for everyone: no profile.
    const labels = (safety: Ingredient["safety"]) => {
      const product = balm(row(safety));
      const noProfile = matchProduct(product, EMPTY_PROFILE);
      return product.ingredients.map((i) => ingredientLabel(i, noProfile, false));
    };
    expect(labels("safe")).not.toContain("watch");
    expect(labels("safe")).not.toContain("avoid");
    expect(labels("caution")).not.toContain("watch");

    const product = balm(row("safe"));
    const counts = irritationCounts(product, match(row("safe"), SENSITIVE));
    expect(counts.personal).toBe(0);
    expect(counts.euFlagged).toBe(0);
  });

  it("isn't labelled Watch in the ingredient list", () => {
    const petrolatum = row("safe");
    expect(ingredientLabel(petrolatum, match(petrolatum, SENSITIVE), true)).not.toBe("watch");
    expect(ingredientLabel(petrolatum, match(petrolatum, SENSITIVE), false)).toBeNull();
  });
});

describe("its EU status on the ingredient page (#362)", () => {
  it("reads 'Allowed when refined', not 'No restriction' under a note about a ban", () => {
    expect(written.note?.startsWith(REFINED_GRADE_NOTE_START)).toBe(true);
    expect(regulatoryStatus(row("safe"))).toBe("Allowed when refined");
  });

  it("leaves every other safe ingredient at 'No restriction listed'", () => {
    expect(regulatoryStatus(OTHERS[1])).toBe("No restriction listed");
  });
});
