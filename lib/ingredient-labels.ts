import type { Ingredient } from "@/data/types";
import { RUNG_META, type MatchResult } from "@/lib/matching";
import { isWarnedPoreClogging } from "@/lib/pore-clogging";
import { groupByRisk } from "@/lib/safety";

/**
 * The word on each row of a product's ingredient list (#324), so the few that
 * matter can be found without reading every name.
 *
 * Nothing here decides anything new. Every label comes from what the score
 * itself already worked out, so a row can never say "Good" while "Why this
 * score" counts it against the person:
 * - **Avoid**: a hazard — `groupByRisk`'s `avoid`, a hazard-level warning
 *   for this person, or a pregnancy caution, with or without a skin profile.
 * - **Watch**: a caution or irritant for this person — `groupByRisk`'s
 *   `caution`, any warning, or anything the score counted against them
 *   (a negative reason, an irritation or pore-clogging charge) — and, for
 *   anyone, a name on the published pore-clogging lists: the row wears a
 *   CLOGGING tag, and "Good" beside it, or folding it under "no known
 *   concerns", contradicts the tag (#290).
 * - **Good**: a benefit the score counted for this person — a positive
 *   reason from a matched rule or a declared CosIng function.
 * - **Unknown**: not in the dictionary, so unassessed.
 * - no label: nothing known against it and no benefit for this person.
 *
 * With no skin profile there is no "you" to be good or risky for: only
 * Avoid, Unknown, and Watch for what is restricted for everyone (the EU's
 * caution list) and the pore-clogging lists are shown. A pregnancy answer is
 * not a skin profile, but its cautions are still Avoid.
 */
export type IngredientLabel = "avoid" | "watch" | "good" | "unknown";

/** Labelled rows come first, in this order. */
export const LABEL_ORDER: readonly IngredientLabel[] = ["avoid", "watch", "good", "unknown"];

/** A word and the existing rung colours for each — never colour alone. */
export const LABEL_META: Record<IngredientLabel, (typeof RUNG_META)["good"]> = {
  avoid: RUNG_META.avoid,
  watch: RUNG_META.watch,
  good: RUNG_META.good,
  unknown: { ...RUNG_META.neutral, label: "Unknown" },
};

export function ingredientLabel(ingredient: Ingredient, match: MatchResult, personalized: boolean): IngredientLabel | null {
  const warnings = match.warnings.filter((w) => w.ingredient.id === ingredient.id);
  // A hazard or a pregnancy caution outranks not knowing, and outranks having
  // no profile: pregnancy matching fires on an exact name even when a label
  // read left the row unverified. A pregnancy hit is `severity: "irritant"`
  // for the score (see `lib/pregnancy-caution.ts`), so it is named here
  // rather than caught by the severity check. Every warning is read: one
  // ingredient can carry one per origin.
  if (warnings.some((w) => w.severity === "hazard" || w.origin === "pregnancy")) return "avoid";

  const risk = riskOf(ingredient);
  if (risk === "avoid") return "avoid";
  // Both also outrank not knowing. Pore-clogging matching fires on an
  // unrecognised name too, so a misread name can wear the CLOGGING tag and
  // cost the score: "Unknown" beside that contradicts both.
  if (countedAgainst(ingredient, match) || isWarnedPoreClogging(ingredient)) return "watch";
  if (risk === "unknown") return "unknown";

  if (!personalized) return ingredient.safety === "caution" ? "watch" : null;

  if (warnings.length > 0 || risk === "caution") return "watch";
  if (match.reasons.some((r) => r.ingredient === ingredient.name && r.effect > 0)) return "good";
  return null;
}

/**
 * Whether the score counted this ingredient against the person: a negative
 * reason, or an irritation or pore-clogging charge. Shared with the
 * ingredient page, so its "Works against your profile" can't drift from the
 * list's Watch.
 */
export function countedAgainst(ingredient: Ingredient, match: MatchResult): boolean {
  const name = ingredient.name;
  return (
    match.reasons.some((r) => r.ingredient === name && r.effect < 0) ||
    match.irritants.includes(name) ||
    match.cloggersCharged.includes(name)
  );
}

function riskOf(ingredient: Ingredient) {
  const groups = groupByRisk([ingredient]);
  return groups.avoid.length ? "avoid" : groups.caution.length ? "caution" : groups.unknown.length ? "unknown" : "clean";
}

export type LabelledIngredient = { ingredient: Ingredient; label: IngredientLabel | null };

/**
 * The list read at a glance: labelled rows first (Avoid, Watch, Good,
 * Unknown), each group in the order printed on the pack, then the rows with
 * nothing to say, which the screen folds away.
 */
export function sortForGlance(
  ingredients: readonly Ingredient[],
  match: MatchResult,
  personalized: boolean,
): { labelled: LabelledIngredient[]; unlabelled: LabelledIngredient[] } {
  const rows = ingredients.map((ingredient) => ({ ingredient, label: ingredientLabel(ingredient, match, personalized) }));
  const labelled = LABEL_ORDER.flatMap((label) => rows.filter((row) => row.label === label));
  const unlabelled = rows.filter((row) => row.label === null);
  return { labelled, unlabelled };
}
