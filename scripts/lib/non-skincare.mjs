/**
 * Whether a catalogue product is something other than skincare (#299).
 *
 * OBF's `en:cleansers` category, which the import pages, also holds nail
 * polish removers and household cleaners. A September 2026 device QA found
 * "Dissolvant pour les ongles" (nail polish remover) and a "Multi-use Wood
 * Cleaning Spray" in the catalogue, scored against a skin profile.
 *
 * Three signals, any one enough:
 *   - OBF category tags — only known at import time; the `products` table does
 *     not keep them.
 *   - The product name, in the languages the catalogue actually holds —
 *     enough on its own for rows already imported.
 *   - The ingredient list, for hair dye (#420): a colouring kit is named by its
 *     shade ("Excellence Creme 4.11 Ash Brown") and often typed `moisturizer`,
 *     but its formula is not mistakable (see `hairDyeReason`).
 *
 * Deliberately narrow: nails, household cleaning, oral care and hair *dye*
 * kits. Hair and body care stays — the app scores shampoo, body wash and hand
 * cream on purpose (`contactWeight` in lib/rules.ts), and so a colour-care
 * mask or a shampoo "for coloured hair" is kept. Non-English names stay too
 * (owner decision, 26 Sep 2026); only what a product *is* is judged here.
 */

import { normalise } from "./inci-parse.mjs";

const CATEGORY = /(^|:)(nail-|nail$|household|cleaning-products|surface-cleaners|dishwashing|laundry|detergents|oral-care|toothpastes|mouthwashes|hair-dyes$)/;

