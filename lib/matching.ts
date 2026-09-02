import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { isPersonalized } from "./profile";
import {
  CATEGORY_LABEL,
  contactWeight,
  INGREDIENT_RULES,
  positionWeight,
  ruleMatches,
  targetApplies,
  type IngredientRule,
  type RuleCategory,
} from "./rules";
import { contraindications, isVerified, type Contraindication } from "./safety";

/**
 * The verdict engine.
 *
 * This used to be a placeholder: a base value plus a hash of the product id,
 * scored against product-level `suitableFor`/`targets` tags. That was tolerable
 * while the app was a browsable demo. It is not tolerable now the whole app is
 * one question — "does this suit me, and why" — and it stopped working
 * regardless, because every product from a real source arrives with those tags
 * empty. Only the hand-written sample catalogue ever had them.
 *
 * So scoring now reads the formula, which is the only thing we reliably hold:
 *
 *   1. Curated rules  — `lib/rules.ts`, ~35 entries, each with a stated reason
 *   2. INCI position  — regulated descending-concentration order
 *   3. Contraindications — the existing per-profile hazard check
 *
 * Everything else contributes nothing. There is no jitter, no invented
 * comedogenic number, and no score at all for a formula we could not read.
 */

export type Verdict = "good" | "mixed" | "poor" | "unknown";

export type MatchReason = {
  ingredient: string;
  reason: string;
  category: RuleCategory;
  /** Positive helps this profile, negative works against it. */
  effect: number;
};

/**
 * One bar on the "What moved the score" breakdown — several ingredients'
 * effects rolled up under a name a person recognises. Users think in
 * "fragrance" and "hydration", not in eleven individual INCI entries.
 */
export type ScoreFactor = {
  category: RuleCategory;
  label: string;
  /** Net points, rounded. Negative works against this profile. */
  delta: number;
  /** Bar fill, 0-1, relative to the largest factor present. */
  magnitude: number;
  /** The ingredients behind it, strongest first. */
  ingredients: string[];
  /** One line naming them, for under the bar. */
  note: string;
};

export type MatchResult = {
  /**
   * `null` when there is nothing to judge: no skin signal in the profile, or
   * a formula we could not read. A number here always means it was computed
   * from ingredients.
   */
  score: number | null;
  verdict: Verdict;
  /** Ingredients that are a problem for this specific profile. */
  warnings: Contraindication[];
  /** Why the score is what it is, strongest first. Drives the explanation. */
  reasons: MatchReason[];
  /** The same effects rolled up by category — the breakdown bars. */
  factors: ScoreFactor[];
  /** How much of the formula we could actually identify, 0–1. */
  coverage: number;
  /**
   * Why `verdict` is "unknown" — `undefined` otherwise. Three genuinely
   * different situations all produce a null score, and `verdictHeadline`
   * cannot tell them apart from `coverage` alone: an unpersonalised profile
   * can still show high coverage (it's computed before the profile is even
   * checked), and so can a formula we read fine but that contained nothing
   * this profile's rules speak to.
   */
  unknownReason?: "not_personalized" | "low_coverage" | "no_evidence";
};

/** Neutral starting point. Movement away from it has to be earned. */
const BASE_SCORE = 62;

/**
 * Below this share of recognised ingredients we decline to score. An OCR'd or
 * badly transcribed label can yield a list where most entries are unreadable,
 * and a confident percentage over that is worse than admitting we can't tell.
 */
const MIN_COVERAGE = 0.5;

/** Fewer identifiable ingredients than this is not a formula, it's a fragment. */
const MIN_IDENTIFIED = 4;

