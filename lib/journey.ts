import type { BaseSkinType, Concern, Ingredient, Sensitivity, SkinProfile } from "@/data/types";
import { positionWeightLabel } from "@/lib/matching";
import { cloggerConfidence } from "@/lib/pore-clogging";
import { pregnancyCautionHits } from "@/lib/pregnancy-caution";
import { INGREDIENT_RULES, isActiveRule, nameMatches, ruleMatches, type IngredientRule, type RuleTarget } from "@/lib/rules";
import { holdsActive, optionsFor, type StoryActive } from "@/lib/skin-needs";
import { ACTIVES, type ActiveKey } from "@/lib/skin-needs-data";

/**
 * "Skin needs": the person picks one thing to work on today, and we show the
 * ingredient categories worth looking for, one card each, best first. A
 * product scanned from there gets its own answer, apart from the skin match
 * every other scan gets (owner, 2 October 2026): does it hold an active for
 * what was picked (`needVerdict`)? The skin match answers "does this suit my
 * skin", which called a product with nothing for pimples a good match for
 * them, because it had nothing that clogs pores either.
 *
 * It stands apart from the skin profile (owner, 2 October 2026): what someone
 * wants to work on this week is not what their skin is like all year, so
 * nothing here is read from the profile and nothing is written to it. The two
 * optional answers (sensitive skin, pregnant or breastfeeding) are asked
 * fresh each visit.
 *
 * The cards' copy is a draft that needs scientific review. Which cards a goal
 * gets, and in what order, is never that copy: it is read off
 * `INGREDIENT_RULES`, the same rules the score uses, so a card can't promise
 * more than the score credits. Each card cites its rules' source where they
 * have one.
 */

/**
 * An active as a scanned product's result and the routine builder see it:
 * read off `ACTIVES` (`lib/skin-needs-data.ts`), the one list of actives,
 * which also holds the Skin needs stories (owner, 3 October 2026).
 */
export type JourneyCard = {
  key: ActiveKey;
  name: string;
  line: string;
  /**
   * For a card whose `line` can't follow its own name in a sentence: what a
   * result says after the ingredients it found ("Glycerin + Panthenol put
   * water back in"). Without one, a result says the name and then the line.
   */
  found?: string;
  /**
   * Hydration, barrier and calming: what skin needs under any routine, not an
   * active for a goal. It counts toward a goal only where the goal is that
   * very thing (dry skin, the barrier, redness); elsewhere it is shown last,
   * as "Also helpful", and never counted.
   */
  support?: boolean;
  /** An acid or a retinoid: skin has to get used to it. */
  strong?: boolean;
  /** One of the four cards a skin profile's result is read against (`deckFor`). */
  core?: boolean;
  /** The ingredients it stands for; a product counts for the card when it has one their rules match. */
  names: string[];
};

// The records with a `result`, in the data file's order, which breaks ties
// between equally strong cards: salicylic acid sits ahead of niacinamide
// because for pores and oil it leads.
export const JOURNEY_CARDS: readonly JourneyCard[] = ACTIVES.flatMap((active) =>
  active.result
    ? [{ key: active.key, name: active.result.name ?? active.name, line: active.result.line, found: active.result.found, support: active.support, strong: active.strong, core: active.core, names: active.names }]
    : [],
);

const CARD = new Map<ActiveKey, JourneyCard>(JOURNEY_CARDS.map((card) => [card.key, card]));

/** The rules whose ingredients make a product count for this card. */
export function cardRules(card: JourneyCard): IngredientRule[] {
  return INGREDIENT_RULES.filter((rule) => card.names.some((name) => ruleMatches(rule, name)));
}

/** The concerns a card's rules say it helps. */
export function cardHelps(card: JourneyCard): Set<Concern> {
  return new Set(cardRules(card).flatMap((rule) => rule.helps?.concerns ?? []));
}

/** A card the pregnancy caution list names: the same list the score warns from. */
function pregnancyCaution(card: JourneyCard): boolean {
  return pregnancyCautionHits(card.names.map((name) => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true }))).length > 0;
}

type Role = "best" | "support" | "foundation" | "strong" | "helpful";


export type DeckCard = {
  card: JourneyCard;
  role: Role;
  /** What it is on the deck for, as a chip ("Pimples"). Only a Skin needs deck has one. */
  helps?: string;
  /** A line on the card's front when the pregnancy question was left unanswered. */
  caution?: string;
  /** On a Skin needs deck: whether a scanned product is checked for it. An "Also helpful" card is not. */
  counts?: boolean;
};

