import type { Ingredient, SkinProfile } from "@/data/types";

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
 *
 * The "avoid" check applies to every visitor, personalised or not, because
 * it isn't profile-dependent — pass `EMPTY_PROFILE` for an unanswered quiz.
 */
export function contraindications(
  ingredients: Ingredient[],
  profile: SkinProfile
): Contraindication[] {
  const found: Contraindication[] = [];
  const { concerns, sensitive } = profile;

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

    if (sensitive && ingredient.safety === "caution") {
      found.push({ ingredient, reason: "Common irritant for sensitive skin" });
    }
  }

  return found;
}

export type RiskGroup = "avoid" | "caution" | "clean";

/**
 * Buckets ingredients into three risk tiers for the detail screen's grouped
 * list. Built from the same predicates as `isFlagged`, so the grouped view
 * and any flat count elsewhere can never disagree about which ingredients
 * are worth a look.
 */
export function groupByRisk(ingredients: Ingredient[]): Record<RiskGroup, Ingredient[]> {
  const groups: Record<RiskGroup, Ingredient[]> = { avoid: [], caution: [], clean: [] };

  for (const ingredient of ingredients) {
    if (ingredient.safety === "avoid") {
      groups.avoid.push(ingredient);
    } else if (
      ingredient.safety === "caution" ||
      ingredient.comedogenic >= COMEDOGENIC_FLAG_THRESHOLD
    ) {
      groups.caution.push(ingredient);
    } else {
      groups.clean.push(ingredient);
    }
  }

  return groups;
}