export function matchProduct(
  product: ProductWithIngredients,
  profile: SkinProfile
): MatchResult {
  const warnings = contraindications(product.ingredients, profile);
  const coverage = formulaCoverage(product.ingredients);

  if (!isPersonalized(profile)) {
    // Hazards are still worth flagging with no profile — they aren't
    // profile-dependent — but there is nothing to match against.
    return {
      score: null,
      verdict: "unknown",
      warnings,
      reasons: [],
      factors: [],
      coverage,
      unknownReason: "not_personalized",
    };
  }

  const identified = product.ingredients.filter(isVerified).length;
  if (identified < MIN_IDENTIFIED || coverage < MIN_COVERAGE) {
    return {
      score: null,
      verdict: "unknown",
      warnings,
      reasons: [],
      factors: [],
      coverage,
      unknownReason: "low_coverage",
    };
  }

  const reasons: MatchReason[] = [];
  let score = BASE_SCORE;

  product.ingredients.forEach((ingredient, position) => {
    // An unrecognised name supports no claim in either direction.
    if (!isVerified(ingredient)) return;

    const rule = findRule(ingredient);
    if (!rule) return;

    const weight = rule.weight * positionWeight(position) * contactWeight(product.type);
    const helps = targetApplies(rule.helps, profile);
    const hurts = targetApplies(rule.hurts, profile);

    // A rule can both help and hurt the same person — salicylic acid on oily,
    // sensitive skin. That is a genuine tension, not a bug, so both are
    // recorded and the net effect is what moves the score.
    let effect = 0;
    if (helps) effect += weight;
    if (hurts) effect -= weight;
    if (effect === 0) return;

    score += effect;
    reasons.push({
      ingredient: ingredient.name,
      reason: rule.reason,
      category: rule.category,
      effect,
    });
  });

  // Contraindications are hazards rather than preferences, so they cap rather
  // than merely subtract: a formula the checker objects to must not outrank
  // one it doesn't, however well the rest of it reads.
  if (warnings.length > 0) {
    score = Math.min(score, 45) - (warnings.length - 1) * 5;
  }

  // Reading a formula and having something to say about it are different
  // questions, and the gate above only asks the first. A formula can be 92%
  // recognised and still contain nothing this profile cares about — most of a
  // jar is solvent, thickener, chelator and preservative — in which case
  // `score` is still BASE_SCORE and returning it would present a default as a
  // finding.
  //
  // This was measured before it was fixed: no rule fired at all on 54 of 104
  // real products for an oily, acne-prone profile, and 61 for a pigmentation
  // one. Widening the table to cover the emollients, humectants and occlusives
  // those profiles actually meet brought that to 29 and 37, which is what makes
  // refusing here honest rather than merely unhelpful — it is now the minority
  // case, and it is the truthful answer when it happens.
  if (reasons.length === 0 && warnings.length === 0) {
    return {
      score: null,
      verdict: "unknown",
      warnings,
      reasons: [],
      factors: [],
      coverage,
      unknownReason: "no_evidence",
    };
  }

  const finalScore = clamp(score);
  reasons.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  return {
    score: finalScore,
    verdict: verdictFor(finalScore, warnings.length),
    warnings,
    // Capped for the "Why" list, which is a readable summary…
    reasons: reasons.slice(0, 6),
    // …but the bars aggregate every contribution, or they would under-report
    // a factor made of many small effects.
    factors: buildFactors(reasons),
    coverage,
  };
}

/** Share of the ingredient list we could identify. */
export function formulaCoverage(ingredients: Ingredient[]): number {
  if (ingredients.length === 0) return 0;
  return ingredients.filter(isVerified).length / ingredients.length;
}

function findRule(ingredient: Ingredient): IngredientRule | undefined {
  return INGREDIENT_RULES.find((rule) => ruleMatches(rule, ingredient.name));
}

function verdictFor(score: number, warningCount: number): Verdict {
  if (warningCount > 0) return "poor";
  if (score >= 75) return "good";
  if (score >= 55) return "mixed";
  return "poor";
}

/**
 * One line summarising the verdict, for the top of the result screen.
 * Deliberately says "we can't tell" rather than guessing.
 */
export function verdictHeadline(result: MatchResult): string {
  switch (result.verdict) {
    case "good":
      return "Looks like a good fit for your skin";
    case "mixed":
      return "Could work, with a caveat or two";
    case "poor":
      return result.warnings.length > 0
        ? "Contains something worth avoiding for your skin"
        : "Probably not the right pick for you";
    case "unknown":
      switch (result.unknownReason) {
        case "low_coverage":
          return "We couldn't read enough of this formula to judge it";
        case "no_evidence":
          // The formula read fine — this is not the low-coverage case above —
          // it simply contains nothing our rules have an opinion on for this
          // profile. Telling the user to "answer a few questions" would be
          // wrong: they already have, and coverage was good enough to score.
          return "We read this formula but found nothing that speaks to your skin";
        case "not_personalized":
        default:
          return "Answer a few questions and we can tell you how this suits you";
      }
  }
}