// ── The goals ────────────────────────────────────────────────────────────────

export type GoalKey =
  | "pimples"
  | "blackheads"
  | "red-marks"
  | "dark-marks"
  | "dark-spots"
  | "redness"
  | "hydrate"
  | "dull"
  | "lines"
  | "eczema"
  | "oil"
  | "texture"
  | "barrier";

type Goal = {
  key: GoalKey;
  /** The choice, as an action ("Clear pimples"). */
  label: string;
  /** The same inside a sentence ("to clear pimples"). */
  phrase: string;
  /** On a card's chip. */
  short: string;
  /** What it is about, for a scan's answer ("Works on pimples", "Not made for dull skin"). */
  noun: string;
  /** The goal is itself hydration, the barrier or calm skin, so the support cards are its actives. */
  supportCounts?: boolean;
  /** Pores are the point of it: a strong pore-clogger in the product works against the very thing picked. */
  pores?: boolean;
  /** Which rules work on it; a card's strength is its heaviest such rule. */
  test: (helps: RuleTarget) => boolean;
  /** Cards that only help something close to it, shown after the rest, with the chip they get. */
  also?: { short: string; test: (helps: RuleTarget) => boolean };
  /** Hand-picked cards, for the one goal the rules have no word for. */
  cards?: ActiveKey[];
  /** The skin a scan from here is checked for warnings as (pore-cloggers, irritants). */
  score: { concerns: Concern[]; baseSkinType?: BaseSkinType; sensitive?: boolean };
};

const has = (concern: Concern) => (helps: RuleTarget) => helps.concerns?.includes(concern) ?? false;
const type = (skinType: BaseSkinType) => (helps: RuleTarget) => helps.skinTypes?.includes(skinType) ?? false;

export const GOALS: readonly Goal[] = [
  { key: "pimples", label: "Clear pimples", phrase: "clear pimples", short: "Pimples", noun: "pimples", pores: true, test: has("acne-prone"), score: { concerns: ["acne-prone"] } },
  { key: "blackheads", label: "Unclog pores", phrase: "unclog blackheads and pores", short: "Pores", noun: "clogged pores", pores: true, test: has("large-pores"), score: { concerns: ["large-pores"] } },
  {
    key: "red-marks",
    label: "Fade red marks",
    phrase: "fade red marks",
    short: "Red marks",
    noun: "red marks",
    // The rules have one concern for both kinds of mark; the red kind is the part of it that also works on redness.
    test: (helps) => has("post-acne-marks")(helps) && has("redness")(helps),
    also: { short: "Redness", test: has("redness") },
    score: { concerns: ["redness"] },
  },
  {
    key: "dark-marks",
    label: "Fade dark marks",
    phrase: "fade dark marks",
    short: "Dark marks",
    noun: "dark marks",
    test: (helps) => has("post-acne-marks")(helps) && has("hyperpigmentation")(helps),
    score: { concerns: ["post-acne-marks"] },
  },
  { key: "dark-spots", label: "Even skin tone", phrase: "even out skin tone", short: "Skin tone", noun: "uneven skin tone", test: has("hyperpigmentation"), score: { concerns: ["hyperpigmentation"] } },
  { key: "redness", label: "Calm redness", phrase: "calm redness", short: "Redness", noun: "redness", supportCounts: true, test: has("redness"), score: { concerns: ["redness"] } },
  {
    key: "hydrate",
    label: "Hydrate dry skin",
    phrase: "hydrate dry skin",
    short: "Hydration",
    noun: "dry skin",
    supportCounts: true,
    test: (helps) => has("dehydrated")(helps) || type("dry")(helps),
    score: { concerns: ["dehydrated"], baseSkinType: "dry" },
  },
  { key: "dull", label: "Brighten dull skin", phrase: "brighten dull skin", short: "Dullness", noun: "dull skin", test: has("dullness"), score: { concerns: ["dullness"] } },
  { key: "lines", label: "Lines and wrinkles", phrase: "smooth fine lines", short: "Lines", noun: "lines and wrinkles", test: has("fine-lines"), score: { concerns: ["fine-lines"] } },
  { key: "eczema", label: "Care for eczema-prone skin", phrase: "care for eczema-prone skin", short: "Eczema-prone", noun: "eczema-prone skin", supportCounts: true, test: has("atopic"), score: { concerns: ["atopic"] } },
  { key: "oil", label: "Control oil", phrase: "control oil and shine", short: "Oil", noun: "oily skin", pores: true, test: type("oily"), score: { concerns: [], baseSkinType: "oily" } },
  {
    key: "texture",
    label: "Smooth rough texture",
    phrase: "smooth rough texture",
    short: "Texture",
    noun: "rough texture",
    // No rule is tagged for texture, so these are picked by hand, and a scan
    // is checked for warnings as the two concerns nearest to it. Tagging the
    // rules would change every product's score, which is the owner's decision
    // to make.
    test: () => false,
    cards: ["aha", "bha", "retinoids"],
    score: { concerns: ["dullness", "large-pores"] },
  },
  {
    key: "barrier",
    // "Support", not "repair": docs/claims-policy.md.
    label: "Support skin barrier",
    phrase: "support your skin barrier",
    short: "Barrier",
    noun: "a weak skin barrier",
    supportCounts: true,
    test: (helps) => helps.sensitive === true && (type("dry")(helps) || has("atopic")(helps)),
    also: { short: "Dry skin", test: (helps) => type("dry")(helps) || has("dehydrated")(helps) },
    score: { concerns: [], baseSkinType: "dry", sensitive: true },
  },
];

