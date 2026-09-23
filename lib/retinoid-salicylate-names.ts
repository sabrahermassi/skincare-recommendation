/**
 * Retinoid and salicylate name patterns shared between `lib/rules.ts`
 * (scoring) and `lib/pregnancy-caution.ts` (pregnancy/breastfeeding
 * caution). The two consumers answer different questions — scoring groups
 * by irritation cost, pregnancy groups by clinical category — so this
 * module owns the matching *patterns*, not one shared membership list.
 * Each consumer composes the subset it needs.
 *
 * Deliberate one-sided exclusions (a name only one consumer needs) are
 * documented and enforced in
 * `__tests__/retinoid-salicylate-parity.test.ts`, not here.
 */

export const RETINOID_NAMES: (string | RegExp)[] = [
  "retinol",
  "retinal",
  "retinaldehyde",
  "hydroxypinacolone retinoate",
  "adapalene",
];

// Prescription-only actives — never on an OTC ingredient label, so scoring
// has no rule for them. Pregnancy guidance still applies if a compounded
// product lists one.
export const RETINOID_PRESCRIPTION_NAMES: string[] = ["tretinoin", "tazarotene"];

// Covers all four common retinyl esters generally, since pregnancy guidance
// applies regardless of how weakly a given ester converts. Scoring only
// rates retinyl palmitate specifically (RETINYL_PALMITATE_NAME), and at
// reduced weight, since it has its own weaker evidence.
export const RETINYL_ESTER_PATTERN = /^retinyl (palmitate|acetate|linoleate|propionate)$/;
export const RETINYL_PALMITATE_NAME = "retinyl palmitate";

// A retinoid ester distinct from the four RETINYL_ESTER_PATTERN esters above
// (it pairs retinol with retinoic acid, not a fatty acid) — kept out of
// RETINOID_NAMES on purpose, since scoring rates it on its own weight rather
// than at plain retinol's, see lib/rules.ts.
export const RETINYL_RETINOATE_NAME = "retinyl retinoate";

export const SALICYLATE_NAMES: (string | RegExp)[] = ["salicylic acid", "betaine salicylate"];

// Sodium and potassium salicylate are salicylate salts, not the free acid —
// unlike betaine salicylate, they don't hydrolyse to salicylic acid on skin.
// Pregnancy guidance still treats them as a salicylate exposure, but
// scoring's salicylic-acid rule is specifically about the acid's
// pore-clearing/exfoliating action, so this stays out of SALICYLATE_NAMES
// and out of rules.ts's composed list.
export const SALICYLATE_SALT_PATTERN = /^(sodium|potassium) salicylate$/;

// A marketing shorthand for salicylic acid (Beta Hydroxy Acid), sometimes
// printed on a label in place of the INCI name. Scoring recognises it;
// pregnancy caution doesn't need a separate entry since salicylic acid and
// betaine salicylate above already cover the acid itself.
export const SALICYLATE_ABBREVIATION_NAMES: string[] = ["bha"];

// English common names with no direct INCI/scoring equivalent — salicylic
// acid/betaine salicylate already cover the scored actives. `normalise`
// strips bracketed qualifiers, so a label printing "Salix Alba (Willow)
// Bark Extract" reaches the matcher as "salix alba bark extract" — that's
// the working entry. "willow bark extract" is the fallback: it only fires
// on a label that prints the bare common name with no genus, which costs
// nothing to keep.
export const SALICYLATE_FALLBACK_NAMES: string[] = ["salix alba bark extract", "willow bark extract"];

// A fragrance allergen (an ester of benzyl alcohol), not a source of
// salicylic acid. Deliberately excluded from SALICYLATE_NAMES — a suffix
// match here would wrongly flag a pregnancy caution for a fragrance note.
export const BENZYL_SALICYLATE_NAME = "benzyl salicylate";
