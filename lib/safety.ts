import type { Ingredient, SkinProfile } from "@/data/types";
import { pregnancyCautionHits } from "./pregnancy-caution";
import { isSensitive, treatAsReactive } from "./profile";
import type { RuleSource } from "./rules";

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
  /** Where the caution comes from, when we hold a checked source (#326). */
  source?: RuleSource;
};

/**
 * Where an "avoid" warning comes from (#347): the importers mark an ingredient
 * `avoid` only when the EU lists it in Annex II of the Cosmetics Regulation,
 * and Article 14 says a cosmetic product must not contain one. Read through
 * the EU Publications Office's copy of the same text (CELEX 32009R1223), since
 * EUR-Lex shows automated fetches a bot check.
 *
 * Annex III ("restricted") has no source here on purpose: the regulation says
 * those ingredients are allowed only within set limits, not that they are
 * common irritants, which is what that warning tells the user.
 */
export const EU_PROHIBITED_SOURCE: RuleSource = {
  label: "EU Cosmetics Regulation, Annex II",
  url: "https://eur-lex.europa.eu/eli/reg/2009/1223/oj",
};

/**
 * A restricted ingredient's warning when sensitivity isn't set (#183). Says
 * what the app did, never what the person said — most unset profiles simply
 * stopped the quiz before that question.
 */
export const UNSET_SENSITIVITY_REASON =
  "May irritate reactive skin — judged at the middle setting because your sensitivity isn't set";

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
  // Listed on the same condition the irritation penalty charges them (#183),
  // so a score docked for an irritant always shows which one. `treatAsReactive`
  // is false for a visitor with no profile, who keeps seeing hazards only.
  const reactive = treatAsReactive(profile);
  const cautionReason = isSensitive(profile) ? "Common irritant for sensitive skin" : UNSET_SENSITIVITY_REASON;

  for (const ingredient of ingredients) {
    // An unrecognised name supports no claim in either direction. Skipping it
    // means the product is neither warned about nor vouched for on its basis.
    if (!isVerified(ingredient)) continue;

    // "avoid" applies to everyone — it is not profile-dependent.
    if (ingredient.safety === "avoid") {
      found.push({ ingredient, reason: "Flagged as best avoided", severity: "hazard", origin: "avoid", source: EU_PROHIBITED_SOURCE });
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

    if (reactive && ingredient.safety === "caution") {
      found.push({
        ingredient,
        reason: cautionReason,
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
      found.push({ ingredient: hit.ingredient, reason: hit.reason, severity: "irritant", origin: "pregnancy", source: hit.source });
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
 * list, from the regulatory `safety` field and the comedogenic threshold.
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