const GOAL: Record<GoalKey, Goal> = Object.fromEntries(GOALS.map((goal) => [goal.key, goal])) as Record<GoalKey, Goal>;

/** The most cards one goal shows (owner). */
export const DECK_MAX = 5;

/**
 * What someone told Skin needs today. The two optional answers are `null` when
 * skipped; `uses` is the actives they said they already use (none when not given).
 */
export type Need = { goal: GoalKey; sensitivity: Sensitivity | null; pregnant: boolean | null; uses?: readonly ActiveKey[] };

export const PREGNANCY_LINE = "Commonly advised against while pregnant or breastfeeding.";


/** How strongly a card works on something: its heaviest rule that passes. */
function strength(card: JourneyCard, test: (helps: RuleTarget) => boolean): number {
  return Math.max(0, ...cardRules(card).map((rule) => (rule.helps && test(rule.helps) ? rule.weight : 0)));
}

/**
 * The cards for a goal, five at most: its actives best first, then the
 * support cards as "Also helpful". Pregnant or breastfeeding drops the cards
 * the pregnancy caution list names; unanswered, they stay and say so. Very
 * sensitive skin gets the gentle actives before the strong ones.
 */
export function needDeck(need: Need): DeckCard[] {
  const goal = GOAL[need.goal];
  const allowed = JOURNEY_CARDS.filter((card) => !(need.pregnant === true && pregnancyCaution(card)));
  const ranked = (test: (helps: RuleTarget) => boolean) =>
    allowed
      .map((card, order) => ({ card, order, weight: strength(card, test) }))
      .filter(({ weight }) => weight > 0)
      .sort((a, b) => b.weight - a.weight || a.order - b.order)
      .map(({ card }) => card);
  const main = goal.cards ? goal.cards.flatMap((key) => CARD.get(key) ?? []).filter((card) => allowed.includes(card)) : ranked(goal.test);
  let actives = main.filter((card) => goal.supportCounts || !card.support);
  if (need.sensitivity === "high") actives = [...actives.filter((card) => !card.strong), ...actives.filter((card) => card.strong)];
  const extra = goal.also ? ranked(goal.also.test).filter((card) => !main.includes(card)) : [];
  const helpful = [...main.filter((card) => !actives.includes(card)), ...extra];
  // One place is kept for an "Also helpful" card where there is one.
  const shown = [...actives.slice(0, helpful.length > 0 ? DECK_MAX - 1 : DECK_MAX), ...helpful].slice(0, DECK_MAX);

  return shown.map((card, index) => {
    const counts = actives.includes(card);
    return {
      card,
      role: !counts ? "helpful" : index === 0 ? "best" : card.strong ? "strong" : card.key === "hydrating" ? "foundation" : "support",
      helps: counts ? goal.short : extra.includes(card) ? goal.also?.short : undefined,
      caution: need.pregnant === null && pregnancyCaution(card) ? PREGNANCY_LINE : undefined,
      counts,
    };
  });
}

/**
 * The skin a scan from Skin needs is checked for warnings as (pore-cloggers,
 * irritants, the pregnancy caution): today's goal and the two optional
 * answers, and nothing from the saved skin profile. Its score is not shown:
 * `needVerdict` is the answer on that path.
 */
