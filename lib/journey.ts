import type { Concern, Ingredient, SkinProfile } from "@/data/types";
import { INGREDIENT_RULES, ruleMatches, type IngredientRule, type RuleSource } from "@/lib/rules";

/**
 * "What my skin needs" (v9): the person picks up to three concerns, and we
 * show the ingredient categories worth looking for, one card each. A product
 * scanned from there is then read against those cards ("It covers 2 of the 4
 * recommendations").
 *
 * The cards' copy is the hand-off's, which its README marks as placeholder
 * needing scientific review. What a card *claims* — which concerns it helps —
 * is never that copy: it is read off `INGREDIENT_RULES`, the same rules the
 * score uses, so a card can't promise more than the score credits. Each card
 * cites its rules' source where they have one.
 */

/** The concerns the journey offers, in the hand-off's order, with its short labels. */
export const JOURNEY_CONCERNS: readonly { concern: Concern; label: string; short: string }[] = [
  { concern: "acne-prone", label: "Acne", short: "Acne" },
  { concern: "post-acne-marks", label: "Post-acne marks", short: "Marks" },
  { concern: "dehydrated", label: "Dehydration", short: "Hydration" },
  { concern: "redness", label: "Redness", short: "Redness" },
  { concern: "large-pores", label: "Pores", short: "Pores" },
  { concern: "fine-lines", label: "Fine lines", short: "Lines" },
  { concern: "dullness", label: "Dullness", short: "Dullness" },
  { concern: "hyperpigmentation", label: "Dark spots", short: "Dark spots" },
];

export const JOURNEY_MAX = 3;

export type CardKey = "azelaic" | "niacinamide" | "hydrating" | "retinoids";

export type JourneyCard = {
  key: CardKey;
  name: string;
  line: string;
  whyYou: string;
  howToStart: string;
  watchFor: string;
  whenShopping: string;
  /** The rules whose ingredients make a product count for this card. */
  rules: IngredientRule[];
};

const rulesFor = (...names: string[]) => INGREDIENT_RULES.filter((rule) => names.some((name) => ruleMatches(rule, name)));

// The hand-off's four cards (placeholder copy, see above).
const CARDS: readonly JourneyCard[] = [
  {
    key: "azelaic",
    name: "Azelaic acid",
    line: "Calms breakouts and helps with the marks they leave.",
    whyYou: "Targets acne and marks, and suits sensitive skin.",
    howToStart: "Slowly, a few times a week, then more if it feels fine.",
    watchFor: "Can feel tingly or drying at first.",
    whenShopping: "Leave-on, often around 10%, without other strong acids.",
    rules: rulesFor("azelaic acid"),
  },
  {
    key: "niacinamide",
    name: "Niacinamide",
    line: "Helps with oil balance, supports your skin barrier and can fade marks.",
    whyYou: "Supports your barrier and oil balance, and helps marks fade over time.",
    howToStart: "Once a day, morning or evening. Most skin tolerates it well.",
    watchFor: "Very high strengths can cause flushing in some people.",
    whenShopping: "A serum or moisturiser; it doesn't need to be very strong.",
    rules: rulesFor("niacinamide"),
  },
  {
    key: "hydrating",
    name: "Hydrating basics",
    line: "Glycerin, hyaluronic acid, panthenol and ceramides put water back in and keep it there.",
    whyYou: "Dehydrated skin copes less well with other actives, so this comes first.",
    howToStart: "Morning and evening, after cleansing.",
    watchFor: "Heavy oils can clog acne-prone skin.",
    whenShopping: "Look for glycerin, panthenol or ceramides in a light texture.",
    rules: rulesFor("glycerin", "sodium hyaluronate", "panthenol", "ceramide np"),
  },
  {
    key: "retinoids",
    name: "Retinoids",
    line: "Strong evidence for acne, lines and texture, with a learning curve.",
    whyYou: "Powerful for acne and texture over time.",
    howToStart: "Twice a week at night, in the gentlest form.",
    watchFor: "Dryness and peeling at first. Sunscreen every day.",
    whenShopping: "A gentle retinol in a moisturising base.",
    rules: rulesFor("retinol"),
  },
];

/** The concerns a card's rules say it helps — the only source of its ticks. */
export function cardHelps(card: JourneyCard): Set<Concern> {
  return new Set(card.rules.flatMap((rule) => rule.helps?.concerns ?? []));
}

/** Where to read about a card: its first rule with a source. */
export function cardSource(card: JourneyCard): RuleSource | null {
  return card.rules.find((rule) => rule.source)?.source ?? null;
}

export type Role = "best" | "support" | "foundation" | "strong";

export const ROLE_LABEL: Record<Role, string> = {
  best: "Best match for you",
  support: "Good support",
  foundation: "Your foundation",
  strong: "Stronger, go slow",
};

export type DeckCard = { card: JourneyCard; role: Role };

/**
 * The cards for these concerns, best first. A card stays only if its rules
 * help at least one chosen concern — except hydrating basics, which every
 * routine builds on. Retinoids are left out while pregnant or breastfeeding,
 * the same caution the score applies. Ties keep the hand-off's order.
 */
export function deckFor(concerns: readonly Concern[], profile: Pick<SkinProfile, "pregnancyStatus">): DeckCard[] {
  const pregnant = profile.pregnancyStatus === "pregnant" || profile.pregnancyStatus === "breastfeeding";
  const scored = CARDS.filter((card) => !(pregnant && card.key === "retinoids"))
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
  /** Deck cards the product has an ingredient for, in deck order. */
  covered: { card: JourneyCard; role: Role; ingredient: string }[];
  total: number;
  /** Chosen concerns none of the covered cards helps. */
  notCovered: Concern[];
};

/** How a product fits the plan: which cards its ingredients count for. */
export function planFit(ingredients: readonly Pick<Ingredient, "name">[], deck: readonly DeckCard[], concerns: readonly Concern[]): PlanFit {
  const covered = deck.flatMap(({ card, role }) => {
    const hit = ingredients.find((ingredient) => card.rules.some((rule) => ruleMatches(rule, ingredient.name)));
    return hit ? [{ card, role, ingredient: hit.name }] : [];
  });
  const helped = new Set(covered.flatMap(({ card }) => [...cardHelps(card)]));
  return { covered, total: deck.length, notCovered: concerns.filter((c) => !helped.has(c)) };
}

/** A concern's short journey label ("Acne", "Marks"). */
export function shortLabel(concern: Concern): string {
  return JOURNEY_CONCERNS.find((c) => c.concern === concern)?.short ?? concern;
}

/** Concerns travel through the scanner to the result as one route param. */
export function encodeConcerns(concerns: readonly Concern[]): string {
  return concerns.join(",");
}

export function decodeConcerns(param: string | string[] | undefined): Concern[] {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw) return [];
  const known = new Set(JOURNEY_CONCERNS.map((c) => c.concern));
  return raw.split(",").filter((c): c is Concern => known.has(c as Concern)).slice(0, JOURNEY_MAX);
}
