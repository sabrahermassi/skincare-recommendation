import type { BaseSkinType, Concern, Ingredient, Sensitivity, SkinProfile } from "@/data/types";
import { pregnancyCautionHits } from "@/lib/pregnancy-caution";
import { INGREDIENT_RULES, ruleMatches, type IngredientRule, type RuleSource, type RuleTarget } from "@/lib/rules";

/**
 * "Skin needs": the person picks one thing to work on today, and we show the
 * ingredient categories worth looking for, one card each, best first. A
 * product scanned from there is then read against those cards ("It has 2 of
 * the 5 ingredients we suggest").
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

export type Tint = "rose" | "sage" | "blue" | "butter";

export type CardKey =
  | "azelaic"
  | "niacinamide"
  | "hydrating"
  | "retinoids"
  | "tranexamic"
  | "vitamin-c"
  | "aha"
  | "bha"
  | "benzoyl"
  | "bakuchiol"
  | "peptides"
  | "ceramides"
  | "calming"
  | "zinc-clay"
  | "emollients";

export type JourneyCard = {
  key: CardKey;
  name: string;
  tint: Tint;
  line: string;
  whyYou: string;
  howToStart: string;
  watchFor: string;
  whenShopping: string;
  /**
   * For a card whose `line` can't follow its own name in a sentence: what a
   * result says after the ingredients it found ("Glycerin + Panthenol put
   * water back in"). Without one, a result says the name and then the line.
   */
  found?: string;
  /** An acid or a retinoid: skin has to get used to it. */
  strong?: boolean;
  /** One of the four cards a skin profile's result is read against (`deckFor`). */
  core?: boolean;
  /** The ingredients it stands for; a product counts for the card when it has one their rules match. */
  names: string[];
};

