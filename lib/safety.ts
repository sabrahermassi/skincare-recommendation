import type { Concern, Ingredient, SkinType } from "@/data/types";

/**
 * Single source of truth for ingredient risk. Previously this predicate was
 * copy-pasted into three screens, which meant the compare screen's "Flagged"
 * count could drift out of step with the detail screen's banner.
 */

/** Comedogenic rating at or above which we consider an ingredient pore-clogging. */
export const COMEDOGENIC_FLAG_THRESHOLD = 3;

/** Rating at or above which an ingredient is a real problem for acne-prone skin. */
export const COMEDOGENIC_SEVERE_THRESHOLD = 4;

/** Worth surfacing to any user, regardless of profile. */
export function isFlagged(ingredient: Ingredient): boolean {
  return (
    ingredient.comedogenic >= COMEDOGENIC_FLAG_THRESHOLD ||
    ingredient.safety !== "safe"
  );
}

export function flaggedIngredients(ingredients: Ingredient[]): Ingredient[] {
  return ingredients.filter(isFlagged);
}

export type Contraindication = {
  ingredient: Ingredient;
  /** Short, user-facing reason this specific profile should be careful. */
  reason: string;
};

/**
 * Ingredients that are a problem *for this particular user*, as opposed to
 * generally flagged.
 *
 * This exists because product-level `targets` tags are author-supplied and can
 * contradict the formula: the sample catalogue contains an ampoule tagged
 * `acne-prone` whose INCI list includes isopropyl myristate (comedogenic 5,
 * safety "avoid"). Without this check the browse screen scored that product at
 * 99% for acne-prone users while the detail screen warned about the very same
 * ingredient.
 */
export function contraindications(
  ingredients: Ingredient[],
  skinType: SkinType | null,
  concerns: Concern[]
): Contraindication[] {
  const found: Contraindication[] = [];

  for (const ingredient of ingredients) {
    // "avoid" applies to everyone — it is not profile-dependent.
    if (ingredient.safety === "avoid") {
      found.push({ ingredient, reason: "Flagged as best avoided" });
      continue;
    }

    if (
      concerns.includes("acne-prone") &&
      ingredient.comedogenic >= COMEDOGENIC_SEVERE_THRESHOLD
    ) {
      found.push({
        ingredient,
        reason: `Pore-clogging (${ingredient.comedogenic}/5) and you flagged acne-prone skin`,
      });
      continue;
    }

    if (skinType === "sensitive" && ingredient.safety === "caution") {
      found.push({ ingredient, reason: "Common irritant for sensitive skin" });
    }
  }

  return found;
}
