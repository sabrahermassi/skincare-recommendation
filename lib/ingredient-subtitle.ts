import type { Ingredient } from "@/data/types";
import type { IngredientLabel } from "@/lib/ingredient-labels";
import { ruleFor, type Contraindication } from "@/lib/matching";
import { isWarnedPoreClogging } from "@/lib/pore-clogging";
import { isVerified } from "@/lib/safety";

/** Falls back to the CosIng function list when no curated rule applies. */
function functionLabel(ingredient: Ingredient): string {
  return ingredient.functions && ingredient.functions.length > 0
    ? ingredient.functions.slice(0, 2).join(" · ")
    : "No known concerns";
}

/** A rule's sentence under the name it opens with, without saying the name twice ("Glycerin draws water…" → "Draws water…", "Adenosine is a smoothing active" → "A smoothing active"). */
function withoutOwnName(sentence: string, name: string): string {
  if (!sentence.toLowerCase().startsWith(`${name.toLowerCase()} `)) return sentence;
  const rest = sentence.slice(name.length).trim().replace(/^(is|are)\s+/i, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * The line under an ingredient's name in the product result's ingredient
 * box: what it does, or why it's flagged.
 */
export function ingredientSubtitle(ingredient: Ingredient, label: IngredientLabel | null, warning?: Contraindication): string {
  const rule = ruleFor(ingredient);
  const clogs = isWarnedPoreClogging(ingredient);
  // A warning outranks not knowing, the same precedence `ingredientLabel`
  // uses: pregnancy matching fires on an exact name even when OCR left the
  // row unverified, so the badge can already read "Avoid" here while this
  // subtitle used to still say "we can't assess this one" underneath it —
  // the row contradicting its own label. `warning` can still be absent on an
  // unverified "avoid" row, which is what the fallback covers.
  //
  // The verified branch is untouched: the most specific thing we hold there,
  // in order, is pore-clogging, a curated rule, the row's own note, then the
  // regulator's declared function list.
  return !isVerified(ingredient)
    ? label === "avoid" && warning
      ? warning.reason
      : clogs
        ? // Pore-clogging matching fires on an unrecognised name too, and the
          // row is Watch for it, not Unknown.
          "On the published pore-clogging lists"
        : "Not recognised - we can't assess this one"
    : clogs
      ? "On the published pore-clogging lists"
      : rule
        ? withoutOwnName(rule.reason.split(" - ")[0].trim(), ingredient.name)
        : (ingredient.note ?? functionLabel(ingredient));
}