// The four core cards are the hand-off's; the rest were added with the goals
// (owner, 2 October 2026). The order breaks ties between equally strong cards,
// which is why salicylic acid sits ahead of niacinamide: for pores and oil it leads.
export const JOURNEY_CARDS: readonly JourneyCard[] = [
  {
    key: "azelaic",
    name: "Azelaic acid",
    tint: "rose",
    core: true,
    line: "Calms breakouts and helps with the marks they leave.",
    whyYou: "Targets acne and marks, and suits sensitive skin.",
    howToStart: "Slowly, a few times a week, then more if it feels fine.",
    watchFor: "Can feel tingly or drying at first.",
    whenShopping: "Leave-on, often around 10%, without other strong acids.",
    names: ["azelaic acid"],
  },
  {
    key: "bha",
    name: "Salicylic acid",
    tint: "sage",
    strong: true,
    line: "Gets inside pores and clears out what blocks them.",
    whyYou: "Made for blackheads, clogged pores and oily skin.",
    howToStart: "Two or three times a week, on the areas that clog.",
    watchFor: "Drying on dry or sensitive skin.",
    whenShopping: "A leave-on at up to 2%; a wash is gentler but does less.",
    names: ["salicylic acid"],
  },
  {
    key: "niacinamide",
    name: "Niacinamide",
    tint: "sage",
    core: true,
    line: "Helps with oil balance, supports your skin barrier and can fade marks.",
    whyYou: "Supports your barrier and oil balance, and helps marks fade over time.",
    howToStart: "Once a day, morning or evening. Most skin tolerates it well.",
    watchFor: "Very high strengths can cause flushing in some people.",
    whenShopping: "A serum or moisturiser; it doesn't need to be very strong.",
    names: ["niacinamide"],
  },
  {
    key: "hydrating",
    name: "Hydrating basics",
    tint: "blue",
    core: true,
    // Panthenol and ceramides were on this card until they got cards of their own (calming, ceramides).
    line: "Glycerin, hyaluronic acid and urea draw water in and hold it there.",
    found: "put water back in and help keep it there.",
    whyYou: "Dehydrated skin copes less well with other actives, so this comes first.",
    howToStart: "Morning and evening, after cleansing.",
    watchFor: "Heavy oils can clog acne-prone skin.",
    whenShopping: "Look for glycerin or hyaluronic acid in a light texture.",
    names: ["glycerin", "sodium hyaluronate", "urea"],
  },
  {
    key: "retinoids",
    name: "Retinoids",
    tint: "butter",
    core: true,
    strong: true,
    line: "Strong evidence for acne, lines and texture, with a learning curve.",
    whyYou: "Powerful for acne and texture over time.",
    howToStart: "Twice a week at night, in the gentlest form.",
    watchFor: "Dryness and peeling at first. Sunscreen every day.",
    whenShopping: "A gentle retinol in a moisturising base.",
    names: ["retinol"],
  },
  {
    key: "tranexamic",
    name: "Tranexamic acid",
    tint: "rose",
    line: "With arbutin and kojic acid, it works on uneven tone and dark marks.",
    found: "can work on uneven tone and dark marks.",
    whyYou: "Made for dark marks, and gentler than acids.",
    howToStart: "Once a day, after cleansing. Give it two or three months.",
    watchFor: "Marks come back without sunscreen every day.",
    whenShopping: "A serum naming tranexamic acid, alpha-arbutin or kojic acid.",
    names: ["tranexamic acid"],
  },
  {
    key: "vitamin-c",
    name: "Vitamin C",
    tint: "butter",
    line: "An antioxidant that brightens and evens out skin tone.",
    found: "can brighten and even out skin tone.",
    whyYou: "Works on dullness and dark marks at the same time.",
    howToStart: "In the morning, under moisturiser and sunscreen.",
    watchFor: "Strong formulas can sting. It goes off once it turns dark orange.",
    whenShopping: "A serum in a dark or airless bottle.",
    names: ["ascorbic acid", "3-o-ethyl ascorbic acid"],
  },
  {
    key: "aha",
    name: "AHAs",
    tint: "rose",
    strong: true,
    line: "Glycolic and lactic acid lift away dead skin, for a smoother, brighter surface.",
    found: "can lift away dead skin, for a smoother, brighter surface.",
    whyYou: "Works on the surface: dullness, rough patches and marks.",
    howToStart: "Once or twice a week at night, then more if it feels fine.",
    watchFor: "Stinging and dryness. Skin burns more easily in the sun.",
    whenShopping: "Lactic acid is the gentler one; glycolic acid is the stronger one.",
    names: ["glycolic acid"],
  },
  {
    key: "benzoyl",
    name: "Benzoyl peroxide",
    tint: "blue",
    strong: true,
    line: "One of the most studied ingredients for red, inflamed pimples.",
    found: "is one of the most studied ingredients for red, inflamed pimples.",
    whyYou: "Works on the pimples themselves, not only the pores.",
    howToStart: "A thin layer once a day, on the areas that break out.",
    watchFor: "Dryness and peeling. It bleaches towels and pillowcases.",
    whenShopping: "A low strength is gentler and a good place to start.",
    names: ["benzoyl peroxide"],
  },
  {
    key: "bakuchiol",
    name: "Bakuchiol",
    tint: "sage",
    line: "A plant ingredient that smooths like retinol, with far less irritation.",
    found: "can smooth like retinol, with far less irritation.",
    whyYou: "The gentle choice when retinoids are too much, or not an option.",
    howToStart: "Once a day, morning or evening.",
    watchFor: "Less studied than retinoids, and not studied in pregnancy.",
    whenShopping: "A serum or cream that names bakuchiol high on the list.",
    names: ["bakuchiol"],
  },
  {
    key: "peptides",
    name: "Peptides",
    tint: "blue",
    line: "Small proteins that help skin look firmer and smoother.",
    found: "can help skin look firmer and smoother.",
    whyYou: "A gentle way to work on fine lines.",
    howToStart: "Once or twice a day. They sit well with most other ingredients.",
    watchFor: "The evidence is thinner than for retinoids, and results are slow.",
    whenShopping: "A leave-on serum or cream; a wash rinses them away.",
    names: ["palmitoyl tripeptide-1"],
  },
  {
    key: "ceramides",
    name: "Ceramides",
    tint: "butter",
    line: "The fats your skin barrier is made of, put back from the outside.",
    found: "can top up the fats your skin barrier is made of.",
    whyYou: "Supports a dry or easily upset barrier.",
    howToStart: "Morning and evening, in your moisturiser.",
    watchFor: "Rich creams can feel heavy on oily skin.",
    whenShopping: "A moisturiser with ceramides, cholesterol and fatty acids together.",
    names: ["ceramide np", "cholesterol"],
  },
  {
    key: "calming",
    name: "Calming ingredients",
    tint: "sage",
    line: "Centella, panthenol, oat and allantoin calm the look of redness and keep skin comfortable.",
    found: "can calm the look of redness and keep skin comfortable.",
    whyYou: "Gentle enough for skin that reacts easily.",
    howToStart: "Any time, morning or evening.",
    watchFor: "Check the rest of the formula: fragrance undoes the point.",
    whenShopping: "A fragrance-free cream or serum naming one of them near the top.",
    names: ["centella asiatica extract", "panthenol", "colloidal oatmeal", "allantoin", "bisabolol", "beta-glucan"],
  },
  {
    key: "zinc-clay",
    name: "Zinc and clay",
    tint: "blue",
    line: "Zinc helps moderate oil, and clay soaks it up from the surface.",
    found: "can help with oil and shine.",
    whyYou: "A mild way to take down oil and shine.",
    howToStart: "Zinc daily in a serum; a clay mask once a week.",
    watchFor: "Clay left on too long dries skin out.",
    whenShopping: "Zinc PCA in a light serum, or a kaolin mask.",
    names: ["zinc pca", "kaolin"],
  },
  {
    key: "emollients",
    name: "Squalane and shea",
    tint: "butter",
    line: "Soften dry skin and slow the water leaving it.",
    found: "can soften dry skin and slow the water leaving it.",
    whyYou: "Dry skin needs oils as well as water.",
    howToStart: "As the last step, over your other products.",
    watchFor: "Shea butter can feel heavy if you break out easily.",
    whenShopping: "Squalane is the light one; shea butter is the rich one.",
    names: ["squalane", "shea butter"],
  },
];

