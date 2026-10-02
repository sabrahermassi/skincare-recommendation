import type { Concern, ProductType, ProductWithIngredients, SkinProfile } from "@/data/types";
import { needDeck, needVerdict, type GoalKey, type JourneyCard, type Need } from "@/lib/journey";
import { isLowCoverage, matchProduct, SCORE_BANDS, type MatchResult } from "@/lib/matching";
import { CONCERN_PHRASE } from "@/lib/profile";

/**
 * The routine builder (owner, 2 October 2026): from the skin profile, the
 * steps of a morning and an evening routine, each with the catalogue's best
 * matches for it.
 *
 * Two kinds of step:
 *
 * - A basic step (cleanse, moisturise, sunscreen) takes the products of that
 *   type that match the skin best, by the same skin match every result shows.
 * - An active step (the morning serum, the evening treatment) is the one that
 *   works on the person's concerns, so a product must hold an active for one
 *   of them, by the same check a Skin needs scan uses (`needVerdict`). The
 *   catalogue is thin here (Open Beauty Facts has almost no serums), so the
 *   step always says which actives to look for, and names a product only
 *   when one qualifies.
 *
 * Nothing is recommended that the skin match warns against: a hazard, a
 * pregnancy caution, a poor match, or a label too little of which was read.
 */

export type TimeOfDay = "morning" | "evening";

export type RoutinePick = { product: ProductWithIngredients; match: MatchResult };

export type RoutineSlot = {
  key: string;
  label: string;
  /** For an active step: which actives to look for, and what for. */
  note: string | null;
  /** The best matches for the step, best first, three at most. */
  picks: RoutinePick[];
};

/** How many products one step offers: its pick, and two more to choose from. */
export const PICKS_PER_STEP = 3;

/** The Skin needs goal that works on each profile concern. */
const CONCERN_GOAL: Record<Concern, GoalKey> = {
  "acne-prone": "pimples",
  "large-pores": "blackheads",
  "post-acne-marks": "dark-marks",
  hyperpigmentation: "dark-spots",
  redness: "redness",
  dehydrated: "hydrate",
  dullness: "dull",
  "fine-lines": "lines",
  atopic: "eczema",
};

/** A first cleanse: something that takes off sunscreen and make-up before the face wash. */
const FIRST_CLEANSE_NAME = /\b(oil|balm|butter|milk|micellar|make-?up remov|d[ée]maquill|cleansing water)/i;

function isFirstCleanse(product: ProductWithIngredients): boolean {
  return product.type === "micellar-water" || (product.type === "cleanser" && FIRST_CLEANSE_NAME.test(product.name));
}

function isFaceWash(product: ProductWithIngredients): boolean {
  return product.type === "cleanser" && !isFirstCleanse(product) && !NOT_A_FACE_WASH.test(product.name);
}

function isMoisturiser(product: ProductWithIngredients): boolean {
  return product.type === "moisturizer" && !NOT_A_MOISTURISER.test(product.name);
}

// The catalogue's types are guessed from names and categories, and some
// guesses are wrong in ways that matter here: a nail polish remover and a
// pimple patch typed as cleansers, an exfoliating lotion typed as a
// moisturiser. A name that says a product is something else keeps it out of a
// step, whatever its type. In the catalogue's own languages (English, French,
// German, Dutch, Turkish).
const NOT_A_FACE_WASH = /\b(patch|pads?|dissolvant|nail|ongles?|nagel|eye|yeux|augen|l[èe]vres|lip)\b/i;
const NOT_A_MOISTURISER = /\b(exfoli\w*|peel\w*|peeling|gommage|scrub|tonique|toner|tonic|cleans\w*|nettoyant|reinig\w*)\b/i;

// Where an active for a concern is worn: leave-on steps between cleansing and
// moisturiser. A moisturiser with niacinamide in it is still the moisturiser.
const SERUM_TYPES: readonly ProductType[] = ["serum", "essence", "ampoule", "toner"];
const TREATMENT_TYPES: readonly ProductType[] = [...SERUM_TYPES, "exfoliator"];

/** The needs a profile stands for: one per concern, or its skin type when it names none. */
function needsOf(profile: SkinProfile): { need: Need; what: string }[] {
  const pregnant = profile.pregnancyStatus === "pregnant" || profile.pregnancyStatus === "breastfeeding" ? true : profile.pregnancyStatus === "neither" ? false : null;
  const base = { sensitivity: profile.sensitivity, pregnant };
  if (profile.concerns.length > 0) {
    return profile.concerns.map((concern) => ({ need: { goal: CONCERN_GOAL[concern], ...base }, what: CONCERN_PHRASE[concern] }));
  }
  return profile.baseSkinType === "oily" ? [{ need: { goal: "oil", ...base }, what: "oily skin" }] : [{ need: { goal: "hydrate", ...base }, what: "hydration" }];
}

