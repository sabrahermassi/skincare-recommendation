import type {
  Concern,
  Ingredient,
  ProductWithIngredients,
  SkinProfile,
} from "@/data/types";
import { displayIngredientName } from "./ingredient-name";
import { poreCloggingHits, type CloggerHit } from "./pore-clogging";
import { isPersonalized, isSensitive, treatAsReactive } from "./profile";
import {
  CATEGORY_LABEL,
  contactWeight,
  functionSignal,
  INGREDIENT_RULES,
  alphabeticalTailStart,
  positionWeights,
  ruleMatches,
  targetApplies,
  type IngredientRule,
  type RuleCategory,
  type RuleSource,
} from "./rules";
import { contraindications, formulaCoverage, isVerified, type Contraindication } from "./safety";

/**
 * The verdict engine — fit minus penalties.
 *
 *   FIT   = 0.7 x concern fit + 0.3 x skin-type fit   (each 0-100, 50 = neutral)
 *   SCORE = ANCHOR + FIT_LEVER x FIT - irritation - pore
 *
 * It reads the formula and nothing else. Product-level `suitableFor`/`targets`
 * tags are ignored: they are author-supplied, they contradict the INCI list
 * often enough to matter, and every product from a real source arrives with
 * them empty anyway.
 *
 * Three sources of evidence, in precedence order:
 *
 *   1. Curated rules — `lib/rules.ts`, each carrying the sentence shown to the
 *      user, so every claim traces to a line of code.
 *   2. Declared CosIng functions — breadth for the ~83% of ingredients that
 *      carry them. BENEFIT ONLY, and only where no rule already applies.
 *   3. `lib/pore-clogging.ts` — owns acne and large-pores fit outright.
 *
 * Two things that look like omissions and are not: there is no invented
 * comedogenic number (see `ComedogenicRating` in data/types.ts), and an
 * ingredient we cannot identify contributes nothing in either direction —
 * it lowers `confidence` rather than moving the score.
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
  /** The rule's source, when it has one (#326). */
  source?: RuleSource;
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
  /**
   * Why the score is what it is, strongest first. Every one, not a top few:
   * the ingredient list reads this to decide whether a row worked against
   * the person, and a truncated list badged the seventh such ingredient
   * "Good" (#290). Screens that want a short "why" slice it themselves.
   */
  reasons: MatchReason[];
  /**
   * Ingredients whose rule charged a harm to the irritation penalty. Kept beside
   * `reasons` because a reason is a net effect: a benefit equal to its harm nets
   * to zero and drops out, and the list is truncated, yet the charge still reached
   * the score. The ingredient list reads this so a charged ingredient is never
   * shown as fine.
   */
  irritants: string[];
  /**
   * Pore-cloggers on the published lists (contested entries excluded) that
   * this person's score was charged for through a pore-led concern — acne or
   * large pores, where formula cleanliness is most of the concern fit. Kept
   * beside `reasons` because clogging never becomes a reason line: it moves
   * the concern fit through `lib/pore-clogging.ts` instead. The ingredient
   * list reads this so a clogger that cost an acne-prone person points is
   * not badged "Good" beside its own CLOGGING tag (#290).
   */
  cloggersCharged: string[];
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
   * What the score is made of, for the "why this score" explanation. Each
   * fit is 0–100 with 50 meaning "nothing either way"; each penalty is the
   * points it removed. `concernFit` is null when the user named no concerns.
   *
   * Exposed because the screen was previously reduced to naming categories
   * ("hydration, fragrance") — it could say which direction a factor pushed
   * but never how much, or which of the two mattered more.
   */
  breakdown: {
    concernFit: number | null;
    typeFit: number;
    irritationPenalty: number;
    porePenalty: number;
  };
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
  /**
   * Set when a scored profile has no sensitivity answer, so irritants were
   * judged at the middle setting (#183). `scoreExplanation` reads it to say
   * so beside the irritation charge — it never claims the person told us
   * they were unsure, since most unset profiles just stopped the quiz early.
   */
  sensitivityUnset?: true;
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
 *
 * Exported, with `PORE_SATURATION` and `CLOGGER_WEIGHT`, only so
 * `__tests__/score-baseline.test.ts` can re-measure them against the live
 * catalogue rather than a copy of the numbers it is checking (#175).
 */
export const CONCERN_SATURATION: Record<Concern, number> = {
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
  // Estimated, not measured against the catalogue like its siblings above —
  // post-acne-marks is scored entirely by extending the hyperpigmentation
  // and redness rules in lib/rules.ts (no dedicated evidence of its own), so
  // this sits between those two saturation values rather than at a real
  // 75th-percentile figure. Revisit once the catalogue has enough
  // post-acne-marks-targeted formulas to measure properly.
  "post-acne-marks": 7,
};

const TYPE_SATURATION = 12;
export const PORE_SATURATION = 3;

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

/**
 * Irritants are judged harder the more reactive the user says they are.
 *
 * `unset` is spelled out rather than left to a `?? "none"` fallback (#183):
 * that fallback read "I don't know" as the most lenient answer, so not
 * answering scored better than "somewhat sensitive". An unset sensitivity is
 * judged at the middle setting, and `scoreExplanation` says so.
 */
const SENSITIVITY_MULTIPLIER: Record<NonNullable<SkinProfile["sensitivity"]> | "unset", number> = {
  none: 0.5,
  some: 1,
  unset: 1,
  high: 1.6,
};

/** Confidence-tier weight for a pore-clogging hit. Contested ones count zero. */
export const CLOGGER_WEIGHT: Record<CloggerHit["confidence"], number> = {
  high: 3,
  moderate: 1.8,
  contested: 0,
};

/**
 * Diminishing returns. A 60-ingredient list must not out-score a good
 * 20-ingredient one by sheer length.
 */
const saturate = (value: number, k: number) => value / (value + k);

/**
 * Below this there is genuinely nothing to read — not merely nothing to say.
 * Exported for "How scoring works" (`app/scoring.tsx`, #325), which says them.
 */
export const MIN_COVERAGE = 0.25;
export const MIN_IDENTIFIED = 3;

/**
 * The highest score a product with a hazard can get, and what each further
 * hazard takes off. Named for "How scoring works" (#325); unchanged.
 */
export const HAZARD_SCORE_CAP = 45;
export const HAZARD_EXTRA_PENALTY = 5;

/**
 * Whether a formula is genuinely unreadable, on its own — independent of
 * whether a profile is set.
 *
 * `matchProduct`'s own `unknownReason` can't answer this: `computeMatch`
 * checks `isPersonalized` first and refuses `"not_personalized"`
 * unconditionally before it ever reaches the coverage check below, so with no
 * profile set `unknownReason` is always `"not_personalized"`, never
 * `"low_coverage"` — regardless of how bad the read was. `app/label-result.tsx`
 * (#214) needs to tell "no profile yet" apart from "we can't score this at
 * all" so a first-time user photographing something unreadable gets a retake
 * prompt rather than a personalize prompt over junk OCR output. Exported
 * rather than duplicating `MIN_COVERAGE`/`MIN_IDENTIFIED` at the call site.
 */
export function isLowCoverage(ingredients: ProductWithIngredients["ingredients"]): boolean {
  const identified = ingredients.filter(isVerified).length;
  return identified < MIN_IDENTIFIED || formulaCoverage(ingredients) < MIN_COVERAGE;
}

/**
 * Scores already computed, keyed by the product object they describe.
 *
 * `matchProduct` is called at eight sites and memoised per component, so the
 * same product was re-scored by every screen that showed it — and two of those
 * sites (the saved shelf and the ingredient screen) had no memo at all and
 * re-scored their whole list on every render.
 *
 * **Keyed on the product object, not its id.** The id is stable across a
 * change to the formula underneath it, which is exactly the case that must
 * miss: a rescanned bottle whose ingredients were reformulated has the same id
 * and a different score. `data/catalogue-cache.ts` never mutates a product in
 * place — `addScannedToCatalogue` swaps a changed product for a new object
 * and leaves every other product's object (and so its cached score) alone,
 * and `rehydrate` builds fresh objects — so a changed product is always a new
 * object and a new key.
 * That invariant is what makes this safe; if a writer ever starts mutating a
 * product in place, this cache is what will serve the stale answer.
 *
 * **Weak, so it holds nothing alive.** Entries disappear with the products
 * they describe, which matters for 6b-4: an LRU that evicts products must not
 * leave their scores pinned in a Map forever.
 *
 * The profile object doubles as the version. `setProfile` and `toggleConcern`
 * both build a new profile rather than mutating, and `toggleConcern` returns
 * the existing state untouched when it refuses to exceed `MAX_CONCERNS` — so
 * identity changes exactly when the answer would.
 */
type ScoreCache = WeakMap<
  Pick<ProductWithIngredients, "type" | "ingredients">,
  { profile: SkinProfile; result: MatchResult }
>;

let scoreCache: ScoreCache = new WeakMap();

/**
 * Drops every cached score. For tests, which would otherwise carry one case's
 * result into the next whenever they reuse a product fixture.
 */
export function resetScoreCache(): void {
  // A WeakMap has no `clear`, so the map itself is replaced.
  scoreCache = new WeakMap();
}

export function matchProduct(
  product: Pick<ProductWithIngredients, "type" | "ingredients">,
  profile: SkinProfile
): MatchResult {
  const hit = scoreCache.get(product);
  // Identity, not deep equality: comparing two profiles field by field costs
  // more than the cheap half of the scoring it would save, and the store never
  // hands out an equal-but-different profile.
  if (hit && hit.profile === profile) return hit.result;

  const result = computeMatch(product, profile);

  // Handed to every screen that asks for this product, so one caller sorting
  // `reasons` in place would reorder the "Why" list on all of them — and only
  // after the first screen had rendered, which is the hardest kind of bug to
  // attribute. Nothing does that today; this is what keeps it that way, by
  // making the attempt throw where it is written rather than surfacing as a
  // wrong list somewhere else.
  //
  // Dev only: the guarantee is about catching a mistake while it is being
  // made, and freezing five objects per product is not worth paying for on a
  // user's phone. The arrays are frozen individually because `Object.freeze`
  // is shallow, and the arrays are the part anyone would be tempted to sort.
  if (__DEV__) {
    Object.freeze(result.warnings);
    Object.freeze(result.reasons);
    Object.freeze(result.factors);
    Object.freeze(result.breakdown);
    Object.freeze(result);
  }

  scoreCache.set(product, { profile, result });
  return result;
}

/**
 * The scoring itself. Pure — every input arrives as an argument, and the cache
 * above depends on that staying true.
 */
function computeMatch(
  product: Pick<ProductWithIngredients, "type" | "ingredients">,
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
    irritants: [],
    cloggersCharged: [],
    factors: [],
    coverage,
    confidence: 0,
    breakdown: { concernFit: null, typeFit: 50, irritationPenalty: 0, porePenalty: 0 },
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
  //
  // Two targets since #183, because harm and benefit read an unset
  // sensitivity differently: a harm to reactive skin is charged at the
  // middle setting (`treatAsReactive`), a benefit to it is never credited on
  // a non-answer (`isSensitive`). `targetApplies` is an OR across concerns,
  // skin type and sensitivity, so a single target would either miss every
  // rule whose only `hurts` key is `sensitive` (the AHA rule) or credit every
  // "soothing for sensitive skin" rule to someone who never said so.
  const harmTarget = { ...profile, sensitive: treatAsReactive(profile) };
  const benefitTarget = { ...profile, sensitive: isSensitive(profile) };
  const contact = contactWeight(product.type);

  const reasons: MatchReason[] = [];
  const concernEvidence = new Map<Concern, number>(profile.concerns.map((c) => [c, 0]));
  let typeEvidence = 0;
  let irritation = 0;
  let scored = 0;
  // Positions whose rule already charged a declared reactive-skin harm as
  // irritation, so the generic caution charge below does not bill them again.
  const reactiveCharged = new Set<number>();
  const irritants: string[] = [];

  // Computed once: an alphabetical tail (an OTC drug label) is read as
  // unordered rather than as a concentration ranking. See `positionWeights`.
  const positionFactors = positionWeights(product.ingredients.map((i) => i.name));

  product.ingredients.forEach((ingredient, position) => {
    // An unrecognised name supports no claim in either direction.
    if (!isVerified(ingredient)) return;
    const positionFactor = positionFactors[position];

    const rule = findRule(ingredient);
    if (rule) {
      const benefitWeight = rule.weight * positionFactor * contact.benefit;
      const harmWeight = rule.weight * positionFactor * contact.harm;
      const helps = targetApplies(rule.helps, benefitTarget);
      const hurts = targetApplies(rule.hurts, harmTarget);

      // `targetApplies` is an OR across concerns, skin type and sensitivity.
      // Track the paths that actually charge harm so a reason cannot claim
      // an uncounted downside. A rule's explicit sensitive-skin downside now
      // reaches irritation even if its category is "actives" (or salicylic
      // acid's "pore-clogging"), without treating every active as an irritant.
      const hurtsIrritantCategory = hurts && IRRITANT_CATEGORIES.has(rule.category);
      const hurtsReactiveSkin = hurts && rule.hurts?.sensitive === true && treatAsReactive(profile);
      const hurtsIrritation = hurtsIrritantCategory || hurtsReactiveSkin;
      // Deliberately NOT excluding pore-clogging/pore-led concerns here, even
      // though the concernEvidence loop below does. That exclusion exists so
      // `poreCloggingHits` (a separate detector, `lib/pore-clogging.ts`) and
      // this rule don't bill the same pore-led concern twice for overlapping
      // names like coconut oil or cocoa butter — it is not a claim that the
      // harm goes uncounted. It doesn't: `poreCloggingHits` scans every
      // ingredient unconditionally and its `poreLoad` feeds `poreSafety`,
      // which is 65% of every pore-led concern's fit, regardless of this
      // rule's own concernEvidence bump. The comment on that loop already
      // said as much — "the rule ... still supplies the sentence shown under
      // 'Why this score'" — `harmApplied` had drifted from it. Caught by
      // review on PR #127.
      const hurtsMatchedConcern =
        hurts && profile.concerns.some((concern) => rule.hurts?.concerns?.includes(concern));
      const hurtsMatchedSkinType =
        hurts && !!profile.baseSkinType && !!rule.hurts?.skinTypes?.includes(profile.baseSkinType);
      const harmApplied = hurtsIrritation || hurtsMatchedConcern || hurtsMatchedSkinType;

      // A rule can both help and hurt the same person — salicylic acid on
      // oily, sensitive skin. That is a genuine tension, not a bug, so both
      // are recorded and the net effect is what moves the score.
      let effect = 0;
      if (helps) effect += benefitWeight;
      if (harmApplied) effect -= harmWeight;

      for (const concern of profile.concerns) {
        if (rule.helps?.concerns?.includes(concern)) {
          bump(concernEvidence, concern, benefitWeight);
        }
        if (!rule.hurts?.concerns?.includes(concern)) continue;
        // `lib/pore-clogging.ts` owns clogging for the pore-led concerns, and
        // it already supplies 65% of their fit. The rules table names several
        // of the same ingredients (coconut oil, isopropyl myristate, cocoa
        // butter), so charging both counts one ingredient twice against the
        // same concern. The rule still contributes its skin-type effect and
        // still supplies the sentence shown under "Why this score" — it just
        // does not get to bill the concern a second time.
        if (rule.category === "pore-clogging" && PORE_LED_CONCERNS.includes(concern)) continue;
        bump(concernEvidence, concern, -harmWeight);
      }
      if (profile.baseSkinType) {
        if (rule.helps?.skinTypes?.includes(profile.baseSkinType)) typeEvidence += benefitWeight;
        if (rule.hurts?.skinTypes?.includes(profile.baseSkinType)) typeEvidence -= harmWeight;
      }
      if (rule.helps?.sensitive && isSensitive(profile)) {
        typeEvidence += benefitWeight * 0.6;
      }
      // A declared reactive-skin harm is an irritation risk, regardless of
      // the rule's benefit category. The OR charges it only once when an
      // ingredient is also in an irritant category; contact and INCI position
      // still determine the size of that single charge.
      if (hurtsIrritation) {
        irritation += harmWeight;
        irritants.push(ingredient.name);
      }
      if (hurtsReactiveSkin && !hurtsIrritantCategory) reactiveCharged.add(position);

      // Evidence is counted when the rule applied any signal, not when the net
      // effect is non-zero: a benefit that exactly equals its harm nets to zero
      // and shows no reason line, but it still moved the fit and the irritation
      // penalty, so confidence has to count it.
      if (helps || harmApplied) scored++;
      if (effect !== 0) {
        reasons.push({
          ingredient: ingredient.name,
          reason: rule.reason,
          category: rule.category,
          effect,
          source: rule.source,
        });
      }
      return;
    }

    // Layer 2. Only reached when no curated rule claims this ingredient, so a
    // named rule always wins and nothing is counted twice.
    for (const declared of ingredient.functions ?? []) {
      const signal = functionSignal(declared);
      if (!signal || !targetApplies(signal.helps, benefitTarget)) continue;
      const weight = signal.weight * positionFactor * contact.benefit;
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
  // skin reacts, or didn't say (#183) — the rules table names specific
  // sensitisers, this catches the EU-restricted ones it does not. An
  // ingredient whose rule already charged it as a reactive-skin irritant is
  // not charged again here. `contraindications` lists the same ingredients
  // on the same condition, so the count on screen and the charge agree.
  for (const [position, ingredient] of product.ingredients.entries()) {
    if (!isVerified(ingredient) || ingredient.safety !== "caution") continue;
    if (!treatAsReactive(profile)) continue;
    if (reactiveCharged.has(position)) continue;
    irritation += 2.5 * positionFactors[position] * contact.harm;
  }

  // Acne fit is "what is in here that clogs pores", not "does it contain acne
  // actives" — a plain gentle moisturiser is a good match for blemish-prone
  // skin precisely because it does nothing. Detection lives in
  // lib/pore-clogging.ts, which has no profile argument, no netting and no
  // truncation; this only decides how loudly it lands.
  const cloggers = poreCloggingHits(product.ingredients);
  const poreLed = profile.concerns.some((concern) => PORE_LED_CONCERNS.includes(concern));
  // Contested entries weigh nothing (`CLOGGER_WEIGHT`), so they charged nothing.
  const cloggersCharged = poreLed
    ? cloggers.filter((hit) => hit.confidence !== "contested").map((hit) => hit.name)
    : [];
  const poreLoad = cloggers.reduce(
    (sum, hit) =>
      sum + CLOGGER_WEIGHT[hit.confidence] * positionFactors[hit.position - 1] * contact.harm,
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
    // Cleanliness carries most of the answer, because for these concerns it
    // IS most of the answer. Weighted at 65% rather than the ~45% a first
    // pass used: the rules table used to charge cloggers to this concern as
    // well, and removing that double count (one ingredient, two debits) left
    // the honest single path too weak to separate a coconut-oil formula from
    // a clean one. Actives remain the other 35%, so a formula that actively
    // treats blemishes still outscores one that merely avoids harming.
    if (PORE_LED_CONCERNS.includes(concern)) return 0.65 * poreSafety + 0.35 * fromActives;
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

  // One point of weighted harm evidence now costs one score point. The old
  // Michaelis-Menten curve had no clinical basis and compressed a trace active
  // toward half the charge of a leading one. The cap remains a product-policy
  // guardrail; it is not presented as a medical threshold.
  const irritationPenalty = Math.min(
    MAX_IRRITATION_PENALTY,
    irritation * SENSITIVITY_MULTIPLIER[profile.sensitivity ?? "unset"]
  );
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
  if (hazards.length > 0) score = Math.min(score, HAZARD_SCORE_CAP) - (hazards.length - 1) * HAZARD_EXTRA_PENALTY;

  const finalScore = clamp(score);
  reasons.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  return {
    score: finalScore,
    verdict: verdictFor(finalScore, hazards.length),
    warnings,
    reasons,
    irritants,
    cloggersCharged,
    factors: buildFactors(reasons),
    coverage,
    confidence: confidenceFor(coverage, scored),
    breakdown: { concernFit, typeFit, irritationPenalty, porePenalty },
    ...(profile.sensitivity === null ? { sensitivityUnset: true as const } : {}),
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
function confidenceFor(coverage: number, scoredIngredients: number): number {
  return Math.max(0, Math.min(1, 0.55 * coverage + 0.45 * Math.min(1, scoredIngredients / 8)));
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
  // A pregnancy caution never changes score or verdict — an ingredient list
  // carries no concentration — but "Looks like a good fit" over a retinoid
  // caution reads as a contradiction (#187). Only excellent/good/fair get the
  // qualifier: poor is already cautionary and unknown has no verdict to
  // qualify. Says "pregnant or breastfeeding", like the section heading:
  // a breastfeeding profile gets the same hits, and "while pregnant" alone
  // made its caution read as not applying (#257 review).
  const pregnancyHits = result.warnings.filter((w) => w.origin === "pregnancy").length;

  switch (result.verdict) {
    case "excellent":
    case "good":
      return pregnancyHits > 0
        ? `Suits your skin — ${pregnancyHits === 1 ? "one thing" : `${pregnancyHits} things`} to check while pregnant or breastfeeding`
        : result.verdict === "excellent"
          ? "One of the better matches for your skin"
          : "Looks like a good fit for your skin";
    case "fair":
      return pregnancyHits > 0
        ? "Could work, and there's something to check while pregnant or breastfeeding"
        : "Could work, with a caveat or two";
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
          // True whether the quiz was skipped or answered "I don't know"
          // throughout (#291): both need a skin type or a concern to score.
          return "Add your skin type or a concern and we can tell you how this suits you";
      }
  }
}

/**
 * Three visual tones for the compact badges, derived from the same cutoffs as
 * `verdictFor` rather than from their own. Excellent and good share a tone —
 * a badge has one colour to spend and both are "yes".
 */
/**
 * The score explanation, in words — one line per thing that actually moved
 * the number, strongest first.
 *
 * Lives here rather than in the screen so the sentences and the arithmetic
 * cannot drift apart. The screen used to derive its own summary from category
 * labels, which meant it could name a direction but never a magnitude, and it
 * had no way to say which of two factors mattered more.
 */
export type ScoreLine = {
  label: string;
  detail: string;
  direction: "up" | "down";
  /** Where the line's claim comes from, when every warning behind it shares one (#347). */
  source?: RuleSource;
};

/** Beside the irritation charge when sensitivity isn't set (#183). */
export const SENSITIVITY_UNSET_NOTE =
  "We don't know how sensitive your skin is, so irritants are judged at the middle setting.";

export function scoreExplanation(result: MatchResult): ScoreLine[] {
  if (result.score === null) return [];
  const { concernFit, typeFit, irritationPenalty, porePenalty } = result.breakdown;
  const lines: (ScoreLine & { weight: number })[] = [];

  // A hazard is not part of the additive breakdown: it caps the finished
  // score instead. It still has to lead the explanation, or a formula can be
  // capped at Poor while its "why" list contains nothing but benefits.
  const hazards = result.warnings.filter((warning) => warning.severity === "hazard");
  if (hazards.length > 0) {
    // One link under the line, so only when it backs every name in it: an EU
    // prohibition says nothing about a pore rating that is also a hazard.
    const source = hazards[0].source;
    const shared = source && hazards.every((h) => h.source?.url === source.url) ? source : undefined;
    lines.push({
      ...(shared ? { source: shared } : {}),
      label: "Safety warning",
      detail:
        hazards.length === 1
          ? `${hazards[0].ingredient.name} is flagged as best avoided`
          : `${hazards.map((h) => h.ingredient.name).join(", ")} are flagged as best avoided`,
      direction: "down",
      weight: Number.POSITIVE_INFINITY,
    });
  }

  if (concernFit !== null) {
    const above = concernFit - 50;
    // Inside this dead zone there is too little movement to call the line
    // positive or negative — the old `>= 0` branch displayed neutral
    // evidence with a positive icon.
    if (Math.abs(above) > 8) {
      lines.push({
        label: "Your concerns",
        detail:
          above > 0
            ? "This formula works on what you asked about"
            : "This formula works against what you asked about",
        direction: above > 0 ? "up" : "down",
        weight: Math.abs(above) * 0.7,
      });
    } else {
      // Still said, never left out (#292, owner decision 26 Sep 2026): without
      // it a person who named concerns can't tell whether they were weighed
      // at all. `FOR_ME_MVP.md` §15 lists "does not strongly support a
      // selected concern" among the cautionary factors, hence `down`. Zero
      // weight so it sorts after anything that actually moved the number.
      lines.push({
        label: "Your concerns",
        detail: "Nothing here strongly targets what you asked about",
        direction: "down",
        weight: 0,
      });
    }
  }

  const typeAbove = typeFit - 50;
  if (Math.abs(typeAbove) > 4) {
    lines.push({
      label: "Your skin type",
      detail: typeAbove > 0 ? "Suits how your skin behaves" : "Not built for your skin type",
      direction: typeAbove > 0 ? "up" : "down",
      weight: Math.abs(typeAbove) * 0.3,
    });
  }

  if (irritationPenalty > 1) {
    lines.push({
      label: "Irritation risk",
      // The app's own state, never "you told us you're not sure" (#183): an
      // unset sensitivity is as often a quiz stopped at step one as it is
      // "I don't know", and quoting back an answer nobody gave is worse
      // than saying nothing.
      detail: result.sensitivityUnset
        ? `Contains ingredients that commonly cause reactions. ${SENSITIVITY_UNSET_NOTE}`
        : "Contains ingredients that commonly cause reactions",
      direction: "down",
      weight: irritationPenalty,
    });
  }

  if (porePenalty > 1) {
    lines.push({
      label: "Pore-clogging risk",
      detail: "Contains ingredients associated with congestion",
      direction: "down",
      weight: porePenalty,
    });
  }

  lines.sort((a, b) => b.weight - a.weight);

  // Explicit score-band contract:
  //   - Good/Excellent explanations lead with support for the verdict.
  //   - Poor explanations lead with what works against the verdict.
  //   - Fair remains an honest mixed middle, ordered by impact.
  // A score can cross a boundary through several small effects, so when no
  // single line clears the display threshold we add a truthful aggregate
  // line rather than inventing an ingredient claim.
  const requiredDirection =
    result.verdict === "good" || result.verdict === "excellent"
      ? "up"
      : result.verdict === "poor"
        ? "down"
        : null;

  if (requiredDirection) {
    // Only a line that moved the score can carry the verdict. The zero-weight
    // neutral concern line (#292) must not stand in for "There isn't enough
    // positive evidence" on a Poor score: it would blame concern fit for a
    // number concern fit didn't move.
    const matchingIndex = lines.findIndex((line) => line.direction === requiredDirection && line.weight > 0);
    if (matchingIndex > 0) {
      const [matching] = lines.splice(matchingIndex, 1);
      lines.unshift(matching);
    } else if (matchingIndex === -1) {
      lines.unshift({
        label: "Overall match",
        detail:
          requiredDirection === "up"
            ? `The combined evidence supports ${result.verdict === "excellent" ? "an excellent" : "a good"} match`
            : "There isn't enough positive evidence to make this a good match",
        direction: requiredDirection,
        weight: Number.POSITIVE_INFINITY,
      });
    }
  }

  return lines.map(({ label, detail, direction, source }) => (source ? { label, detail, direction, source } : { label, detail, direction }));
}

/**
 * How much to say about `confidence` on screen. Deliberately three words
 * rather than a percentage: the number is a heuristic, and showing "62%
 * confident" implies a precision it does not have.
 */
export function confidenceLabel(confidence: number): "high" | "moderate" | "low" {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "moderate";
  return "low";
}

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
  const shown = ingredients.slice(0, 2).map(displayIngredientName);
  if (ingredients.length === 1) return shown[0];
  if (ingredients.length === 2) return `${shown[0]} and ${shown[1]}`;
  return `${shown.join(", ")} and ${ingredients.length - 2} more`;
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
 * The four soft colour rungs an ingredient's word is drawn in. Which word a
 * row gets is `ingredientLabel` (`lib/ingredient-labels.ts`, #324), shared by
 * the ingredient list and the ingredient detail screen so the two cannot
 * drift apart — a second, independent derivation drifted before.
 */
type Rung = "good" | "watch" | "avoid" | "neutral";

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

/**
 * The detail screen's "#5 of 44 on the label - significant" line, or null when
 * the list's order says nothing about concentration there. An alphabetical tail
 * (`positionWeights`) is scored with one flat weight, so a concentration word
 * for a position inside it would contradict the score; only positions before
 * the tail get a note.
 */
export function positionNote(names: readonly string[], index: number): string | null {
  if (index < 0 || index >= names.length) return null;
  const tailStart = alphabeticalTailStart(names);
  if (tailStart !== null && index >= tailStart) return null;
  return `#${index + 1} of ${names.length} on the label - ${positionWeightLabel(index)}`;
}
