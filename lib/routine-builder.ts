import type { Concern, ProductType, ProductWithIngredients, SkinProfile } from "@/data/types";
import { needDeck, needVerdict, type GoalKey, type JourneyCard, type Need } from "@/lib/journey";
import { isLowCoverage, matchProduct, SCORE_BANDS, type MatchResult } from "@/lib/matching";
import { CONCERN_PHRASE } from "@/lib/profile";
import { holdsActive } from "@/lib/skin-needs";
import type { Active } from "@/lib/skin-needs-data";

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

/** The active a serum or treatment step is about: its name, what it is for, and the others that would do. */
export type RoutineActive = {
  name: string;
  why: string;
  alternatives: string[];
  /**
   * The pregnancy caution, when the active is one the caution list names and
   * the profile does not say either way (unanswered, or "Prefer not to say").
   * With a yes the active is not offered at all; with a no there is nothing
   * to say. The same line a Skin needs card carries.
   */
  caution: string | null;
};

export type RoutineSlot = {
  key: string;
  label: string;
  /**
   * For a serum or treatment step: the active to use, as the step's headline
   * (owner, 2 October 2026: "Vitamin C" in big letters says more than a
   * product we may not have). `null` on a basic step.
   */
  active: RoutineActive | null;
  /**
   * The one product we suggest for the step: the best match, or `null` when
   * nothing qualifies. One, not a shortlist (owner, 2 October 2026): three
   * options handed the choice back to someone who came to be told, and who
   * can still scan a product of their own and add it.
   */
  pick: RoutinePick | null;
};

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
// "Oil" alone would take in every "oil control" and "oil-free" face wash, so an
// oil has to be named as the cleanser itself.
const FIRST_CLEANSE_NAME = /\b(cleansing oil|oil cleanser|huile (d[ée]maquillante|nettoyante)|balm|butter|milk|lait|micellar|micellaire|make-?up remov|d[ée]maquill|cleansing water)/i;

function isFirstCleanse(product: ProductWithIngredients): boolean {
  return product.type === "micellar-water" || (product.type === "cleanser" && FIRST_CLEANSE_NAME.test(product.name));
}

function isFaceWash(product: ProductWithIngredients): boolean {
  return product.type === "cleanser" && !isFirstCleanse(product) && !NOT_A_FACE_WASH.test(product.name) && !notForTheFace(product.name);
}

function isMoisturiser(product: ProductWithIngredients): boolean {
  return product.type === "moisturizer" && !NOT_A_MOISTURISER.test(product.name) && !notForTheFace(product.name);
}

function isSunscreen(product: ProductWithIngredients): boolean {
  return product.type === "sunscreen" && !notForTheFace(product.name);
}

// The catalogue's types are guessed from names and categories, and some
// guesses are wrong in ways that matter here: a nail polish remover and a
// pimple patch typed as cleansers, an exfoliating lotion typed as a
// moisturiser. A name that says a product is something else keeps it out of a
// step, whatever its type. In the catalogue's own languages (English, French,
// German, Dutch, Turkish).
const NOT_A_FACE_WASH = /\b(patch|pads?|dissolvant|nail|ongles?|nagel|eye|yeux|augen|l[èe]vres|lip)\b/i;
const NOT_A_MOISTURISER = /\b(exfoli\w*|peel\w*|peeling|gommage|scrub|tonique|toner|tonic|cleans\w*|nettoyant|reinig\w*)\b/i;

// The catalogue keeps hand, body and shaving products on purpose (they are
// scored when scanned), and Open Beauty Facts files many under its face
// categories: a hand cream typed as a moisturiser, a shave foam as a cleanser,
// a body sun spray as a sunscreen. None of them is a step of a face routine.
const SOAP = /(soap|savon|seife|sabun|zeep)/i;
const NOT_FOR_THE_FACE =
  /\b(hand(?!made|crafted)\w*|mains|manos|h[äa]nde|foot\w*|feet|pieds|f[üu](ss|ß)\w*|shav\w*|rasage|raser|rasier\w*|scheer\w*|intim\w*|autobronz\w*|self[- ]tan\w*|bronzla\w*|wipes?|lingettes?|cotton|coton|hair\w*|curls?|cuticule|cuticle)\b/i;
const BODY = /\b(body\w*|corps|corpo|corporal|corporel|k[öo]rper\w*|v[üu]cut)\b/i;
const FACE = /\b(face|facial|visage|viso|gesicht\w*|rostro|y[üu]z)\b/i;

// A BB cream or a tinted cream is make-up with skincare in it. One with SPF is
// typed as a sunscreen and was the step's top pick (owner, 3 October 2026).
const TINTED = /\b((bb|cc)[\s-]?(cream|cr[èe]me)|tinted|teint[ée]e?s?|get[öo]nt\w*)\b/i;

