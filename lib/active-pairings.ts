import type { Ingredient } from "@/data/types";
import { AHA_NAMES } from "./aha-names";
import { RETINOID_ACTIVE_PATTERNS, SALICYLATE_ABBREVIATION_NAMES, SALICYLATE_NAMES } from "./retinoid-salicylate-names";
import { INGREDIENT_RULES, nameMatches } from "./rules";

/**
 * Active-pairing flags and the one timing note (`FOR_ME_MVP.md` §25, #233):
 * which actives tend to add up to more irritation when used together, and
 * which belong in an evening routine.
 *
 * Ingredient-to-ingredient, so it lives here rather than on `IngredientRule`:
 * every rule in `lib/rules.ts` is ingredient-to-*person* scoring evidence,
 * and a pairing is a different relation with its own evidence. Detection
 * takes no profile and checks every ingredient — whether two actives are in
 * a formula is true regardless of who's asking.
 *
 * No score effect, no verdict effect, no cap — the same as
 * `lib/pregnancy-caution.ts` and `lib/context-nudges.ts`. Each product has
 * already been scored on its own actives; charging the pairing too would
 * bill the same retinoid twice.
 *
 * Evidence tiers follow `lib/pore-clogging.ts`: a `contested` pairing is kept
 * in the table so nobody re-adds it, and is never shown — the same answer
 * `CLOGGER_WEIGHT` gives a contested clogger. Sources live here, in code;
 * "FDA" in user-facing copy trips the claims policy's regulatory-endorsement
 * rule, and the copy states what tends to happen, not who said so.
 *
 * Timing is a statement about the active, never a schedule: the app doesn't
 * know when anyone uses anything (routine steps are #227), and nothing here
 * reads the clock.
 */

export type PairingConfidence = "high" | "moderate" | "contested";

type Active = {
  /** How the active reads mid-sentence, e.g. "a retinoid", "AHAs". */
  noun: string;
  names: readonly (string | RegExp)[];
};

export type ActivePairing = {
  id: string;
  a: Active;
  b: Active;
  confidence: PairingConfidence;
  /** Where the pairing comes from. Code only — never rendered. */
  source: string;
};

/** A line for the result screen or the shelf, in `ContextNudge`'s shape. */
export type PairingNote = {
  id: string;
  label: string;
  /** Shown verbatim. Audited by `__tests__/claims-policy.test.ts`. */
  text: string;
};

// Read off the curated rule rather than hand-copied, so a name added to the
// scoring rule reaches the pairing too.
function ruleNames(anchor: string): readonly (string | RegExp)[] {
  const rule = INGREDIENT_RULES.find((candidate) => candidate.names.includes(anchor));
  if (!rule) throw new Error(`No ingredient rule names "${anchor}"`);
  return rule.names;
}

const RETINOID: Active = { noun: "a retinoid", names: RETINOID_ACTIVE_PATTERNS };
const BHA: Active = { noun: "BHA", names: [...SALICYLATE_NAMES, ...SALICYLATE_ABBREVIATION_NAMES] };
const AHA: Active = { noun: "AHAs", names: AHA_NAMES };
const SULFUR: Active = { noun: "sulfur", names: ruleNames("sulfur") };
const BENZOYL_PEROXIDE: Active = { noun: "benzoyl peroxide", names: ruleNames("benzoyl peroxide") };
// The folklore is about the acidic L-form specifically, so the stable
// derivatives (ascorbyl glucoside and friends) aren't part of it.
const VITAMIN_C: Active = { noun: "vitamin C", names: ruleNames("ascorbic acid") };
const NIACINAMIDE: Active = { noun: "niacinamide", names: ruleNames("niacinamide") };

// The tretinoin (Retin-A) US prescribing label, Precautions: "Particular
// caution should be exercised in using preparations containing sulfur,
// resorcinol, or salicylic acid with RETIN-A", and caution with "soaps and
// cosmetics that have a strong drying effect".
const TRETINOIN_LABEL =
  "Retin-A (tretinoin) US prescribing information, Precautions — accessdata.fda.gov/drugsatfda_docs/label/2002/16921s21s22s25lbl.pdf";