export function needProfile(need: Need): SkinProfile {
  const { score } = GOAL[need.goal];
  return {
    concerns: score.concerns,
    baseSkinType: score.baseSkinType ?? null,
    sensitivity: need.sensitivity ?? (score.sensitive ? "some" : null),
    pregnancyStatus: need.pregnant === null ? null : need.pregnant ? "pregnant" : "neither",
  };
}

/** A need travels through the scanner to the result as one route param. */
export function encodeNeed(need: Need): string {
  const parts = [need.goal, need.sensitivity ?? "", need.pregnant === null ? "" : need.pregnant ? "yes" : "no"];
  return (need.uses?.length ? [...parts, need.uses.join("+")] : parts).join(".");
}

const SENSITIVITIES: readonly Sensitivity[] = ["none", "some", "high"];

/** `null` for anything that isn't a need: nothing else in a link is taken on trust. */
export function decodeNeed(param: string | string[] | undefined): Need | null {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw) return null;
  const [goal, sensitivity, pregnant, list = ""] = raw.split(".");
  if (!GOALS.some((g) => g.key === goal)) return null;
  const uses = list.split("+").filter((key): key is ActiveKey => ACTIVES.some((active) => active.key === key));
  return {
    goal: goal as GoalKey,
    sensitivity: SENSITIVITIES.find((s) => s === sensitivity) ?? null,
    pregnant: pregnant === "yes" ? true : pregnant === "no" ? false : null,
    ...(uses.length > 0 ? { uses } : {}),
  };
}

// ── The plan a result is read against ────────────────────────────────────────

/** The concerns a skin profile's result counts recommendations for. */
export const PLAN_CONCERNS: readonly Concern[] = ["acne-prone", "post-acne-marks", "dehydrated", "redness", "large-pores", "fine-lines", "dullness", "hyperpigmentation"];

/**
 * The cards a skin profile's own result is read against: the four core cards,
 * best first. A card stays only if its rules help at least one of the
 * concerns, except hydrating basics, which every routine builds on. Retinoids
 * are left out while pregnant or breastfeeding, the same caution the score
 * applies. Ties keep the cards' order.
 */
export function deckFor(concerns: readonly Concern[], profile: Pick<SkinProfile, "pregnancyStatus">): DeckCard[] {
  const pregnant = profile.pregnancyStatus === "pregnant" || profile.pregnancyStatus === "breastfeeding";
  const scored = JOURNEY_CARDS.filter((card) => card.core && !(pregnant && card.key === "retinoids"))
    .map((card, order) => ({ card, order, hits: concerns.filter((c) => cardHelps(card).has(c)).length }))
    .filter(({ card, hits }) => hits > 0 || card.key === "hydrating")
    .sort((a, b) => b.hits - a.hits || a.order - b.order);
  let bestTaken = false;
  return scored.map(({ card, hits }) => {
    if (card.key === "hydrating") return { card, role: "foundation" };
    if (card.key === "retinoids") return { card, role: "strong" };
    if (!bestTaken && hits > 0) {
      bestTaken = true;
      return { card, role: "best" };
    }
    return { card, role: "support" };
  });
}

export type PlanFit = {
  /** Deck cards the product has an ingredient for, in deck order, with every ingredient that counted. */
  covered: { card: JourneyCard; role: Role; ingredients: string[] }[];
  total: number;
  /** Chosen concerns none of the covered cards helps. */
  notCovered: Concern[];
};

/** How a product fits the plan: which cards its ingredients count for. */
export function planFit(ingredients: readonly Pick<Ingredient, "name">[], deck: readonly DeckCard[], concerns: readonly Concern[]): PlanFit {
  const covered = deck.flatMap(({ card, role }) => {
    const rules = cardRules(card);
    const hits = ingredients.filter((ingredient) => rules.some((rule) => ruleMatches(rule, ingredient.name))).map((i) => i.name);
    return hits.length > 0 ? [{ card, role, ingredients: hits }] : [];
  });
  const helped = new Set(covered.flatMap(({ card }) => [...cardHelps(card)]));
  return { covered, total: deck.length, notCovered: concerns.filter((c) => !helped.has(c)) };
}

// ── A scan from Skin needs ───────────────────────────────────────────────────

/** Whether a rule works on a goal at all, counted or not. */
function worksOn(goal: Goal, rule: IngredientRule): boolean {
  if (goal.cards) return goal.cards.some((key) => { const card = CARD.get(key); return card !== undefined && cardRules(card).includes(rule); });
  return !!rule.helps && goal.test(rule.helps);
}

