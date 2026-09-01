/**
 * Canonical INCI-label parsing.
 *
 * Ingredient text reaches us from three places and all three are messy:
 * crowdsourced Open Beauty Facts entries (frequently OCR-mangled at source),
 * a photographed label, and hand-curated rows. This is the one definition of
 * how a printed list becomes an ordered array of names.
 *
 * `supabase/functions/label-ocr/index.ts` and the import scripts hold copies,
 * because a Deno edge runtime and plain .mjs scripts cannot import this module
 * without a build step. Those copies must be kept in step with this one — it
 * is the version under test.
 */

/**
 * Reduce a printed fragment to the form the ingredient dictionary is keyed on.
 *
 * Real labels carry decoration the dictionary does not: bracketed botanical
 * qualifiers, asterisks marking organic content, trailing percentages.
 */
export function normalise(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/g, "");
}

export type ParsedIngredient = { inci_name: string; position: number };

/**
 * Extract the ordered ingredient list from a block of label text.
 *
 * Position is preserved because INCI order is regulated information —
 * descending concentration — and the verdict engine weights by it. A photo
 * also catches claims, directions and small print, so the list is isolated
 * from an "Ingredients:" heading where one exists (including the Korean
 * 전성분) and truncated at the next section heading.
 */
export function parseIngredientBlock(text: string): ParsedIngredient[] {
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ");

  const heading = /(?:ingredients?|전성분|성분)\s*[:：]?\s*/i.exec(flat);
  let block = heading ? flat.slice(heading.index + heading[0].length) : flat;

  const stop = /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법)/i.exec(block);
  if (stop) block = block.slice(0, stop.index);

  return block
    .split(/[,;•·]/)
    .map(normalise)
    .filter((n) => n.length > 1 && n.length < 120 && /[a-z]/.test(n))
    .map((inci_name, position) => ({ inci_name, position }));
}