export const ACTIVE_PAIRINGS: readonly ActivePairing[] = [
  {
    id: "retinoid-bha",
    a: RETINOID,
    b: BHA,
    confidence: "high",
    source: `${TRETINOIN_LABEL} — names salicylic acid specifically.`,
  },
  {
    id: "retinoid-aha",
    a: RETINOID,
    b: AHA,
    confidence: "moderate",
    source:
      `${TRETINOIN_LABEL} — its general caution on drying/irritating products, not AHAs by name; ` +
      "AHAs carry their own irritation cost (see their rule in lib/rules.ts). Moderate because no label names the pair.",
  },
  {
    id: "retinoid-benzoyl-peroxide",
    a: RETINOID,
    b: BENZOYL_PEROXIDE,
    confidence: "moderate",
    source:
      `${TRETINOIN_LABEL} — its caution on products with a strong drying effect, which benzoyl peroxide is. ` +
      "Martin et al. 1998, Br J Dermatol 139 Suppl 52:8, also found tretinoin degraded by benzoyl peroxide under light " +
      "(adapalene was stable); later optimised tretinoin gels didn't degrade, so breakdown is formulation-dependent and " +
      "isn't claimed in copy — only the irritation stacking is.",
  },
  {
    id: "retinoid-sulfur",
    a: RETINOID,
    b: SULFUR,
    confidence: "high",
    source: `${TRETINOIN_LABEL} — names sulfur specifically.`,
  },
  {
    id: "vitamin-c-niacinamide",
    a: VITAMIN_C,
    b: NIACINAMIDE,
    confidence: "contested",
    source:
      "The 'vitamin C cancels out niacinamide' claim traces to 1960s work on unformulated ascorbic acid and " +
      "niacinamide heated at low pH with no buffer, not to formulated products at skin temperature. Kept here so " +
      "it isn't re-added; never shown.",
  },
];

// The evening note. The tretinoin label above: "should be applied once a day,
// before retiring"; retinoid directions are generally written the same way.
const RETINOID_EVENING: PairingNote = {
  id: "retinoid-evening",
  label: "evening",
  text: "Retinoids usually belong in an evening routine — it's how their directions are normally written.",
};

const SHOWN = ACTIVE_PAIRINGS.filter((pairing) => pairing.confidence !== "contested");

const EFFECT = "can add up to more dryness and irritation";
// A list carries no concentrations, and stacking depends on them.
const HEDGE = "How much depends on strengths a label doesn't show.";

function has(ingredients: readonly Ingredient[], active: Active): boolean {
  return ingredients.some((ingredient) => nameMatches(active.names, ingredient.name));
}

function joinOr(words: string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

function joinAnd(words: string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * The notes for one product: the evening note if it has a retinoid, and one
 * layering line naming every active it tends to stack with. Never a
 * pairing inside the formula itself — the formulator chose that balance, and
 * a pairing is about two products used together.
 */
export function pairingNotesFor(ingredients: readonly Ingredient[]): PairingNote[] {
  const partners: string[] = [];
  const addPartner = (noun: string) => {
    if (!partners.includes(noun)) partners.push(noun);
  };
  // Side A's partners first, then side B's, so a formula with both sides
  // reads "BHA, AHAs … or a retinoid" rather than interleaving them.
  for (const pairing of SHOWN) if (has(ingredients, pairing.a)) addPartner(pairing.b.noun);
  for (const pairing of SHOWN) if (has(ingredients, pairing.b)) addPartner(pairing.a.noun);

  const notes: PairingNote[] = [];
  if (has(ingredients, RETINOID)) notes.push(RETINOID_EVENING);
  if (partners.length > 0) {
    notes.push({
      id: "layering",
      label: "layering",
      text: `Using this alongside another product with ${joinOr(partners)} ${EFFECT} than either on its own. ${HEDGE}`,
    });
  }
  return notes;
}

type ShelfProduct = { id: string; name: string; ingredients: readonly Ingredient[] };

/**
 * Pairings across the shelf: one line per two saved products whose actives
 * tend to stack. Computed from whatever is saved on this device, so it needs
 * no account. A shelf is small; every pair is checked.
 */
export function shelfPairingNotes(products: readonly ShelfProduct[]): PairingNote[] {
  const notes: PairingNote[] = [];
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const first = products[i];
      const second = products[j];
      // Grouped by side A's noun, so a retinoid facing BHA and AHAs reads as
      // one sentence rather than two.
      const partnersBySide = new Map<string, string[]>();
      for (const pairing of SHOWN) {
        const matched =
          (has(first.ingredients, pairing.a) && has(second.ingredients, pairing.b)) ||
          (has(first.ingredients, pairing.b) && has(second.ingredients, pairing.a));
        if (!matched) continue;
        const partners = partnersBySide.get(pairing.a.noun) ?? [];
        if (!partners.includes(pairing.b.noun)) partners.push(pairing.b.noun);
        partnersBySide.set(pairing.a.noun, partners);
      }
      if (partnersBySide.size === 0) continue;

      const combos = [...partnersBySide].map(([side, partners]) => `${side} with ${joinAnd(partners)}`);
      notes.push({
        id: `${first.id}+${second.id}`,
        label: `${first.name} + ${second.name}`,
        text: `Between them, these bring together ${joinAnd(combos)}, which ${EFFECT} when they're used at the same time. ${HEDGE}`,
      });
    }
  }
  return notes;
}
