/**
 * Whether a catalogue product is something other than skincare (#299).
 *
 * OBF's `en:cleansers` category, which the import pages, also holds nail
 * polish removers and household cleaners. A September 2026 device QA found
 * "Dissolvant pour les ongles" (nail polish remover) and a "Multi-use Wood
 * Cleaning Spray" in the catalogue, scored against a skin profile.
 *
 * Two signals, either enough:
 *   - OBF category tags — only known at import time; the `products` table does
 *     not keep them.
 *   - The product name, in the languages the catalogue actually holds —
 *     enough on its own for rows already imported.
 *
 * Deliberately narrow: nails, household cleaning and oral care. Hair and body
 * products stay — the app scores shampoo, body wash and hand cream on purpose
 * (`contactWeight` in lib/rules.ts). Non-English names stay too (owner
 * decision, 26 Sep 2026); only what a product *is* is judged here.
 */

const CATEGORY = /(^|:)(nail-|nail$|household|cleaning-products|surface-cleaners|dishwashing|laundry|detergents|oral-care|toothpastes|mouthwashes)/;

const NAME = [
  /\bnail polish\b/i,
  /\bnail varnish\b/i,
  /\bdissolvant\b/i, // French: nail polish remover (not "démaquillant", make-up remover)
  /\bvernis\b/i, // French: nail varnish
  // Not bare "ongles" (nails): "Crème Mains et Ongles" is a hand & nail
  // cream, which stays (#312 review). Polish and remover are caught above.
  /\bfaux ongles\b/i, // French: false nails
  /\bnagellack/i, // German: nail polish
  /\bquitaesmalte\b/i, // Spanish: nail polish remover
  /\bsmalto\b/i, // Italian: nail polish
  /\b(wood|floor|kitchen|dish|laundry|surface|glass|oven|toilet|bathroom)\b.*\bclean/i,
  /\bdish(washing)? (soap|liquid)\b/i,
  /\blaundry\b/i,
  /\btoothpaste\b/i,
  /\bmouthwash\b/i,
  /\bdentifrice\b/i,
];

/**
 * Why a product isn't skincare, or null when nothing says so.
 *
 * @param {{ name?: string | null, categories?: string[] | null }} product
 * @returns {string | null}
 */
export function nonSkincareReason({ name, categories }) {
  const tag = (categories ?? []).find((c) => CATEGORY.test(c));
  if (tag) return `category ${tag}`;
  const pattern = NAME.find((p) => p.test(name ?? ""));
  return pattern ? `name matches ${pattern}` : null;
}
