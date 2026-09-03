import type { Ingredient } from "@/data/types";
import { formulaCoverage } from "@/lib/matching";
import { isVerified } from "@/lib/safety";

/**
 * Pore-clogging detection — a property of the formula, not a score.
 *
 * WHY THIS IS SEPARATE FROM `INGREDIENT_RULES`
 *
 * The rules table answers "how well does this product suit *you*", and
 * pore-clogging used to be one category inside it. That made the answer to
 * "does this contain pore-clogging ingredients" unreliable in four ways, all
 * of them false negatives:
 *
 *   1. The rules only fire for a profile that declared acne-prone or oily
 *      skin, so everyone else was told nothing.
 *   2. `buildFactors` nets deltas within a category, and salicylic acid sits
 *      in `pore-clogging` as a positive — so a formula with both salicylic
 *      acid and coconut oil could net to zero and report "nothing flagged".
 *   3. `RiskCards.poreRisk` could only reach "Elevated" through the
 *      `comedogenic` column, which is empty for every real catalogue row.
 *   4. `ingredientTone` reads `MatchResult.reasons`, which is truncated to
 *      six entries, so a seventh flagged ingredient rendered as "good".
 *
 * A checker whose job is "warn me" cannot have false negatives. So detection
 * lives here: no profile argument, no netting, no truncation, no cap. Every
 * ingredient is checked, every hit is returned. Scoring is untouched — the
 * rules table still owns the number, and this owns the fact.
 *
 * WHERE THE DATA COMES FROM, AND WHY IT IS NOT A 0-5 RATING
 *
 * Every public pore-clogging checker descends from the same source: rabbit-ear
 * comedogenicity testing by Fulton and Kligman in the 1970s-80s. That method
 * is contested — rabbit ear follicles differ from human facial ones, it threw
 * many false positives, and the original scoring counted rabbits' naturally
 * enlarged pores as comedones. A 2022 International Journal of Cosmetic
 * Science review concluded those ratings should flag an ingredient for further
 * testing rather than settle it. "Non-comedogenic" has no regulated meaning.
 *
 * `data/types.ts` therefore refuses to populate a 0-5 `comedogenic` column,
 * and that decision stands — this table does not touch it. A number presented
 * as measurement would be dishonest. What this table holds instead is a claim
 * about what the published lists say, carrying its own confidence tier and a
 * sentence the user can read and argue with. `contested` entries are the ones
 * the lists disagree about; they are shown and never warned about.
 *
 * Replacing the hand-authored patterns with a pulled source is tracked as
 * issue #43.
 */

export type CloggerConfidence =
  /** Named on essentially every published list, and the mechanism is plausible. */
  | "high"
  /** Widely listed, but the evidence is the old assays or the effect is dose-dependent. */
  | "moderate"
  /** Published lists disagree. Shown for transparency, never as a warning. */
  | "contested";

export type CloggerEntry = {
  /** Normalised lowercase INCI names, or a pattern for a family. */
  names: (string | RegExp)[];
  confidence: CloggerConfidence;
  /** Shown verbatim to the user. Say why, not just what. */
  reason: string;
};

export type CloggerHit = {
  /** The ingredient as it appears on the label. */
  name: string;
  /** 1-based position in the INCI list. */
  position: number;
  /** Length of the list the position is relative to. */
  total: number;
  confidence: CloggerConfidence;
  reason: string;
};

/**
 * Patterns are anchored deliberately. `/isopropyl/` alone would catch
 * isopropyl alcohol, which is a different complaint entirely; the ester list
 * is spelled out instead. Precision matters more than reach here — a checker
 * that flags half an ordinary shelf gets ignored, which is the same outcome as
 * one that flags nothing.
 */