/**
 * The active cards a step looks for. The evening treatment takes the strong
 * ones (retinoids, acids, benzoyl peroxide), which are worn at night; the
 * morning serum takes the gentle ones. Very sensitive skin gets the gentle
 * ones at night too, and so does a profile whose concerns have no strong
 * active at all (redness, dry skin).
 */
function cardsFor(time: TimeOfDay, profile: SkinProfile): JourneyCard[] {
  const all = [...new Set(needsOf(profile).flatMap(({ need }) => needDeck(need).filter((item) => item.counts).map((item) => item.card)))];
  const gentle = all.filter((card) => !card.strong);
  const strong = all.filter((card) => card.strong);
  if (time === "morning") return gentle;
  return profile.sensitivity === "high" || strong.length === 0 ? gentle : strong;
}

/** "A", "A or B", "A, B or C". */
function oneOf(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

function noteFor(cards: JourneyCard[], profile: SkinProfile): string | null {
  if (cards.length === 0) return null;
  const what = needsOf(profile).map((entry) => entry.what);
  return `Look for ${oneOf(cards.slice(0, 3).map((card) => card.name))}, for ${what.length <= 1 ? what[0] : `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}`}.`;
}

/** Safe enough to recommend: scored, not a poor match, and nothing the skin match warns hard about. */
function recommendable(product: ProductWithIngredients, match: MatchResult): boolean {
  if (match.score === null || match.score < SCORE_BANDS.fair || isLowCoverage(product.ingredients)) return false;
  return !match.warnings.some((warning) => warning.severity === "hazard" || warning.origin === "pregnancy");
}

/** Whether a product holds one of these actives, high enough on its label to count. */
function holdsActive(product: ProductWithIngredients, cards: readonly JourneyCard[], profile: SkinProfile): boolean {
  return needsOf(profile).some(({ need }) => needVerdict(product.ingredients, need).actives.some((finding) => !finding.trace && finding.card !== null && cards.includes(finding.card)));
}

type Step = {
  key: string;
  label: string;
  fits: (product: ProductWithIngredients) => boolean;
  /** An active step: which time's actives it looks for. */
  active?: TimeOfDay;
};

const STEPS: Record<TimeOfDay, Step[]> = {
  morning: [
    { key: "cleanse", label: "Cleansing", fits: isFaceWash },
    { key: "serum", label: "Serum", fits: (p) => SERUM_TYPES.includes(p.type), active: "morning" },
    { key: "moisturise", label: "Moisturiser", fits: isMoisturiser },
    { key: "sunscreen", label: "Sunscreen", fits: (p) => p.type === "sunscreen" },
  ],
  evening: [
    { key: "first-cleanse", label: "First cleanse", fits: (p) => isFirstCleanse(p) && !/\b(dissolvant|nail|ongles?|nagel)\b/i.test(p.name) },
    { key: "cleanse", label: "Cleansing", fits: isFaceWash },
    { key: "treatment", label: "Treatment", fits: (p) => TREATMENT_TYPES.includes(p.type), active: "evening" },
    { key: "moisturise", label: "Moisturiser", fits: (p) => isMoisturiser(p) || p.type === "night-mask" },
  ],
};

/** The step names of each routine, for a screen that has no catalogue yet. */
export const ROUTINE_STEPS: Record<TimeOfDay, { key: string; label: string }[]> = {
  morning: STEPS.morning.map(({ key, label }) => ({ key, label })),
  evening: STEPS.evening.map(({ key, label }) => ({ key, label })),
};

/**
 * Both routines for a profile, from the catalogue. Every product is scored
 * once; a step then keeps its three best that are safe to recommend.
 */
export function buildRoutine(products: readonly ProductWithIngredients[], profile: SkinProfile): Record<TimeOfDay, RoutineSlot[]> {
  const scored: RoutinePick[] = products
    .map((product) => ({ product, match: matchProduct(product, profile) }))
    .filter(({ product, match }) => recommendable(product, match))
    // Best match first; the name settles a tie, so the same profile always gets the same routine.
    .sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0) || a.product.name.localeCompare(b.product.name));

  const slots = (time: TimeOfDay): RoutineSlot[] =>
    STEPS[time].map((step) => {
      const cards = step.active ? cardsFor(step.active, profile) : [];
      const picks = scored.filter(({ product }) => step.fits(product) && (!step.active || holdsActive(product, cards, profile))).slice(0, PICKS_PER_STEP);
      return { key: step.key, label: step.label, note: step.active ? noteFor(cards, profile) : null, picks };
    });
  return { morning: slots("morning"), evening: slots("evening") };
}