/** Whether a rule is an active for a goal: it works on it, and is not mere support there. */
function countsFor(goal: Goal, rule: IngredientRule): boolean {
  return worksOn(goal, rule) && (goal.supportCounts || isActiveRule(rule));
}

// A product "works on" a goal when its strongest active for it is at least
// this share of the strongest active there is for it; under that it "helps a
// little". Benzoyl peroxide leads pimples at 12, so azelaic acid (9) works and
// tea tree oil (7) helps a little.
const WORKS_SHARE = 0.7;

/** A rule that only names what the pregnancy caution list names: retinoids, salicylic acid. */
function pregnancyOnly(rule: IngredientRule): boolean {
  return JOURNEY_CARDS.some((card) => pregnancyCaution(card) && cardRules(card).includes(rule));
}

/**
 * The strongest active there is for a goal, for this person: while pregnant
 * or breastfeeding the actives we leave off the deck are not the yardstick
 * either, or bakuchiol, which we suggest in place of retinoids, could only
 * ever "help a little" against them.
 */
function strongest(goal: Goal, pregnant: boolean): number {
  return Math.max(0, ...INGREDIENT_RULES.filter((rule) => countsFor(goal, rule) && !(pregnant && pregnancyOnly(rule))).map((rule) => rule.weight));
}

type Hit = { ingredient: string; rule: IngredientRule; trace: boolean };

/**
 * Each ingredient with the rule that names it: the first match, as the score
 * takes it. `trace` is the stretch of a label the app already calls a trace
 * (`positionWeightLabel`): order is free below 1%, so an active that far down
 * may be there in name only.
 */
function ruleHits(ingredients: readonly Pick<Ingredient, "name">[]): Hit[] {
  return ingredients.flatMap(({ name }, index) => {
    const rule = INGREDIENT_RULES.find((candidate) => ruleMatches(candidate, name));
    return rule ? [{ ingredient: name, rule, trace: positionWeightLabel(index) === "trace" }] : [];
  });
}

export type NeedLevel = "works" | "little" | "none";

/**
 * One thing found in the product: a card and the ingredients that counted for
 * it, or a lone ingredient with its rule's sentence. `line` is what follows
 * the ingredients for an active the carousel showed that no card stands for
 * ("(SPF): it sends back the rays that mark and age skin.").
 */
type NeedFinding = { card: JourneyCard | null; ingredients: string[]; reason: string; trace: boolean; line?: string };

export type NeedVerdict = {
  level: NeedLevel;
  /** "Works on pimples", "Helps a little with pimples", "Not made for pimples". */
  headline: string;
  /** How many of the actives on the deck it has, or that it has none. */
  line: string;
  /** Its actives for the goal, strongest first. */
  actives: NeedFinding[];
  /** The deck's actives it does not have, by name, for "it has none of…". */
  missing: string[];
  /** Support it has for the goal, said once and never counted. */
  helpful: string[];
  /** When it does not work on the goal: up to two goals its actives do work on. */
  betterFor: { label: string; ingredients: string[] }[];
  /** It has an active for a pores goal and a strong pore-clogger too, which is why it only "helps a little". */
  clogged: boolean;
};

const HEADLINE: Record<NeedLevel, (noun: string) => string> = {
  works: (noun) => `Works on ${noun}`,
  little: (noun) => `Helps a little with ${noun}`,
  none: (noun) => `Not made for ${noun}`,
};

/** How well these hits work on a goal. An active down in the trace stretch can help a little, never more. */
function levelFor(goal: Goal, hits: readonly Hit[], pregnant = false): NeedLevel {
  const counted = hits.filter((hit) => countsFor(goal, hit.rule));
  if (counted.length === 0) return "none";
  const best = Math.max(0, ...counted.filter((hit) => !hit.trace).map((hit) => hit.rule.weight));
  return best >= WORKS_SHARE * strongest(goal, pregnant) ? "works" : "little";
}

/**
 * The answer for a scan opened from Skin needs: does the product hold an
 * active for what was picked? Only actives count. Hydration, barrier and
 * calming count where the goal is one of those, and are otherwise named once
 * as support. It reads the label's names against the same rules the score
 * uses. It cannot know how much of each is in the bottle; the one thing the
 * label does say is used: an active in the trace stretch helps a little at
 * most. Where pores are the point, a strong pore-clogger caps it there too.
 */