/** A name that says the product is for somewhere else, or is make-up. "Face & body" is still for the face. */
function notForTheFace(name: string): boolean {
  return SOAP.test(name) || NOT_FOR_THE_FACE.test(name) || TINTED.test(name) || (BODY.test(name) && !FACE.test(name));
}

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
function cardsFor(time: TimeOfDay, profile: SkinProfile): { cards: JourneyCard[]; cautions: ReadonlyMap<JourneyCard, string> } {
  const deck = needsOf(profile).flatMap(({ need }) => needDeck(need).filter((item) => item.counts));
  const all = [...new Set(deck.map((item) => item.card))];
  // The pregnancy caution a card carries when the profile does not say either way.
  const cautions = new Map(deck.flatMap((item) => (item.caution ? [[item.card, item.caution] as const] : [])));
  const gentle = all.filter((card) => !card.strong);
  const strong = all.filter((card) => card.strong);
  const cards = time === "morning" || profile.sensitivity === "high" || strong.length === 0 ? gentle : strong;
  return { cards, cautions };
}

/** "A", "A or B", "A, B or C". */
function oneOf(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * The step's active: `lead` (the best card for the profile, or the one the
 * suggested product holds), what it is for, and up to two others that would do.
 */
function activeFor(cards: JourneyCard[], lead: JourneyCard | undefined, cautions: ReadonlyMap<JourneyCard, string>, profile: SkinProfile): RoutineActive | null {
  if (!lead) return null;
  const what = needsOf(profile).map((entry) => entry.what);
  return {
    name: lead.name,
    why: `For ${what.length <= 1 ? what[0] : `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}`}.`,
    alternatives: cards
      .filter((card) => card !== lead)
      .slice(0, 2)
      .map((card) => card.name),
    caution: cautions.get(lead) ?? null,
  };
}

/** The line under a step's active: what it is for, and what else would do. */
export function activeLine(active: RoutineActive): string {
  return active.alternatives.length > 0 ? `${active.why} ${oneOf(active.alternatives)} would do too.` : active.why;
}

/** Safe enough to recommend: scored, not a poor match, and nothing the skin match warns hard about. */
export function recommendable(product: ProductWithIngredients, match: MatchResult): boolean {
  if (match.score === null || match.score < SCORE_BANDS.fair || isLowCoverage(product.ingredients)) return false;
  return !match.warnings.some((warning) => warning.severity === "hazard" || warning.origin === "pregnancy");
}

/** The best of these actives a product holds, high enough on its label to count: the earliest card, or `null`. */
function activeHeld(product: ProductWithIngredients, cards: readonly JourneyCard[], profile: SkinProfile): JourneyCard | null {
  const held = new Set(
    needsOf(profile).flatMap(({ need }) => needVerdict(product.ingredients, need).actives.flatMap((finding) => (!finding.trace && finding.card !== null ? [finding.card] : []))),
  );
  return cards.find((card) => held.has(card)) ?? null;
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
    { key: "sunscreen", label: "Sunscreen", fits: isSunscreen },
  ],
  evening: [
    { key: "first-cleanse", label: "First cleanse", fits: (p) => isFirstCleanse(p) && !/\b(dissolvant|nail|ongles?|nagel)\b/i.test(p.name) && !notForTheFace(p.name) },
    { key: "cleanse", label: "Cleansing", fits: isFaceWash },
    { key: "treatment", label: "Treatment", fits: (p) => TREATMENT_TYPES.includes(p.type), active: "evening" },
    { key: "moisturise", label: "Moisturiser", fits: (p) => isMoisturiser(p) || p.type === "night-mask" },
  ],
};

export type Routine = Record<TimeOfDay, RoutineSlot[]> & {
  /**
   * Every product safe to recommend for this skin, best match first: where an
   * active added from Skin needs finds its product (`pickHolding`).
   */
  picks: readonly RoutinePick[];
};

/**
 * The products any step could use. About a quarter of the catalogue is lip
 * balms, hand creams and masks, which no step takes and so need no score.
 */
export function routineCandidates(products: readonly ProductWithIngredients[]): ProductWithIngredients[] {
  const steps = [...STEPS.morning, ...STEPS.evening];
  return products.filter((product) => steps.some((step) => step.fits(product)));
}

/** One candidate, scored for this skin: `null` when it is not safe enough to recommend. */
export function routinePick(product: ProductWithIngredients, profile: SkinProfile): RoutinePick | null {
  const match = matchProduct(product, profile);
  return recommendable(product, match) ? { product, match } : null;
}

