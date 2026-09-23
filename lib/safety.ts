import type { Ingredient, SkinProfile } from "@/data/types";
import { pregnancyCautionHits } from "./pregnancy-caution";
import { isSensitive } from "./profile";

/**
 * Single source of truth for ingredient risk. Previously this predicate was
 * copy-pasted across several screens, which let a "Flagged" count drift out
 * of step with the detail screen's banner.
 */

/** Comedogenic rating at or above which we consider an ingredient pore-clogging. */
export const COMEDOGENIC_FLAG_THRESHOLD = 3;

/** Rating at or above which an ingredient is a real problem for acne-prone skin. */
export const COMEDOGENIC_SEVERE_THRESHOLD = 4;

/**
 * Whether a name was matched to an authoritative dictionary. `undefined` means
 * the hand-written sample catalogue, which is trusted; only an explicit
 * `false` marks something parsed off a crowdsourced label and unrecognised.
 */
export function isVerified(ingredient: Ingredient): boolean {
  return ingredient.verified !== false;
}

/**
 * Share of the ingredient list we could identify.
 *
 * Lives here rather than in `lib/matching.ts`, which is where it used to be:
 * `matching.ts` calls into `lib/pore-clogging.ts` (for `poreCloggingHits`),
 * and `pore-clogging.ts` needed this back — a require cycle that "Require
 * cycles are allowed, but can result in uninitialized values" was warning
 * about on every cold start. It never actually broke anything (both call
 * sites read it well after module load, inside a function body, not at
 * module-evaluation time), but a warning that says a class of bug is possible
 * shouldn't be left standing when the fix is moving four lines to the module
 * both callers already depend on regardless.
 */
export function formulaCoverage(ingredients: Ingredient[]): number {
  if (ingredients.length === 0) return 0;
  return ingredients.filter(isVerified).length / ingredients.length;
}

/**
 * Worth surfacing to any user, regardless of profile.
 *
 * The comedogenic half of this test only ever fires on the hand-written sample
 * catalogue: no real row carries a rating, and `data/api.ts` collapses that
 * absence to 0. That is deliberate rather than an oversight — see
 * `ComedogenicRating` in `data/types.ts` — so on catalogue products this
 * reduces to the regulatory `safety` field, and pore-clogging is judged by
 * `INGREDIENT_RULES` instead.
 */
export function isFlagged(ingredient: Ingredient): boolean {
  // An unrecognised name is not "not flagged" — it is unassessed. Returning
  // false here would let it count silently toward a clean bill of health.
  if (!isVerified(ingredient)) return false;
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
  /**
   * How hard this lands on the score.
   *
   * `hazard`  — the ingredient is a problem in its own right. Caps the score.
   * `irritant` — it is restricted or commonly reactive, and the user said
   *   their skin reacts. Worth showing, but graduated rather than absolute.
   *
   * The distinction exists because collapsing the two capped 40% of the
   * catalogue at "Poor" for anyone who ticked "somewhat sensitive" — 97 of
   * 100 warnings were the `caution` kind — so a sensitive user could never
   * receive good news however gentle a formula was. Sensitivity has three
   * levels now, and the irritation penalty in `lib/matching.ts` is where
   * that nuance belongs; a hard cap has none.
   */
  severity: "hazard" | "irritant";
  /**
   * Where this hit came from, so a consumer can group or filter without
   * string-matching `reason` (#187). `pregnancy` hits are not a general
   * irritation risk — they need their own section on the result screen,
   * separate from the sensitivity/comedogenic count.
   */
  origin: "avoid" | "comedogenic" | "restricted" | "pregnancy";
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
  const { concerns } = profile;
  const sensitive = isSensitive(profile);

  for (const ingredient of ingredients) {
    // An unrecognised name supports no claim in either direction. Skipping it
    // means the product is neither warned about nor vouched for on its basis.
    if (!isVerified(ingredient)) continue;

    // "avoid" applies to everyone — it is not profile-dependent.
    if (ingredient.safety === "avoid") {
      found.push({ ingredient, reason: "Flagged as best avoided", severity: "hazard", origin: "avoid" });
      continue;
    }

    if (
      concerns.includes("acne-prone") &&
      ingredient.comedogenic >= COMEDOGENIC_SEVERE_THRESHOLD
    ) {
      found.push({
        ingredient,
        reason: `Pore-clogging (${ingredient.comedogenic}/5) and you flagged acne-prone skin`,
        severity: "hazard",
        origin: "comedogenic",
      });
      continue;
    }

    if (sensitive && ingredient.safety === "caution") {
      found.push({
        ingredient,
        reason: "Common irritant for sensitive skin",
        severity: "irritant",
        origin: "restricted",
      });
    }
  }

  // Checked as its own pass, not folded into the loop above: pregnancy
  // caution is a name-pattern match (see lib/pregnancy-caution.ts), not a
  // dictionary field, so — like pore-clogging — it still fires on an
  // unrecognised name. A false negative here (missing "retinol" because the
  // row never matched our dictionary) is worse than a redundant warning.
  //
  // Pushed even for an ingredient already flagged above (#187): pregnancy
  // gets its own section on the result screen now, so a retinol that is both
  // a reactive-skin irritant and a pregnancy caution must appear in both —
  // once per origin, not deduped into one. `__tests__/safety.test.ts` pins
  // this as "reports an ingredient once per origin".
  if (profile.pregnancyStatus === "pregnant" || profile.pregnancyStatus === "breastfeeding") {
    for (const hit of pregnancyCautionHits(ingredients)) {
      found.push({ ingredient: hit.ingredient, reason: hit.reason, severity: "irritant", origin: "pregnancy" });
    }
  }

  return found;
}

/**
 * Warnings that count as a general irritation risk — everything except a
 * pregnancy hit, which gets its own section rather than inflating a count
 * that reads as "flagged for your skin" (#187). Used by the Irritation card
 * alone: the History log's "N flagged" badge deliberately does NOT use this
 * — see `historyWarningCount` below.
 */
export function irritationWarnings(warnings: Contraindication[]): Contraindication[] {
  return warnings.filter((w) => w.origin !== "pregnancy");
}

/**
 * Every contraindication, including pregnancy-origin ones — the count a
 * history entry's "N flagged" badge (`warningsAtView`) is recorded with.
 * Unlike `irritationWarnings` above, this must NOT exclude pregnancy hits:
 * a pregnancy-only caution (e.g. tretinoin) has to still show as flagged in
 * history, or it silently vanishes there instead of just moving to its own
 * section on the live result screen. Found in review on #257 (Codex).
 */
export function historyWarningCount(warnings: Contraindication[]): number {
  return warnings.length;
}

export type RiskGroup = "avoid" | "caution" | "clean" | "unknown";

/**
 * Buckets ingredients into three risk tiers for the detail screen's grouped
 * list. Built from the same predicates as `isFlagged`, so the grouped view
 * and any flat count elsewhere can never disagree about which ingredients
 * are worth a look.
 */
export function groupByRisk(ingredients: Ingredient[]): Record<RiskGroup, Ingredient[]> {
  const groups: Record<RiskGroup, Ingredient[]> = {
    avoid: [],
    caution: [],
    clean: [],
    unknown: [],
  };

  for (const ingredient of ingredients) {
    // Its own tier, because the alternative is filing an unrecognised name
    // under "No concerns" — presenting a gap in our data as a clean result.
    if (!isVerified(ingredient)) {
      groups.unknown.push(ingredient);
      continue;
    }
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