const CARD: Record<CardKey, JourneyCard> = Object.fromEntries(JOURNEY_CARDS.map((card) => [card.key, card])) as Record<CardKey, JourneyCard>;

/** The rules whose ingredients make a product count for this card. */
export function cardRules(card: JourneyCard): IngredientRule[] {
  return INGREDIENT_RULES.filter((rule) => card.names.some((name) => ruleMatches(rule, name)));
}

/** The concerns a card's rules say it helps. */
export function cardHelps(card: JourneyCard): Set<Concern> {
  return new Set(cardRules(card).flatMap((rule) => rule.helps?.concerns ?? []));
}

/** Where to read about a card: its first rule with a source. */
export function cardSource(card: JourneyCard): RuleSource | null {
  return cardRules(card).find((rule) => rule.source)?.source ?? null;
}

/** A card the pregnancy caution list names: the same list the score warns from. */
function pregnancyCaution(card: JourneyCard): boolean {
  return pregnancyCautionHits(card.names.map((name) => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true }))).length > 0;
}

export type Role = "best" | "support" | "foundation" | "strong";

export const ROLE_LABEL: Record<Role, string> = {
  best: "Best match for you",
  support: "Good support",
  foundation: "Your foundation",
  strong: "Stronger, go slow",
};

export type DeckCard = {
  card: JourneyCard;
  role: Role;
  /** What it is on the deck for, as a chip ("Pimples"). Only a Skin needs deck has one. */
  helps?: string;
  /** A line added to "Watch for" when the pregnancy question was left unanswered. */
  caution?: string;
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
  /** Which rules work on it; a card's strength is its heaviest such rule. */
  test: (helps: RuleTarget) => boolean;
  /** Cards that only help something close to it, shown after the rest, with the chip they get. */
  also?: { short: string; test: (helps: RuleTarget) => boolean };
  /** Hand-picked cards, for the one goal the rules have no word for. */
  cards?: CardKey[];
  /** What a scan from here is scored as. */
  score: { concerns: Concern[]; baseSkinType?: BaseSkinType; sensitive?: boolean };
};

const has = (concern: Concern) => (helps: RuleTarget) => helps.concerns?.includes(concern) ?? false;
const type = (skinType: BaseSkinType) => (helps: RuleTarget) => helps.skinTypes?.includes(skinType) ?? false;