/** Both routines from the scored picks: each step keeps its best. */
export function assembleRoutine(picks: readonly RoutinePick[], profile: SkinProfile): Routine {
  // Best match first; the name settles a tie, so the same profile always gets the same routine.
  const scored = [...picks].sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0) || a.product.name.localeCompare(b.product.name));
  const slots = (time: TimeOfDay): RoutineSlot[] =>
    STEPS[time].map((step) => {
      if (!step.active) {
        return { key: step.key, label: step.label, active: null, pick: scored.find((pick) => step.fits(pick.product)) ?? null };
      }
      // An active step: only a product that holds one of its actives, the one
      // with the best active, and among those the best skin match. The step's
      // headline is the active that product holds, so the big letters and the
      // bottle under them never name two different things.
      const { cards, cautions } = cardsFor(step.active, profile);
      const holding = scored
        .filter((pick) => step.fits(pick.product))
        .flatMap((pick) => {
          const card = activeHeld(pick.product, cards, profile);
          return card ? [{ pick, rank: cards.indexOf(card), card }] : [];
        })
        // `scored` is already best match first, and the sort is stable.
        .sort((a, b) => a.rank - b.rank);
      const best = holding[0];
      return { key: step.key, label: step.label, active: activeFor(cards, best?.card ?? cards[0], cautions, profile), pick: best?.pick ?? null };
    });
  return { morning: slots("morning"), evening: slots("evening"), picks: scored };
}

/** The steps with nothing picked and no active named: a routine begun from Skin needs with no skin profile to pick for. */
export function basicRoutine(): Routine {
  const slots = (time: TimeOfDay): RoutineSlot[] => STEPS[time].map((step) => ({ key: step.key, label: step.label, active: null, pick: null }));
  return { morning: slots("morning"), evening: slots("evening"), picks: [] };
}

/** The key of the step an active added from Skin needs goes in: the morning serum or the evening treatment. */
export function activeStepKey(time: TimeOfDay): string {
  return STEPS[time].find((step) => step.active === time)!.key;
}

/**
 * The product we suggest for an active someone added from Skin needs (owner,
 * 3 October 2026): the best skin match among the products that fit its step
 * and hold it above the trace stretch of their label, or `null`.
 */
export function pickHolding(routine: Routine, time: TimeOfDay, active: Active): RoutinePick | null {
  const step = STEPS[time].find((candidate) => candidate.active === time)!;
  return routine.picks.find((pick) => step.fits(pick.product) && holdsActive(pick.product.ingredients, active)) ?? null;
}

/**
 * Both routines for a profile, from the catalogue, in one go. Scoring a
 * thousand products takes long enough on a phone to freeze a tap, so the
 * screen does the same three steps in small batches (`app/routine.tsx`);
 * this is the whole of it for tests and scripts.
 */
export function buildRoutine(products: readonly ProductWithIngredients[], profile: SkinProfile): Routine {
  const picks = routineCandidates(products).flatMap((product) => routinePick(product, profile) ?? []);
  return assembleRoutine(picks, profile);
}

// ── A product of one's own ───────────────────────────────────────────────────

/** The id a step's own pick is kept under. */
export function placeId(time: TimeOfDay, key: string): string {
  return `${time}:${key}`;
}

/**
 * A step named by its id (`placeId`), as a scan started from it carries it:
 * what it is called, and whether a scanned product belongs in it. `null` for
 * anything that is not one of the steps: nothing in a link is taken on trust.
 */
export function routineStepOf(id: string | undefined): { id: string; label: string; time: TimeOfDay; fits: (product: ProductWithIngredients) => boolean } | null {
  const [time, key] = (id ?? "").split(":");
  if (time !== "morning" && time !== "evening") return null;
  const step = STEPS[time].find((candidate) => candidate.key === key);
  return step ? { id: placeId(time, step.key), label: step.label, time, fits: step.fits } : null;
}

// ── The last routine built ───────────────────────────────────────────────────

let last: { profile: SkinProfile; products: readonly ProductWithIngredients[]; routine: Routine } | null = null;

/** Whether two reads of the catalogue hold the very same products: a changed product is always a new object. */
function sameCatalogue(a: readonly ProductWithIngredients[], b: readonly ProductWithIngredients[]): boolean {
  return a.length === b.length && a.every((product, index) => product === b[index]);
}

/**
 * Keeps the routine just built, in memory, so that opening the screen again
 * shows it at once: the screen is drawn afresh on every visit, and without
 * this each visit scored the catalogue all over again. It answers only for
 * the very profile it was built for (a changed profile is a new object), and
 * the screen drops it when the catalogue it reads is no longer the same one.
 */
export function rememberRoutine(profile: SkinProfile, products: readonly ProductWithIngredients[], routine: Routine): void {
  last = { profile, products, routine };
}

/** The remembered routine for this profile, or `null`. With `products`, only if it was built from that same catalogue. */
export function recallRoutine(profile: SkinProfile, products?: readonly ProductWithIngredients[]): Routine | null {
  if (!last || last.profile !== profile) return null;
  return products && !sameCatalogue(last.products, products) ? null : last.routine;
}

/** Forgets it. For tests, which would otherwise carry one case's routine into the next. */
export function forgetRoutine(): void {
  last = null;
}