const NAME = [
  /\bnail polish\b/i,
  /\bnail varnish\b/i,
  /\bdissolvant\b/i, // French: nail polish remover (not "démaquillant", make-up remover)
  /\bvernis\b/i, // French: nail varnish
  // Not bare "ongles" (nails): "Crème Mains et Ongles" is a hand & nail
  // cream, which stays (#312 review). Polish and remover are caught above.
  /\bfaux ongles\b/i, // French: false nails
  /\bnagellac?k/i, // German "Nagellack" and Dutch "nagellak": nail polish
  /\bquitaesmalte\b/i, // Spanish: nail polish remover
  /\bsmalto\b/i, // Italian: nail polish
  // The household word right before "cleaner"/"cleaning", which is how
  // household products are named; skincare says "cleanser"/"cleansing". A
  // looser match would delete "Glass Skin Cleansing Oil" (K-beauty "glass skin")
  // and "Cedar Wood Face Cleanser" (#312 review).
  /\b(wood|floor|kitchen|dish|laundry|surface|glass|oven|toilet|bathroom)\s+clean(er|ers|ing)\b/i,
  /\bdish(washing)? (soap|liquid)\b/i,
  /\blaundry\b/i,
  /\btoothpaste\b/i,
  /\bmouthwash\b/i,
  /\bdentifrice\b/i,
  // Hair dye (#420). Never the bare words "colour" or "color", which name
  // shampoos and masks for coloured hair; always the thing being sold.
  /\bhair[\s-]*dye\b/i,
  /\bhair[\s-]*colou?r[\s-]*(kit|cream|creme|gel|dye|developer)\b/i,
  /\bpermanent[\s-]+(hair[\s-]+)?colou?r\b/i,
  /\bcoloration\s+(permanente|capillaire|d'oxydation)\b/i, // French
  /\bteinture\s+(pour\s+)?cheveux\b/i, // French
  /\bhaar(farbe|f[äa]rbemittel|t[öo]nung|verf)\b/i, // German and Dutch
  /\btinte\s+(para\s+)?(el\s+)?(cabello|pelo|capilar)\b/i, // Spanish
  /\btintura\s+(per|para)\s+(i\s+)?(capelli|cabelo)\b/i, // Italian and Portuguese
  /\bsa[çc]\s*boyas[ıi]/i, // Turkish
];

/**
 * Oxidation hair-dye ingredients: the precursors and couplers of Annex III's
 * "hair dye substance in oxidative hair dye products" entries, by INCI name as
 * the consolidated Regulation (EC) No 1223/2009 (version 18.05.2026) prints
 * them, with the entry that lists each. Not the direct dyes or the solvents in
 * those entries (ethoxydiglycol is in half the moisturisers), and not the skin
 * lighteners that share a stem (phenylethyl resorcinol, hexylresorcinol,
 * 4-butylresorcinol are different names and are not here).
 */
export const OXIDATION_DYE_ENTRIES = [
    ["8a", ["p-phenylenediamine", "p-phenylenediamine hcl", "p-phenylenediamine sulfate"]],
    ["9a", ["toluene-2,5-diamine", "toluene-2,5-diamine sulfate"]],
    ["9b", ["2,6-dihydroxyethylaminotoluene"]],
    ["16", ["1-naphthol"]],
    ["22", ["resorcinol"]],
    ["198", ["n,n-bis(2-hydroxyethyl)-p-phenylenediamine sulfate"]],
    ["199", ["4-chlororesorcinol"]],
    ["206", ["hydroxyethyl-p-phenylenediamine sulfate"]],
    ["213", ["2-methyl-1-naphthol"]],
    ["217", ["m-aminophenol", "m-aminophenol hcl", "m-aminophenol sulfate"]],
    ["223", ["p-methylaminophenol", "p-methylaminophenol sulfate"]],
    ["226", ["1,3-bis-(2,4-diaminophenoxy)propane", "1,3-bis-(2,4-diaminophenoxy)propane hcl"]],
    ["229", ["2-methyl-5-hydroxyethyl aminophenol"]],
    ["241", ["4-amino-2-hydroxytoluene"]],
    ["242", ["2,4-diaminophenoxyethanol hcl", "2,4-diaminophenoxyethanol sulfate"]],
    ["243", ["2-methylresorcinol"]],
    ["244", ["4-amino-m-cresol"]],
    ["245", ["2-amino-4-hydroxyethylaminoanisole", "2-amino-4-hydroxyethylaminoanisole sulfate"]],
    ["272", ["p-aminophenol"]],
    ["285", ["2,6-diaminopyridine"]],
    ["292", ["2-methoxymethyl-p-phenylenediamine", "2-methoxymethyl-p-phenylenediamine sulfate"]],
];

/**
 * A name as the OBF import and the dictionary hold it: through the INCI
 * parser's own `normalise` (which drops a bracketed part, so "1,3-bis-(2,4-
 * diaminophenoxy)propane" is read as "1,3-bis- propane"), whichever way the
 * label spells the salt ("sulphate", "sulfate"), in any case.
 */
const dyeKey = (name) => normalise(name).replace(/sulphate/g, "sulfate");

const OXIDATION_DYES = new Map(OXIDATION_DYE_ENTRIES.flatMap(([entry, names]) => names.map((name) => [dyeKey(name), entry])));
// The parser also splits "N,N-bis(...)" at the letter-comma-letter, leaving this
// (found by Codex on #431; `__tests__/non-skincare.test.ts` pins every name through the parser).
OXIDATION_DYES.set("n-bis -p-phenylenediamine sulfate", "198");

/**
 * Whether the formula is a hair-dye kit, or null. Two or more of the dye
 * ingredients above (distinct Annex III entries: "m-aminophenol" and its salt
 * are one) — resorcinol alone is also in anti-dandruff and acne products — or
 * one of the two primary intermediates, p-phenylenediamine and
 * toluene-2,5-diamine, which are in nothing else.
 *
 * @param {string[]} ingredients INCI names, as the dictionary or the label holds them
 * @returns {string | null}
 */
function hairDyeReason(ingredients) {
  const found = new Map();
  for (const name of ingredients ?? []) {
    const entry = OXIDATION_DYES.get(dyeKey(name));
    if (entry && !found.has(entry)) found.set(entry, dyeKey(name));
  }
  const primary = found.has("8a") || found.has("9a");
  return primary || found.size >= 2 ? `hair dye ingredients (${[...found.values()].join(", ")})` : null;
}

/**
 * Why a product isn't skincare, or null when nothing says so.
 *
 * @param {{ name?: string | null, categories?: string[] | null, ingredients?: string[] | null }} product
 * @returns {string | null}
 */
export function nonSkincareReason({ name, categories, ingredients }) {
  const tag = (categories ?? []).find((c) => CATEGORY.test(c));
  if (tag) return `category ${tag}`;
  const pattern = NAME.find((p) => p.test(name ?? ""));
  if (pattern) return `name matches ${pattern}`;
  return ingredients ? hairDyeReason(ingredients) : null;
}
