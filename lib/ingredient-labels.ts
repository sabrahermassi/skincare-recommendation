import type { Ingredient } from "@/data/types";
import { isLowCoverage, matchProduct, ruleFor, RUNG_META, type MatchResult } from "@/lib/matching";
import { isWarnedPoreClogging } from "@/lib/pore-clogging";
import type { RuleCategory } from "@/lib/rules";
import { groupByRisk } from "@/lib/safety";
import { EMPTY_PROFILE } from "@/store/useAppStore";

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
 *   anyone, a name on the published pore-clogging lists (the row wears a
 *   CLOGGING tag, and "Good" beside it, or folding it under "no known
 *   concerns", contradicts the tag, #290) or a common irritant
 *   (`isCommonIrritant`, #345).
 * - **Good**: a benefit the score counted for this person — a positive
 *   reason from a matched rule or a declared CosIng function.
 * - **Unknown**: not in the dictionary, so unassessed.
 * - no label: nothing known against it and no benefit for this person.
 *
 * With no skin profile there is no "you" to be good or risky for: only
 * Avoid, Unknown, and Watch for what is flagged for everyone (the EU's
 * caution list, the pore-clogging lists and the common irritants) are shown.
 * A pregnancy answer is not a skin profile, but its cautions are still Avoid.
 * Those profile-free labels are also the Ingredient check (#345).
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

  if (!personalized) return ingredient.safety === "caution" || isCommonIrritant(ingredient) ? "watch" : null;

  if (warnings.length > 0 || risk === "caution" || isCommonIrritant(ingredient)) return "watch";
  if (match.reasons.some((r) => r.ingredient === ingredient.name && r.effect > 0)) return "good";
  return null;
}

/**
 * The rule categories flagged for everyone, profile or not (#345): fragrance
 * (EU-labelled allergens and essential oils included), drying alcohol and
 * the known irritants. Actives that can also sting — acids, retinoids,
 * benzoyl peroxide — are left out: they are in a formula on purpose, and
 * whether they suit someone is the personal score's call.
 */
const FLAGGED_FOR_EVERYONE: ReadonlySet<RuleCategory> = new Set(["fragrance", "alcohol", "irritants"]);

/** A recognised ingredient whose rule puts it in one of those categories. */
export function isCommonIrritant(ingredient: Ingredient): boolean {
  const rule = ruleFor(ingredient);
  return rule !== undefined && FLAGGED_FOR_EVERYONE.has(rule.category);
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

/**
 * The Ingredient check at the top of every result (#345): how many
 * ingredients to avoid, to watch, and not recognised, the same for everyone
 * who scans the product. It is the ingredient list's own labels with no
 * profile, so the check and the rows can't disagree; with a profile the rows
 * can only add to it, since everything the check counts is Watch or Avoid
 * for every profile too.
 */
export type IngredientCheck =
  | { kind: "unreadable" }
  | { kind: "checked"; avoid: number; watch: number; unrecognised: number };

export function ingredientCheck(ingredients: Ingredient[]): IngredientCheck {
  // The score's own refusal rule: too little recognised to say anything.
  if (isLowCoverage(ingredients)) return { kind: "unreadable" };
  // What the score works out with no profile. A new object, not the product,
  // so this never replaces the person's own cached score for it; with no
  // profile the product type isn't read.
  const match = matchProduct({ type: "unknown", ingredients }, EMPTY_PROFILE);
  const labels = ingredients.map((ingredient) => ingredientLabel(ingredient, match, false));
  const count = (label: IngredientLabel) => labels.filter((l) => l === label).length;
  return { kind: "checked", avoid: count("avoid"), watch: count("watch"), unrecognised: count("unknown") };
}

const ingredientCount = (n: number) => (n === 1 ? "1 ingredient" : `${n} ingredients`);

/** The check in words. Never "safe" or "clean": only what was found. */
export function ingredientCheckLine(check: IngredientCheck): string {
  if (check.kind === "unreadable") return "Not enough ingredients recognised to check";
  const { avoid, watch, unrecognised } = check;
  const found =
    avoid > 0 && watch > 0
      ? `${avoid} to avoid · ${watch} to watch`
      : avoid > 0
        ? `${ingredientCount(avoid)} to avoid`
        : watch > 0
          ? `${ingredientCount(watch)} to watch`
          : "No ingredients of concern found";
  return unrecognised > 0 ? `${found} · ${unrecognised} not recognised` : found;
}

/** The rung colour that echoes the words: the worst thing found. */
export function ingredientCheckTone(check: IngredientCheck): keyof typeof RUNG_META {
  if (check.kind === "unreadable") return "neutral";
  return check.avoid > 0 ? "avoid" : check.watch > 0 ? "watch" : "good";
}