export const PORE_CLOGGERS: CloggerEntry[] = [
  // ── Coconut and its derivatives ───────────────────────────────────────────
  {
    names: [
      "coconut oil",
      "cocos nucifera oil",
      "hydrogenated coconut oil",
      "sodium cocoate",
      "potassium cocoate",
    ],
    confidence: "high",
    reason:
      "Coconut oil is the most consistently reported pore-clogger on every published list - it is high in lauric acid, which sits in the follicle rather than absorbing",
  },
  {
    names: ["lauric acid"],
    confidence: "high",
    reason:
      "Lauric acid is the fraction of coconut oil most associated with blocked follicles, and it appears on its own in many cleansers",
  },
  {
    names: [/^coconut alkanes$/, /^coco-caprylate/, /^cocoglycerides$/],
    confidence: "contested",
    reason:
      "A refined coconut fraction. Some lists flag anything coconut-derived; these particular esters are light and are cleared by others",
  },

  // ── Isopropyl and myristyl esters ─────────────────────────────────────────
  {
    names: [/^isopropyl (myristate|palmitate|isostearate|linoleate|lanolate)$/],
    confidence: "high",
    reason:
      "Isopropyl fatty esters are among the most reliably comedogenic entries in the original testing - they are used precisely because they sink into the follicle",
  },
  {
    names: [/^myristyl (myristate|lactate|propionate)$/],
    confidence: "high",
    reason: "Myristyl esters are heavy, occlusive emollients repeatedly linked to blocked pores",
  },
  {
    names: ["isopropyl titanium triisostearate"],
    confidence: "moderate",
    reason:
      "The coating on many mineral sunscreen particles. Flagged as an isostearate ester, though how much reaches the follicle from a bound coating is unclear",
  },

  // ── Other heavy synthetic esters ──────────────────────────────────────────
  {
    names: [
      "butyl stearate",
      "decyl oleate",
      "isocetyl stearate",
      "isodecyl oleate",
      "isostearyl neopentanoate",
      "stearyl heptanoate",
      "dioctyl succinate",
      "ppg-2 myristyl propionate",
    ],
    confidence: "moderate",
    reason:
      "A heavy synthetic emollient ester - this family sits on the skin rather than absorbing, and appears across the published lists",
  },
  {
    names: [/^(ethylhexyl|octyl) (palmitate|stearate)$/],
    confidence: "moderate",
    reason:
      "A common lightweight-feeling ester that nonetheless shows up on most pore-clogging lists, usually rated mild",
  },

  // ── Ethoxylated surfactants and emulsifiers ───────────────────────────────
  {
    names: [/^oleth-[2-5]$/, /^laureth-[2-4]$/],
    confidence: "moderate",
    reason:
      "Low-ethoxylate oleths and laureths are flagged across the lists; the higher-numbered versions of the same family are not",
  },
  {
    names: ["sorbitan oleate", "sorbitan sesquioleate", "polyglyceryl-3 diisostearate"],
    confidence: "moderate",
    reason: "An oleate-based emulsifier, a group repeatedly associated with follicular plugging",
  },
  {
    names: ["glyceryl stearate se"],
    confidence: "moderate",
    reason:
      "The self-emulsifying grade specifically - plain glyceryl stearate is not flagged, and the two are easy to confuse on a label",
  },
  {
    names: [/^steareth-(10|20)$/],
    confidence: "contested",
    reason: "Listed by some sources as a mild clogger; cleared by others as a benign emulsifier",
  },
  {
    names: ["sodium lauryl sulfate"],
    confidence: "contested",
    reason:
      "Appears on pore-clogging lists, though its better-evidenced problem is irritation and barrier disruption rather than blocked follicles",
  },

  // ── Lanolin derivatives ───────────────────────────────────────────────────
  {
    names: ["acetylated lanolin", "acetylated lanolin alcohol", "peg-16 lanolin", "lanolin"],
    confidence: "moderate",
    reason: "Lanolin and its acetylated derivatives are long-standing entries on the published lists",
  },

  // ── Algae and seaweed ─────────────────────────────────────────────────────
  {
    names: [
      /^(algae|laminaria|ascophyllum|chondrus crispus|macrocystis)/,
      "carrageenan",
      "seaweed extract",
    ],
    confidence: "moderate",
    reason:
      "Algae and seaweed extracts are flagged across the acne-clinic lists, which is why they turn up in so many 'why did this break me out' posts",
  },

  // ── Plant oils and butters ────────────────────────────────────────────────
  {
    names: ["wheat germ oil", /^triticum vulgare germ oil$/, "wheat germ glycerides"],
    confidence: "high",
    reason: "Wheat germ oil scores at the top of the original comedogenicity series",
  },
  {
    names: ["cocoa butter", /^theobroma cacao/],
    confidence: "high",
    reason: "Cocoa butter is a dense, highly occlusive butter and a consistent entry on every list",
  },
  {
    names: [
      "soybean oil",
      /^glycine soja( oil)?$/,
      "corn oil",
      /^zea mays oil$/,
      "cottonseed oil",
      /^gossypium/,
      "peanut oil",
      /^arachis hypogaea/,
      "sesame oil",
      /^sesamum indicum/,
      "palm oil",
      "linseed oil",
      "flaxseed oil",
      /^linum usitatissimum/,
    ],
    confidence: "moderate",
    reason:
      "A heavier vegetable oil from the group the published lists flag - generally rated mild to moderate rather than severe",
  },
  {
    names: ["avocado oil", /^persea gratissima/, "olive oil", /^olea europaea/, "mink oil"],
    confidence: "moderate",
    reason: "A rich, oleic-heavy oil; listed as a moderate clogger for acne-prone skin",
  },
  {
    names: ["squalene"],
    confidence: "moderate",
    reason:
      "Squalene, not squalane - the unsaturated form oxidises readily and is implicated in comedone formation. The hydrogenated version (squalane) is not flagged",
  },
  {
    names: ["shea butter", /^butyrospermum parkii/, "argan oil", /^argania spinosa/, "marula oil"],
    confidence: "contested",
    reason:
      "Flagged by some acne clinics and explicitly cleared by others; widely tolerated in practice, so shown here rather than warned about",
  },
  {
    names: ["beeswax", "cera alba", "cera flava"],
    confidence: "contested",
    reason: "Occlusive by design, but the published lists disagree on whether it blocks follicles",
  },

  // ── Fatty acids and fatty alcohols ────────────────────────────────────────
  {
    names: ["myristic acid", "palmitic acid", "stearic acid"],
    confidence: "moderate",
    reason:
      "A saturated fatty acid of the kind found in sebum plugs; usually mild, and near the end of a list it is unlikely to matter",
  },
  {
    names: [/^(cetyl|stearyl|cetearyl|behenyl) alcohol$/],
    confidence: "contested",
    reason:
      "Fatty alcohols appear on some lists and are cleared by dermatology sources as non-drying emollients - included so the disagreement is visible",
  },

  // ── Colourants ────────────────────────────────────────────────────────────
  {
    names: [/^d&c red (no\.?\s*)?\d+$/, /^ci 1[56]\d{3}$/],
    confidence: "moderate",
    reason:
      "The D&C Red pigment series is flagged across the acne-clinic lists, most often in blushes, lipsticks and tinted bases",
  },

  // ── Silicones and salts, both contested ───────────────────────────────────
  {
    names: ["dimethicone", "cyclopentasiloxane", "dimethiconol"],
    confidence: "contested",
    reason:
      "Older lists flag silicones as occlusive; current dermatological consensus treats them as non-comedogenic. Shown for completeness only",
  },
  {
    names: ["sodium chloride", "potassium chloride"],
    confidence: "contested",
    reason:
      "Salt appears on several acne-clinic lists, usually attributed to irritation rather than to blocking a follicle",
  },
];

