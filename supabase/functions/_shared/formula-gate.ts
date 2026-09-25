// Whether a barcode source's ingredient text is good enough to store (#184).
//
// `product-lookup` used to store anything with a name and one parsed fragment
// — and an Open Beauty Facts row permanently, since ODbL lets us keep it. OBF
// is crowdsourced: edit an entry there, scan the barcode once, and the app
// answered every later scan of it with that text for good. This is the same
// bar `label-ocr` and the importers already hold a formula to.
//
// Plain TypeScript with the database passed in, so Jest runs the exact logic
// Deno does (`__tests__/formula-gate.test.ts`).

import { MIN_KNOWN_INGREDIENT_RATIO, gateRatio } from "./gate-ratio.ts";
import { parseIngredientBlock, type ParsedIngredient } from "./inci-parse.ts";

export type FormulaSources = {
  /** Which of these names are verified dictionary entries. Proportional to the formula. */
  known(names: string[]): Promise<Set<string>>;
  /** The whole dictionary and its synonyms — a full table scan, so only asked for on a failing gate. */
  dictionary(): Promise<{ dictionary: Set<string>; aliases: Map<string, string> }>;
};

export type FormulaRead =
  | {
      ok: true;
      ingredients: ParsedIngredient[];
      /**
       * The parser this formula was read with, for `isParserOnlyChange`: a
       * formula repaired with the dictionary has to be compared against the
       * stored one through the same dictionary, or the repair itself would
       * read as a reformulation.
       */
      reparse: (text: string) => ParsedIngredient[];
    }
  /** No ingredient at all in the text — no formula, as before. */
  | { ok: false; reason: "empty" }
  /** Text that parses, but mostly into names the dictionary doesn't hold. */
  | { ok: false; reason: "gated" };

/**
 * Reads `text` the cheap way first and gates it. Only when that fails is the
 * dictionary loaded and the text read again with every repair — common names,
 * spacing, slash lists, run-together names, typos — keeping the second read
 * only if it recognises at least as much as the first. `label-ocr` has the
 * same shape for the same reason: a well-formed list never pays for the table
 * scan.
 */
export async function readFormula(text: string, sources: FormulaSources): Promise<FormulaRead> {
  const plain = (t: string) => parseIngredientBlock(t);
  let ingredients = plain(text);
  if (ingredients.length === 0) return { ok: false, reason: "empty" };
  let known = await sources.known(ingredients.map((p) => p.inci_name));
  if (gateRatio(ingredients, known) >= MIN_KNOWN_INGREDIENT_RATIO) {
    return { ok: true, ingredients, reparse: plain };
  }

  const { dictionary, aliases } = await sources.dictionary();
  // A synonym is matchable in its own right, then resolved to the canonical
  // name on the way out — as in `label-ocr`.
  for (const synonym of aliases.keys()) dictionary.add(synonym);
  const repaired = (t: string) => parseIngredientBlock(t, dictionary, aliases);
  let reparse = plain;
  const reread = repaired(text);
  if (reread.length > 0) {
    const rereadKnown = await sources.known(reread.map((p) => p.inci_name));
    if (gateRatio(reread, rereadKnown) >= gateRatio(ingredients, known)) {
      ingredients = reread;
      known = rereadKnown;
      reparse = repaired;
    }
  }
  return gateRatio(ingredients, known) >= MIN_KNOWN_INGREDIENT_RATIO
    ? { ok: true, ingredients, reparse }
    : { ok: false, reason: "gated" };
}