export function matchTone(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function clamp(score: number): number {
  return Math.max(0, Math.min(99, Math.round(score)));
}

/** Re-exported so screens don't need a second import to render warnings. */
export type { Contraindication, Ingredient };

/**
 * Roll per-ingredient effects up into the named factors the result screen
 * draws. Magnitude is relative to the largest factor rather than absolute, so
 * the bars stay legible whether a formula moved the score by 5 points or 40.
 */
function buildFactors(reasons: MatchReason[]): ScoreFactor[] {
  const byCategory = new Map<RuleCategory, MatchReason[]>();
  for (const reason of reasons) {
    const bucket = byCategory.get(reason.category) ?? [];
    bucket.push(reason);
    byCategory.set(reason.category, bucket);
  }

  const factors: ScoreFactor[] = [];
  for (const [category, entries] of byCategory) {
    const delta = Math.round(entries.reduce((sum, e) => sum + e.effect, 0));
    if (delta === 0) continue; // a factor that moved nothing is not a factor
    const ingredients = [...entries]
      .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
      .map((e) => e.ingredient);
    factors.push({
      category,
      label: CATEGORY_LABEL[category],
      delta,
      magnitude: 0, // filled in below, once the largest is known
      ingredients,
      note: noteFor(ingredients),
    });
  }

  const largest = Math.max(1, ...factors.map((f) => Math.abs(f.delta)));
  for (const factor of factors) {
    factor.magnitude = Math.abs(factor.delta) / largest;
  }

  return factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** "Glycerin, panthenol and 2 more" — names the evidence without a wall of text. */
function noteFor(ingredients: string[]): string {
  const shown = ingredients.slice(0, 2).map(titleCase);
  if (ingredients.length === 1) return shown[0];
  if (ingredients.length === 2) return `${shown[0]} and ${shown[1]}`;
  return `${shown.join(", ")} and ${ingredients.length - 2} more`;
}

function titleCase(name: string): string {
  return name.replace(/[a-z]/g, (c) => c.toUpperCase());
}

/**
 * The single thing most worth the user's attention: the largest factor working
 * against this profile. `null` when nothing does.
 */
export function biggestConcern(result: MatchResult): ScoreFactor | null {
  const negative = result.factors.filter((f) => f.delta < 0);
  return negative.length > 0 ? negative[0] : null;
}

/**
 * How one ingredient reads for one profile — the dot and pill in the design's
 * legend. Lives here rather than in a screen so the list and the detail view
 * cannot drift apart, which is the bug this codebase already hit once with the
 * flagged-ingredient count.
 *
 *   flag     works against this profile, or is contraindicated for it
 *   watch    carries an EU restriction, or we could not identify it
 *   good     recognised and either helpful or inert
 */
export type IngredientTone = "good" | "watch" | "flag";

export function ingredientTone(
  ingredient: Ingredient,
  result: MatchResult
): IngredientTone {
  if (result.warnings.some((w) => w.ingredient.id === ingredient.id)) return "flag";
  if (result.reasons.some((r) => r.ingredient === ingredient.name && r.effect < 0)) return "flag";
  if (!isVerified(ingredient)) return "watch";
  if (ingredient.safety !== "safe") return "watch";
  return "good";
}

/**
 * The rule that applies to an ingredient, if any — the detail screen uses it
 * for the plain-language explanation and the sensitive-skin read.
 */
export function ruleFor(ingredient: Ingredient): IngredientRule | undefined {
  return isVerified(ingredient) ? findRule(ingredient) : undefined;
}

/**
 * Plain-language weight of an INCI position, for the detail screen. Mirrors
 * the bands in `positionWeight` so the words and the maths cannot disagree.
 */
export function positionWeightLabel(index: number): string {
  if (index <= 2) return "high concentration";
  if (index <= 5) return "significant";
  if (index <= 10) return "moderate";
  if (index <= 20) return "low";
  return "trace";
}
