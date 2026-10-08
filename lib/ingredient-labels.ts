import type { Ingredient, SkinProfile } from "@/data/types";
import { ruleFor, RUNG_META, type Contraindication, type MatchResult } from "@/lib/matching";
import { cloggerConfidence, isWarnedPoreClogging } from "@/lib/pore-clogging";
import { onlyLimitedInPregnancy } from "@/lib/pregnancy-caution";
import { isSensitive, treatAsReactive } from "@/lib/profile";
import { targetApplies, type RuleCategory } from "@/lib/rules";
import { contraindications, euAllergenFor, groupByRisk, isVerified, SAFETY_NOTICE_COPY, safetyNoticeFor } from "@/lib/safety";

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
 *   `caution` (an EU-labelled allergen, or a pore rating), any warning, or
 *   anything the score counted against them
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
 * allergen entries, the pore-clogging lists and the common irritants) are shown.
 * An Annex III ingredient that is none of those is "allowed with limits",
 * which says nothing about anyone's skin, so it has no label of its own.
 * A pregnancy answer is not a skin profile, but its cautions are still Avoid.
 * Those profile-free labels are also what a result's Safety tab shows everyone
 * (#345, #379).
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
  // A pore-clogger the lists agree on with strong evidence is red (owner, 2
  // October 2026), so the row matches the red Pore-clogging risk above it.
  // A moderate one stays Watch below; a contested one is never warned about.
  if (cloggerConfidence(ingredient) === "high") return "avoid";
  // Both also outrank not knowing. Pore-clogging matching fires on an
  // unrecognised name too, so a misread name can wear the CLOGGING tag and
  // cost the score: "Unknown" beside that contradicts both.
  if (countedAgainst(ingredient, match) || isWarnedPoreClogging(ingredient)) return "watch";
  if (risk === "unknown") return "unknown";

  if (!personalized) return euAllergenFor(ingredient) !== null || isCommonIrritant(ingredient) ? "watch" : null;

  if (warnings.length > 0 || risk === "caution" || isCommonIrritant(ingredient)) return "watch";
  if (match.reasons.some((r) => r.ingredient === ingredient.name && r.effect > 0)) return "good";
  return null;
}

/**
 * The rule categories flagged for everyone, profile or not (#345): fragrance
 * (essential oils and the allergens a rule names), drying alcohol and
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

/**
 * The word on a row, and the line under it, for the Ingredients tab and the
 * ingredient sheet. With the safety flag off it is the label's own word and
 * nothing else — today's screens. With it on (#404) "Avoid" says why it is
 * there: "Check label" and a line for the EU notice, "May clog pores" for a
 * strong pore-clogger, "Best avoided while pregnant" for a pregnancy caution.
 * Any other "Avoid" (an Annex II row the owner has not verified, a hazard)
 * keeps its word.
 */
export function rowWord(
  ingredient: Ingredient,
  label: IngredientLabel,
  warnings: readonly Contraindication[],
  noticeEnabled: boolean,
): { word: string; line?: string } {
  const plain = { word: LABEL_META[label].label };
  if (!noticeEnabled || label !== "avoid") return plain;
  if (safetyNoticeFor(ingredient, true)) return { word: SAFETY_NOTICE_COPY.listWord, line: SAFETY_NOTICE_COPY.listLine };
  if (warnings.some((w) => w.severity === "hazard") || riskOf(ingredient) === "avoid") return plain;
  if (warnings.some((w) => w.origin === "pregnancy")) {
    return { word: onlyLimitedInPregnancy([ingredient.name]) ? SAFETY_NOTICE_COPY.pregnancyLimitWord : SAFETY_NOTICE_COPY.pregnancyWord };
  }
  if (cloggerConfidence(ingredient) === "high") return { word: SAFETY_NOTICE_COPY.clogWord };
  return plain;
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
 * A rule's own targets for this person, read the way `computeMatch` reads
 * sensitivity (#183): for an ingredient opened without a product, where
 * there is no score to ask.
 */
export function ruleTargets(ingredient: Ingredient, profile: SkinProfile): { helps: boolean; hurts: boolean } {
  const rule = ruleFor(ingredient);
  if (!rule) return { helps: false, hurts: false };
  return {
    helps: targetApplies(rule.helps, { ...profile, sensitive: isSensitive(profile) }),
    hurts: targetApplies(rule.hurts, { ...profile, sensitive: treatAsReactive(profile) }),
  };
}

/**
 * The verdict for an ingredient opened on its own (a label photo, Saved), with
 * no product to score: the list's everyone-rules (EU status, fragrance and
 * common irritants, the pore-clogging lists), then what its rule does for this
 * person. Nothing against it reads as nothing against it (null), not "worth a
 * second look" — which used to be said of every recognised name, water included.
 */
export function labelWithoutProduct(ingredient: Ingredient, profile: SkinProfile): IngredientLabel | null {
  // In the list's order (`ingredientLabel`): a hazard or a pregnancy caution
  // first, even on an unrecognised name, so a retinol is never "Helps with"
  // for someone pregnant.
  const warnings = contraindications([ingredient], profile);
  if (warnings.some((w) => w.severity === "hazard" || w.origin === "pregnancy")) return "avoid";
  // As in the list: a strong-evidence pore-clogger is red, recognised or not.
  if (cloggerConfidence(ingredient) === "high") return "avoid";
  if (!isVerified(ingredient)) return isWarnedPoreClogging(ingredient) ? "watch" : "unknown";
  if (ingredient.safety === "avoid") return "avoid";
  if (warnings.length > 0 || euAllergenFor(ingredient) !== null || isCommonIrritant(ingredient) || isWarnedPoreClogging(ingredient)) return "watch";
  const { helps, hurts } = ruleTargets(ingredient, profile);
  if (hurts) return "watch";
  if (helps) return "good";
  return null;
}