export const GOALS: readonly Goal[] = [
  { key: "pimples", label: "Clear pimples", phrase: "clear pimples", short: "Pimples", test: has("acne-prone"), score: { concerns: ["acne-prone"] } },
  { key: "blackheads", label: "Unclog pores", phrase: "unclog blackheads and pores", short: "Pores", test: has("large-pores"), score: { concerns: ["large-pores"] } },
  {
    key: "red-marks",
    label: "Fade red marks",
    phrase: "fade red marks",
    short: "Red marks",
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
    test: (helps) => has("post-acne-marks")(helps) && has("hyperpigmentation")(helps),
    score: { concerns: ["post-acne-marks"] },
  },
  { key: "dark-spots", label: "Even skin tone", phrase: "even out skin tone", short: "Skin tone", test: has("hyperpigmentation"), score: { concerns: ["hyperpigmentation"] } },
  { key: "redness", label: "Calm redness", phrase: "calm redness", short: "Redness", test: has("redness"), score: { concerns: ["redness"] } },
  {
    key: "hydrate",
    label: "Hydrate dry skin",
    phrase: "hydrate dry skin",
    short: "Hydration",
    test: (helps) => has("dehydrated")(helps) || type("dry")(helps),
    score: { concerns: ["dehydrated"], baseSkinType: "dry" },
  },
  { key: "dull", label: "Brighten dull skin", phrase: "brighten dull skin", short: "Dullness", test: has("dullness"), score: { concerns: ["dullness"] } },
  { key: "lines", label: "Lines and wrinkles", phrase: "smooth fine lines", short: "Lines", test: has("fine-lines"), score: { concerns: ["fine-lines"] } },
  { key: "eczema", label: "Soothe eczema-prone skin", phrase: "soothe eczema-prone skin", short: "Eczema-prone", test: has("atopic"), score: { concerns: ["atopic"] } },
  { key: "oil", label: "Control oil", phrase: "control oil and shine", short: "Oil", test: type("oily"), score: { concerns: [], baseSkinType: "oily" } },
  {
    key: "texture",
    label: "Smooth rough texture",
    phrase: "smooth rough texture",
    short: "Texture",
    // No rule is tagged for texture, so these are picked by hand, and a scan
    // is scored as the two concerns nearest to it. Tagging the rules would
    // change every product's score, which is the owner's decision to make.
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
    test: (helps) => helps.sensitive === true && (type("dry")(helps) || has("atopic")(helps)),
    also: { short: "Dry skin", test: (helps) => type("dry")(helps) || has("dehydrated")(helps) },
    score: { concerns: [], baseSkinType: "dry", sensitive: true },
  },
];

const GOAL: Record<GoalKey, Goal> = Object.fromEntries(GOALS.map((goal) => [goal.key, goal])) as Record<GoalKey, Goal>;

/** The most cards one goal shows (owner). */
export const DECK_MAX = 5;

/** What someone told Skin needs today. The two optional answers are `null` when skipped. */
export type Need = { goal: GoalKey; sensitivity: Sensitivity | null; pregnant: boolean | null };

export const PREGNANCY_LINE = "Commonly advised against while pregnant or breastfeeding.";

export function goalLabel(need: Need): string {
  return GOAL[need.goal].label;
}

/** How strongly a card works on something: its heaviest rule that passes. */
function strength(card: JourneyCard, test: (helps: RuleTarget) => boolean): number {
  return Math.max(0, ...cardRules(card).map((rule) => (rule.helps && test(rule.helps) ? rule.weight : 0)));
}

/**
 * The cards for a goal, best first, five at most. Pregnant or breastfeeding
 * drops the cards the pregnancy caution list names; unanswered, they stay and
 * say so. Very sensitive skin gets the gentle cards before the strong ones.
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
  let main = goal.cards ? goal.cards.map((key) => CARD[key]).filter((card) => allowed.includes(card)) : ranked(goal.test);
  if (need.sensitivity === "high") main = [...main.filter((card) => !card.strong), ...main.filter((card) => card.strong)];
  const extra = goal.also ? ranked(goal.also.test).filter((card) => !main.includes(card)) : [];

  return [...main, ...extra].slice(0, DECK_MAX).map((card, index) => ({
    card,
    role: index === 0 ? "best" : card.strong ? "strong" : card.key === "hydrating" ? "foundation" : "support",
    helps: main.includes(card) ? goal.short : goal.also?.short,
    caution: need.pregnant === null && pregnancyCaution(card) ? PREGNANCY_LINE : undefined,
  }));
}

/**
 * The profile a scan from Skin needs is scored with: today's goal and the two
 * optional answers, and nothing from the saved skin profile.
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
  return [need.goal, need.sensitivity ?? "", need.pregnant === null ? "" : need.pregnant ? "yes" : "no"].join(".");
}

const SENSITIVITIES: readonly Sensitivity[] = ["none", "some", "high"];

/** `null` for anything that isn't a need: nothing else in a link is taken on trust. */
export function decodeNeed(param: string | string[] | undefined): Need | null {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw) return null;
  const [goal, sensitivity, pregnant] = raw.split(".");
  if (!GOALS.some((g) => g.key === goal)) return null;
  return {
    goal: goal as GoalKey,
    sensitivity: SENSITIVITIES.find((s) => s === sensitivity) ?? null,
    pregnant: pregnant === "yes" ? true : pregnant === "no" ? false : null,
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

/** The same for a Skin needs scan: its deck, how the product fits it, and the goal inside a sentence. */
export function needFit(ingredients: readonly Pick<Ingredient, "name">[], need: Need): { fit: PlanFit; phrase: string } {
  return { fit: planFit(ingredients, needDeck(need), []), phrase: GOAL[need.goal].phrase };
}