export function needVerdict(ingredients: readonly Pick<Ingredient, "name">[], need: Need): NeedVerdict {
  const goal = GOAL[need.goal];
  const hits = ruleHits(ingredients);
  const counted = hits.filter((hit) => countsFor(goal, hit.rule)).sort((a, b) => b.rule.weight - a.rule.weight);
  const rulesLevel = levelFor(goal, hits, need.pregnant === true);
  // Only the name is read, so a bare name is enough.
  // One finding per card, or per ingredient where no card stands for it.
  const actives: NeedFinding[] = [];
  for (const hit of counted) {
    const card = JOURNEY_CARDS.find((candidate) => cardRules(candidate).includes(hit.rule)) ?? null;
    const same = actives.find((finding) => (card ? finding.card === card : finding.reason === hit.rule.reason));
    if (same) {
      same.ingredients.push(hit.ingredient);
      same.trace = same.trace && hit.trace;
    } else actives.push({ card, ingredients: [hit.ingredient], reason: hit.rule.reason, trace: hit.trace });
  }

  // What the Skin needs carousel showed for this pick (owner, 3 October
  // 2026): a product holding one of those works on the goal, whatever the
  // scoring rules say of it (a sunscreen for lines), and the line below
  // counts against them, not against a list the person never saw. Not the
  // actives they already use: the carousel passes over those for something
  // new, but a product holding one still works on the goal.
  const suggested = optionsFor({ goal: need.goal, sensitivity: need.sensitivity, pregnancy: need.pregnant === null ? null : need.pregnant ? "yes" : "no" }).actives;
  const covers = (active: StoryActive) => holdsActive(ingredients, active) || actives.some((finding) => finding.card?.key === active.key && !finding.trace);
  for (const active of suggested) {
    if (actives.some((finding) => finding.card?.key === active.key)) continue;
    const named = ingredients
      .filter(({ name }, index) => positionWeightLabel(index) !== "trace" && nameMatches(active.match ?? active.names, name))
      .map(({ name }) => name)
      .filter((name) => !actives.some((finding) => finding.ingredients.includes(name)));
    if (named.length > 0) actives.push({ card: null, ingredients: named, reason: active.story.why.line, line: `(${active.name}): ${lowerFirst(active.story.why.line)}`, trace: false });
  }
  const shown = suggested.filter(covers);
  const found: NeedLevel = shown.length > 0 ? "works" : rulesLevel;
  // Only the name is read, so a bare name is enough.
  const clogged = !!goal.pores && found !== "none" && ingredients.some(({ name }) => cloggerConfidence({ name } as Ingredient) === "high");
  const level: NeedLevel = clogged ? "little" : found;

  const covered = shown.length;
  const has =
    covered === 0
      ? "It has an active for this, though not one of our top picks."
      : suggested.length === 1
        ? `It has the active we suggest to ${goal.phrase}.`
        : `It has ${covered} of the ${suggested.length} actives we suggest to ${goal.phrase}.`;
  const line = level === "none" ? `It has none of the actives we suggest to ${goal.phrase}.` : clogged ? `${has} It also has an ingredient that can clog pores.` : has;

  const helpful = hits.filter((hit) => worksOn(goal, hit.rule) && !countsFor(goal, hit.rule)).map((hit) => hit.ingredient);

  // Elsewhere only true actives are counted, or glycerin would make every product "better for" dry skin.
  const active = hits.filter((hit) => isActiveRule(hit.rule));
  const betterFor: { label: string; ingredients: string[] }[] = [];
  if (level !== "works") {
    const others = GOALS.filter((other) => other !== goal && levelFor({ ...other, supportCounts: false }, active) === "works")
      .map((other) => {
        const mine = active.filter((hit) => worksOn(other, hit.rule));
        return { label: other.label, ingredients: mine.map((hit) => hit.ingredient), weight: mine.reduce((sum, hit) => sum + hit.rule.weight, 0) };
      })
      .sort((a, b) => b.weight - a.weight);
    for (const other of others) {
      // Two goals met by the very same actives (dark marks, uneven tone) say the same thing twice: the first stands.
      if (betterFor.length === 2 || betterFor.some((kept) => kept.ingredients.join() === other.ingredients.join())) continue;
      betterFor.push({ label: other.label, ingredients: other.ingredients });
    }
  }

  return {
    level,
    headline: HEADLINE[level](goal.noun),
    line,
    actives,
    missing: suggested.filter((active) => !covers(active)).map((active) => active.name),
    helpful,
    betterFor,
    clogged,
  };
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** Every headline a scan can show, for the claims audit. */
export function needHeadlines(): string[] {
  return GOALS.flatMap((goal) => (["works", "little", "none"] as const).map((level) => HEADLINE[level](goal.noun)));
}