/** Matches an ingredient name against one entry's patterns. */
function entryMatches(entry: CloggerEntry, inciName: string): boolean {
  const name = inciName.trim().toLowerCase();
  return entry.names.some((pattern) =>
    typeof pattern === "string" ? name === pattern : pattern.test(name)
  );
}

/**
 * Every pore-clogging ingredient in a formula, in label order.
 *
 * Deliberately takes no profile: whether a formula contains a clogger is true
 * or false regardless of whose face it is going on. Personalisation belongs in
 * how loudly the result is presented, not in whether it is computed.
 *
 * Unrecognised ingredients are still checked. A name we could not match to the
 * dictionary can still be an exact string match here, and dropping it would
 * reintroduce a false negative through the back door.
 */
export function poreCloggingHits(ingredients: Ingredient[]): CloggerHit[] {
  const hits: CloggerHit[] = [];

  ingredients.forEach((ingredient, index) => {
    const entry = PORE_CLOGGERS.find((candidate) => entryMatches(candidate, ingredient.name));
    if (!entry) return;
    hits.push({
      name: ingredient.name,
      position: index + 1,
      total: ingredients.length,
      confidence: entry.confidence,
      reason: entry.reason,
    });
  });

  return hits;
}

/** True when this exact ingredient is flagged — for per-row highlighting. */
export function isPoreClogging(ingredient: Ingredient): boolean {
  return PORE_CLOGGERS.some((entry) => entryMatches(entry, ingredient.name));
}

/**
 * True when this exact ingredient is flagged with real confidence — for a
 * per-row *warning* badge specifically. Contested-only matches are excluded,
 * the same way `poreVerdict`'s `warned` list excludes them — a contested
 * entry is shown, never warned about. `isPoreClogging` stays inclusive of
 * contested matches for callers like the "Pore clogging" filter tab, where
 * surfacing every contested match for transparency is the point.
 */
export function isWarnedPoreClogging(ingredient: Ingredient): boolean {
  const entry = PORE_CLOGGERS.find((candidate) => entryMatches(candidate, ingredient.name));
  return entry !== undefined && entry.confidence !== "contested";
}

export type PoreVerdict =
  /** At least one flagged ingredient. `warned` excludes contested entries. */
  | { kind: "hits"; hits: CloggerHit[]; warned: CloggerHit[] }
  /** Nothing flagged, and enough of the list was recognised to say so. */
  | { kind: "clean" }
  /** Too little of the formula is known to make either claim. */
  | { kind: "unknown"; recognised: number; total: number };

/**
 * Below this share of recognised names, "no pore-clogging ingredients" is not a
 * finding — it is the absence of one. The external checkers return silence in
 * this case, which reads identically to good news; this is the state that stops
 * that happening. Mirrors `MIN_COVERAGE` in `lib/matching.ts`.
 */
const MIN_COVERAGE_TO_CLEAR = 0.5;

export function poreVerdict(ingredients: Ingredient[]): PoreVerdict {
  const hits = poreCloggingHits(ingredients);
  if (hits.length > 0) {
    return { kind: "hits", hits, warned: hits.filter((h) => h.confidence !== "contested") };
  }

  const recognised = ingredients.filter(isVerified).length;
  if (ingredients.length === 0 || formulaCoverage(ingredients) < MIN_COVERAGE_TO_CLEAR) {
    return { kind: "unknown", recognised, total: ingredients.length };
  }

  return { kind: "clean" };
}
