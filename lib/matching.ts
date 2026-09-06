import type { Concern, Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { poreCloggingHits, type CloggerHit } from "./pore-clogging";
import { isPersonalized, isSensitive } from "./profile";
import {
  CATEGORY_LABEL,
  contactWeight,
  functionSignal,
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

/**
 * The four bands the MVP locks, plus "unknown" for a formula we decline to
 * score. Thresholds live in `verdictFor` and are the single definition — the
 * score ring, the result panel and the badges all read this rather than
 * re-deriving their own cutoffs, which is how the old 75/55 verdict and 80/65
 * badge tones came to disagree with each other on the same product.
 */
export type Verdict = "excellent" | "good" | "fair" | "poor" | "unknown";

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
   * How much to trust the score, 0–1 — a separate axis from what the score
   * says. Built from coverage and from how many ingredients actually carried
   * evidence, so "we read 27 of 29 names and 2 of them meant anything" reads
   * as the weak result it is instead of a confident number.
   */
  confidence: number;
  /**
   * Why `verdict` is "unknown" — `undefined` otherwise. The two remaining
   * cases need different copy and cannot be told apart from `coverage` alone:
   * an unpersonalised profile can still show high coverage, because coverage
   * is computed before the profile is even looked at.
   *
   * There used to be a third, `no_evidence`, for a formula we read fine but
   * had nothing to say about. That is now a low-CONFIDENCE score rather than
   * a refusal — see `confidence` above.
   */
  unknownReason?: "not_personalized" | "low_coverage";
};

/**
 * A formula that matches your profile but does nothing dramatic lands here —
 * mid "Fair". Movement in either direction has to be earned from ingredients.
 */
const ANCHOR = 30;
const FIT_LEVER = 0.7;

/**
 * How much evidence counts as a full-strength signal, per concern.
 *
 * These are not arbitrary: they are the 75th percentile of positive evidence
 * a real formula can actually offer that concern, measured across the
 * catalogue. Without them, "dehydrated" (where humectants are in 84% of
 * products) is graded on the same curve as "fine lines" (where the actives
 * are rare), and a dehydrated user sees 80s while everyone else sees 60s for
 * formulas that serve them equally well.
 */
const CONCERN_SATURATION: Record<Concern, number> = {
  dehydrated: 16.6,
  atopic: 14.4,
  hyperpigmentation: 7.4,
  redness: 6.6,
  "large-pores": 6.5,
  "fine-lines": 4,
  dullness: 4,
  // Acne fit is carried by pore-clogging risk below, not by collecting
  // actives, so this only scales the bonus when a formula does contain them.
  "acne-prone": 4,
};

const TYPE_SATURATION = 12;
const IRRITATION_SATURATION = 14;
const PORE_SATURATION = 9;

const MAX_IRRITATION_PENALTY = 34;
const MAX_PORE_PENALTY = 22;

/** Concerns whose fit is decided by pore-cleanliness rather than by actives. */
const PORE_LED_CONCERNS: Concern[] = ["acne-prone", "large-pores"];

/**
 * How much a formula's pore-clogging load matters as a *penalty*.
 *
 * Zero when the user named a pore-led concern, because for them cleanliness
 * is already the larger half of concern fit — charging it twice put every
 * ordinary formula in "Poor" for an acne-prone user, which is the same
 * never-any-good-news failure this phase exists to fix.
 */
function poreRelevance(profile: SkinProfile): number {
  if (profile.concerns.some((c) => PORE_LED_CONCERNS.includes(c))) return 0;
  if (profile.baseSkinType === "oily" || profile.baseSkinType === "combination") return 0.4;
  return 0.15;
}

/** Irritants are judged harder the more reactive the user says they are. */
const SENSITIVITY_MULTIPLIER: Record<NonNullable<SkinProfile["sensitivity"]>, number> = {
  none: 0.5,
  some: 1,
  high: 1.6,
};

/** Confidence-tier weight for a pore-clogging hit. Contested ones count zero. */
const CLOGGER_WEIGHT: Record<CloggerHit["confidence"], number> = {
  high: 3,
  moderate: 1.8,
  contested: 0,
};

/**
 * Diminishing returns. A 60-ingredient list must not out-score a good
 * 20-ingredient one by sheer length.
 */
const saturate = (value: number, k: number) => value / (value + k);

/** Below this there is genuinely nothing to read — not merely nothing to say. */
const MIN_COVERAGE = 0.25;
const MIN_IDENTIFIED = 3;

export function matchProduct(
  product: ProductWithIngredients,
  profile: SkinProfile
): MatchResult {
  const warnings = contraindications(product.ingredients, profile);
  const coverage = formulaCoverage(product.ingredients);
  const identified = product.ingredients.filter(isVerified).length;

  const refuse = (unknownReason: MatchResult["unknownReason"]): MatchResult => ({
    score: null,
    verdict: "unknown",
    warnings,
    reasons: [],
    factors: [],
    coverage,
    confidence: 0,
    unknownReason,
  });

  if (!isPersonalized(profile)) {
    // Hazards are still worth flagging with no profile — they aren't
    // profile-dependent — but there is nothing to match against.
    return refuse("not_personalized");
  }
  if (identified < MIN_IDENTIFIED || coverage < MIN_COVERAGE) return refuse("low_coverage");

  // The rules table speaks a boolean; sensitivity has three levels, and the
  // magnitude is applied to the irritation penalty rather than to whether a
  // rule fires at all.
  const target = { ...profile, sensitive: isSensitive(profile) };
  const contact = contactWeight(product.type);

  const reasons: MatchReason[] = [];
  const concernEvidence = new Map<Concern, number>(profile.concerns.map((c) => [c, 0]));
  let typeEvidence = 0;
  let irritation = 0;
  let scored = 0;

  product.ingredients.forEach((ingredient, position) => {
    // An unrecognised name supports no claim in either direction.
    if (!isVerified(ingredient)) return;
    const weightAt = positionWeight(position) * contact;

    const rule = findRule(ingredient);
    if (rule) {
      const weight = rule.weight * weightAt;
      const helps = targetApplies(rule.helps, target);
      const hurts = targetApplies(rule.hurts, target);

      // A rule can both help and hurt the same person — salicylic acid on
      // oily, sensitive skin. That is a genuine tension, not a bug, so both
      // are recorded and the net effect is what moves the score.
      let effect = 0;
      if (helps) effect += weight;
      if (hurts) effect -= weight;

      for (const concern of profile.concerns) {
        if (rule.helps?.concerns?.includes(concern)) bump(concernEvidence, concern, weight);
        if (rule.hurts?.concerns?.includes(concern)) bump(concernEvidence, concern, -weight);
      }
      if (profile.baseSkinType) {
        if (rule.helps?.skinTypes?.includes(profile.baseSkinType)) typeEvidence += weight;
        if (rule.hurts?.skinTypes?.includes(profile.baseSkinType)) typeEvidence -= weight;
      }
      if (rule.helps?.sensitive && isSensitive(profile)) typeEvidence += weight * 0.6;
      if (IRRITANT_CATEGORIES.has(rule.category) && hurts) irritation += weight;

      if (effect !== 0) {
        scored++;
        reasons.push({
          ingredient: ingredient.name,
          reason: rule.reason,
          category: rule.category,
          effect,
        });
      }
      return;
    }

    // Layer 2. Only reached when no curated rule claims this ingredient, so a
    // named rule always wins and nothing is counted twice.
    for (const declared of ingredient.functions ?? []) {
      const signal = functionSignal(declared);
      if (!signal || !targetApplies(signal.helps, target)) continue;
      const weight = signal.weight * weightAt;
      for (const concern of profile.concerns) {
        if (signal.helps.concerns?.includes(concern)) bump(concernEvidence, concern, weight);
      }
      if (profile.baseSkinType && signal.helps.skinTypes?.includes(profile.baseSkinType)) {
        typeEvidence += weight;
      }
      scored++;
      reasons.push({
        ingredient: ingredient.name,
        reason: FUNCTION_REASON[signal.category] ?? "Declared function relevant to your skin",
        category: signal.category,
        effect: weight,
      });
    }
  });

  // Regulatory caution flags add irritation risk for anyone who said their
  // skin reacts — the rules table names specific sensitisers, this catches
  // the EU-restricted ones it does not.
  for (const [position, ingredient] of product.ingredients.entries()) {
    if (!isVerified(ingredient) || ingredient.safety !== "caution") continue;
    if (!isSensitive(profile)) continue;
    irritation += 2.5 * positionWeight(position) * contact;
  }

  // Acne fit is "what is in here that clogs pores", not "does it contain acne
  // actives" — a plain gentle moisturiser is a good match for blemish-prone
  // skin precisely because it does nothing. Detection lives in
  // lib/pore-clogging.ts, which has no profile argument, no netting and no
  // truncation; this only decides how loudly it lands.
  const cloggers = poreCloggingHits(product.ingredients);
  const poreLoad = cloggers.reduce(
    (sum, hit) => sum + CLOGGER_WEIGHT[hit.confidence] * positionWeight(hit.position - 1) * contact,
    0
  );

  // 100 when the formula contains nothing that clogs, falling as it does.
  const poreSafety = 100 - 100 * saturate(poreLoad, PORE_SATURATION);

  const concernFits = profile.concerns.map((concern) => {
    const evidence = concernEvidence.get(concern) ?? 0;
    const k = CONCERN_SATURATION[concern];
    const fromActives =
      50 + 50 * (evidence >= 0 ? saturate(evidence, k) : -saturate(-evidence, k));

    // For blemishes and pores, "does it contain anything that will clog me"
    // is the question, and a plain gentle formula containing no actives at
    // all is a genuinely good answer — not causing breakouts IS the win.
    // Scoring these on actives alone made a clean moisturiser look mediocre
    // to the exact user it suits, because the median real formula carries no
    // acne active whatsoever. Actives still count, as the smaller half.
    // Cleanliness is necessary but not sufficient: at 45% it cannot on its own
    // carry a formula into the top bands (a clean jar with nothing helpful in
    // it lands mid-Fair), but a formula that clogs cannot climb out of Poor
    // however good its actives are.
    if (PORE_LED_CONCERNS.includes(concern)) return 0.45 * poreSafety + 0.55 * fromActives;
    return fromActives;
  });
  const concernFit = concernFits.length
    ? concernFits.reduce((a, b) => a + b, 0) / concernFits.length
    : null;
  const typeFit =
    50 +
    50 *
      (typeEvidence >= 0
        ? saturate(typeEvidence, TYPE_SATURATION)
        : -saturate(-typeEvidence, TYPE_SATURATION));

  // Concerns dominate when the user named any; skin type carries it alone
  // when they chose "I don't know" for type or named no concerns.
  const fit = concernFit === null ? typeFit : 0.7 * concernFit + 0.3 * typeFit;

  const irritationPenalty =
    MAX_IRRITATION_PENALTY *
    saturate(irritation * SENSITIVITY_MULTIPLIER[profile.sensitivity ?? "none"], IRRITATION_SATURATION);
  const porePenalty =
    MAX_PORE_PENALTY * poreRelevance(profile) * saturate(poreLoad, PORE_SATURATION);

  let score = ANCHOR + FIT_LEVER * fit - irritationPenalty - porePenalty;

  // Hazards cap rather than merely subtract: a formula containing something
  // best avoided must not outrank one that doesn't, however well the rest of
  // it reads.
  //
  // Only the `hazard` tier does this. The `irritant` tier — an EU-restricted
  // ingredient on skin the user says reacts — is still listed as a warning,
  // but it is charged to the irritation penalty above instead, where the
  // three sensitivity levels can scale it. Capping on it too was both a
  // double charge and a cliff: it put 40% of the catalogue at "Poor" for
  // anyone who ticked "somewhat sensitive".
  const hazards = warnings.filter((w) => w.severity === "hazard");
  if (hazards.length > 0) score = Math.min(score, 45) - (hazards.length - 1) * 5;

  const finalScore = clamp(score);
  reasons.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  return {
    score: finalScore,
    verdict: verdictFor(finalScore, hazards.length),
    warnings,
    // Capped for the "Why" list, which is a readable summary…
    reasons: reasons.slice(0, 6),
    // …but the bars aggregate every contribution, or they would under-report
    // a factor made of many small effects.
    factors: buildFactors(reasons),
    coverage,
    confidence: confidenceFor(coverage, scored),
  };
}

function bump(map: Map<Concern, number>, key: Concern, by: number) {
  map.set(key, (map.get(key) ?? 0) + by);
}

const IRRITANT_CATEGORIES = new Set<RuleCategory>(["fragrance", "alcohol", "irritants"]);

/** Layer 2 has no per-ingredient sentence, so the category supplies one. */
const FUNCTION_REASON: Partial<Record<RuleCategory, string>> = {
  hydration: "Declared as a humectant - draws and holds water in the skin",
  barrier: "Declared as an emollient or barrier ingredient - softens and slows water loss",
  soothing: "Declared as a soothing ingredient",
  actives: "Declared as an active with a relevant effect",
};

/**
 * How much to trust the number, separately from what the number says.
 *
 * This replaces a third refusal gate. The engine used to return "can't tell"
 * whenever no rule fired at all, which happened on 29-37 of 104 products
 * depending on the profile — an honest answer, but the wrong one: reading a
 * formula and finding little to say about it is a low-confidence result, not
 * an absent one. Unknown ingredients still vouch for nothing either way; they
 * lower confidence rather than blocking an answer.
 */
export function confidenceFor(coverage: number, scoredIngredients: number): number {
  return Math.max(0, Math.min(1, 0.55 * coverage + 0.45 * Math.min(1, scoredIngredients / 8)));
}

/** Share of the ingredient list we could identify. */
export function formulaCoverage(ingredients: Ingredient[]): number {
  if (ingredients.length === 0) return 0;
  return ingredients.filter(isVerified).length / ingredients.length;
}

function findRule(ingredient: Ingredient): IngredientRule | undefined {
  return INGREDIENT_RULES.find((rule) => ruleMatches(rule, ingredient.name));
}

/** MVP score bands: 90-100 excellent, 75-89 good, 60-74 fair, 0-59 poor. */
export const SCORE_BANDS = { excellent: 90, good: 75, fair: 60 } as const;

function verdictFor(score: number, hazardCount: number): Verdict {
  if (hazardCount > 0) return "poor";
  if (score >= SCORE_BANDS.excellent) return "excellent";
  if (score >= SCORE_BANDS.good) return "good";
  if (score >= SCORE_BANDS.fair) return "fair";
  return "poor";
}

/**
 * One line summarising the verdict, for the top of the result screen.
 * Deliberately says "we can't tell" rather than guessing.
 */
export function verdictHeadline(result: MatchResult): string {
  switch (result.verdict) {
    case "excellent":
      return "One of the better matches for your skin";
    case "good":
      return "Looks like a good fit for your skin";
    case "fair":
      return "Could work, with a caveat or two";
    case "poor":
      return result.warnings.some((w) => w.severity === "hazard")
        ? "Contains something worth avoiding for your skin"
        : "Probably not the right pick for you";
    case "unknown":
      switch (result.unknownReason) {
        case "low_coverage":
          return "We couldn't read enough of this formula to judge it";
        case "not_personalized":
        default:
          return "Answer a few questions and we can tell you how this suits you";
      }
  }
}

/**
 * Three visual tones for the compact badges, derived from the same cutoffs as
 * `verdictFor` rather than from their own. Excellent and good share a tone —
 * a badge has one colour to spend and both are "yes".
 */
export function matchTone(score: number): "high" | "medium" | "low" {
  if (score >= SCORE_BANDS.good) return "high";
  if (score >= SCORE_BANDS.fair) return "medium";
  return "low";
}

/** 100 is reachable: the MVP's top band is 90-100, not 90-99. */
function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
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
 * Four rungs, drawn soft. `ingredientTone` returns three, because it answers
 * "does this work for you"; an unrecognised name is a fourth thing — not good,
 * not a warning, just unassessed — and the design gives it its own quiet grey
 * rather than lumping it in with the watch-outs.
 *
 * Shared by the ingredient list and the ingredient detail screen, which show
 * a rung for the same ingredient — a second, independent derivation drifted
 * from this one before (the detail screen's null-match case fell back to
 * "watch" instead of using this function at all).
 */
export type Rung = "good" | "watch" | "avoid" | "neutral";

export const RUNG_META: Record<Rung, { dot: string; pill: string; ink: string; label: string }> = {
  good: { dot: "bg-level-good", pill: "bg-level-good-tint", ink: "text-level-good-ink", label: "Good" },
  watch: { dot: "bg-level-watch", pill: "bg-level-watch-tint", ink: "text-level-watch-ink", label: "Watch" },
  avoid: { dot: "bg-level-avoid", pill: "bg-level-avoid-tint", ink: "text-level-avoid-ink", label: "Avoid" },
  neutral: {
    dot: "bg-level-neutral",
    pill: "bg-level-neutral-tint",
    ink: "text-level-neutral-ink",
    label: "Neutral",
  },
};

export function rungFor(ingredient: Ingredient, match: MatchResult): Rung {
  if (!isVerified(ingredient)) return "neutral";
  const tone = ingredientTone(ingredient, match);
  return tone === "flag" ? "avoid" : tone;
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
