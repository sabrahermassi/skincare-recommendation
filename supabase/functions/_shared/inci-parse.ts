// The ingredient-list parser every Deno writer reads through: `label-ocr`
// (a photographed label) and `product-lookup` (a barcode's Open Beauty Facts
// or INCI API text). Moved here verbatim from `label-ocr/index.ts` (#184) —
// `product-lookup` had its own smaller `parseInci`, with no dictionary repair,
// no synonyms and no run-together or slash splitting, and it had already
// drifted once (`dedupe()` never reached it).
//
// It imports nothing and touches no Deno global: the dictionary and aliases
// arrive as arguments, and the caller fetches them. `lib/inci.ts` (the client)
// and `scripts/lib/inci-parse.mjs` (the importers) cannot import Deno code,
// so they stay separate copies — `__tests__/inci-parser-parity.test.ts` holds
// all three in step against this file.


export type ParsedIngredient = { inci_name: string; position: number };

const MIN_DELIMITED_TOKENS = 4;
const MAX_WINDOW_WORDS = 6;

/**
 * Split a printed list on its separators.
 *
 * A full stop followed by a space also separates: some labels print
 * "Benzoic Acid. Caprylyl Glycol. Glycerin." with no commas at all, and read as
 * one token that was long enough to be thrown away as a sentence.
 *
 * A comma sitting directly between two digits belongs to the name, not to the
 * list: "1,2-Hexanediol" is one ingredient, and splitting there produced a bare
 * "1" and a "2-hexanediol" that matches nothing — the most common bad name in
 * the catalogue. A comma with a letter or nothing on either side is a real
 * separator, so both sides have to be checked, not just the one after — a
 * lookahead alone let "Water,4-Terpineol" fuse into one token. The check is
 * done via the match offset against the original text rather than a
 * lookbehind, which not every runtime this parser has to run on supports.
 */
export function splitOnSeparators(text: string): string[] {
  // U+E000, the first Private Use Area codepoint — never appears in printed
  // ingredient text, so it is safe as a one-character sentinel standing in
  // for a protected comma while the real separators are split on.
  const PLACEHOLDER = "";
  // A full stop inside brackets ("(Vit. E)") is part of the qualifier, not the
  // end of a name; the same length-preserving stand-in keeps the offsets below
  // valid.
  const bracketGuarded = text.replace(/\([^)]*\)/g, (group) => group.replace(/\./g, "\uE001"));
  // An abbreviation's own full stop is not a separator either: "Vit. E", or a genus
  // abbreviated at the start of an item ("C. Sinensis Leaf Extract"). A lone letter
  // after other words ("Vitamin E. Glycerin") does end a name, so only an
  // item-initial letter is protected.
  const guarded = bracketGuarded.replace(
    /(^|[;•·,.]\s*)[A-Za-z]\.(?=\s)|\b(?:vit|spp|sp|var|ssp|subsp)\.(?=\s)/gi,
    (stop: string) => stop.replace(/\.$/, "\uE001")
  );
  const protectedText = guarded.replace(/,(?=\d)/g, (match, offset: number) =>
    offset > 0 && /\d/.test(text[offset - 1]) ? PLACEHOLDER : match
  );
  return protectedText
    // U+3001, the ideographic (full-width) comma, is the separator standard
    // Japanese ingredient lists actually print ("水、グリセリン") -- the ASCII
    // comma never appears in one at all, so without this every such label
    // produced a single unsplittable block instead of real tokens.
    .split(/[;•·、]|,|\.(?=\s)/)
    .map((s) => s.replace(new RegExp(PLACEHOLDER, "g"), ",").replace(//g, "."));
}

/**
 * Ceiling on the words reconstruction will consider. Reconstruction checks
 * every window against a dictionary of tens of thousands of names with a fuzzy
 * pass behind it, so if the block boundary is ever missed and the "block"
 * becomes the whole label, the work grows with it — a real request died on this
 * function's compute limit exactly that way. No ingredient list runs this long.
 */
const MAX_RECONSTRUCTED_WORDS = 400;

/**
 * Ceiling on fuzzy-match attempts across one `reconstructFromDictionary`
 * call — bounds the same unmatched-run cost `MAX_RECONSTRUCTED_WORDS` bounds
 * for word count, since a long unmatched run can still call `fuzzyLookup`
 * many times per word without it. Kept in step with `lib/inci.ts`.
 */
const MAX_FUZZY_ATTEMPTS_PER_BLOCK = 800;

/**
 * Whether a parsed fragment can be an ingredient name at all.
 *
 * The last line of defence for text that reached the name filter without a
 * heading to strip: a label section ("package labeling: label.jpg"), a file
 * name from a mis-scanned photo, or a paragraph of marketing copy. None of
 * those is a name, and a stub written for one sits in the shared dictionary
 * until somebody deletes it by hand.
 *
 * A colon between two digits is kept — "ci 77268:1" and "pigment red 57:1" are
 * real colour-index names. Any other colon is a heading that leaked into the
 * name. Eight words clears every name a label is likely to print and stays
 * below the sentences found in the dictionary; a few dictionary entries run
 * longer (fermented extracts naming dozens of species), but a caller that
 * holds the dictionary checks it first, so a known long name never reaches this,
 * and one that does not passes `allowLong`, which skips the word limit and nothing else. An HTML entity ("&lt;") or a run of seven digits
 * (a barcode, a batch number) is packaging text that OCR or a paste carried in,
 * as is a web address or e-mail, and a fragment that opens with the word
 * "ingredients" is a footnote about the list, not a member of it.
 */
export function isPlausibleIngredientName(name: string, allowLong = false): boolean {
  if (/[:：]/.test(name.replace(/\d[:：]\d/g, ""))) return false;
  if (/\.(?:jpe?g|png|gif|webp|pdf)\b/i.test(name)) return false;
  if (/&(?:lt|gt|amp|quot|nbsp|#\d+)\b|[<>]/i.test(name)) return false;
  if (/\d{7,}/.test(name)) return false;
  if (/\bwww\.|https?:|@|\.(?:com|net|org)\b/i.test(name)) return false;
  if (/^ingr[eé]dients?\b/i.test(name)) return false;
  return allowLong || name.split(/\s+/).length <= 8;
}

/**
 * Find where the ingredient list starts without knowing the heading's language.
 *
 * Ingredient names are international — Aqua, Glycerin, Sodium Chloride read the
 * same on a French, Croatian or Romanian label — so the list can be recognised
 * by what it contains rather than by the word printed above it. Walks the text
 * one colon-delimited piece at a time and returns everything from the first
 * piece that is mostly known ingredients. `null` means there was nothing to
 * find: no colon, no piece that clears the bar, or the list already opens the
 * text, and the caller's heading pattern stays in charge. A piece that holds
 * some known ingredients but not enough is part of the list, cut by a stray
 * colon in a garbled scan, not a heading — skipping it would drop the start of
 * the formula, so the search stops there instead.
 *
 * Everything after the chosen piece is kept, so a colon inside the list itself
 * ("Parfum (Fragrance: Linalool, Limonene)") cannot cut it short. A colon
 * directly before a digit is part of a name ("ci 77268:1"), not a heading.
 */
export function findListByDictionary(flat: string, dictionary: ReadonlySet<string>, aliases?: ReadonlyMap<string, string>): string | null {
  const colon = /[:：](?!\d)/g;
  let start = 0;
  for (;;) {
    const match = colon.exec(flat);
    const names = flat.slice(start, match ? match.index : flat.length).split(/[;•·,]/)
      .map(normalise)
      .filter((n) => n.length > 1);
    const known = names.filter((n) => dictionary.has(n) || aliases?.has(n)).length;
    if (known >= 3 && known / names.length >= 0.5) return start === 0 ? null : flat.slice(start);
    if (known > 0 || !match) return null;
    start = match.index + match[0].length;
  }
}

/**
 * Dictionary names indexed two ways for the delimited path, built once per
 * dictionary. A `WeakMap` keyed on the set itself: an importer reads the
 * dictionary once and parses hundreds of products against it, and an Edge
 * Function request builds its own set, so neither pays twice.
 */
const squashIndexCache = new WeakMap<ReadonlySet<string>, Map<string, string[]>>();
const lengthIndexCache = new WeakMap<ReadonlySet<string>, Map<number, string[]>>();

/**
 * A name reduced to its letters and digits: "methyl styrene", "methylstyrene"
 * and "methyl-styrene" are one key. Labels and the dictionary disagree about
 * spaces and punctuation far more often than about spelling, and digits stay
 * in the key so "peg-4" and "peg-40" can never meet.
 *
 * CJK characters are kept alongside `[a-z0-9]` rather than stripped with
 * everything else (#185; found in review on #247): stripping them collapsed
 * every pure-Hangul/kana/Han string to the same empty key, so once real
 * Korean/Japanese synonyms exist in the dictionary (the point of #185),
 * `squashIndex`'s `""` bucket would hold all of them together regardless of
 * content, and `resolveKnownName`'s fuzzy tie-break would pick the nearest
 * one across that whole undifferentiated bucket instead of narrowing to
 * same-content candidates the way a Latin name already does.
 */
export function squashKey(name: string): string {
  return name.replace(/[^a-z0-9\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu, "");
}

export function squashIndex(dictionary: ReadonlySet<string>): Map<string, string[]> {
  const cached = squashIndexCache.get(dictionary);
  if (cached) return cached;
  const index = new Map();
  for (const entry of dictionary) {
    const key = squashKey(entry);
    const bucket = index.get(key);
    if (bucket) bucket.push(entry);
    else index.set(key, [entry]);
  }
  squashIndexCache.set(dictionary, index);
  return index;
}

export function lengthIndex(dictionary: ReadonlySet<string>): Map<number, string[]> {
  const cached = lengthIndexCache.get(dictionary);
  if (cached) return cached;
  const index = new Map();
  for (const entry of dictionary) {
    const bucket = index.get(entry.length);
    if (bucket) bucket.push(entry);
    else index.set(entry.length, [entry]);
  }
  lengthIndexCache.set(dictionary, index);
  return index;
}

const COMMON_NAMES = new Map([
  ["flavor", "aroma"],
  ["flavour", "aroma"],
  ["perfume", "parfum"],
  ["fragrance", "parfum"],
  ["purified water", "aqua"],
  ["deionized water", "aqua"],
  ["demineralized water", "aqua"],
  ["distilled water", "aqua"],
  ["glycerine", "glycerin"],
  ["glycerol", "glycerin"],
  ["petroleum jelly", "petrolatum"],
  ["mineral oil", "paraffinum liquidum"],
  ["jojoba oil", "simmondsia chinensis seed oil"],
  ["jojoba seed oil", "simmondsia chinensis seed oil"],
  ["apricot kernel oil", "prunus armeniaca kernel oil"],
  ["evening primrose oil", "oenothera biennis oil"],
  ["argan oil", "argania spinosa kernel oil"],
  ["argan kernel oil", "argania spinosa kernel oil"],
  ["olive oil", "olea europaea fruit oil"],
  ["olive fruit oil", "olea europaea fruit oil"],
  ["rosehip oil", "rosa canina fruit oil"],
  ["rosehip fruit extract", "rosa canina fruit extract"],
  ["mango fruit extract", "mangifera indica fruit extract"],
  ["mango butter", "mangifera indica seed butter"],
  ["shea butter", "butyrospermum parkii butter"],
  ["coconut oil", "cocos nucifera oil"],
  ["sweet almond oil", "prunus amygdalus dulcis oil"],
  ["almond oil", "prunus amygdalus dulcis oil"],
  ["avocado oil", "persea gratissima oil"],
  ["castor oil", "ricinus communis seed oil"],
  ["grapeseed oil", "vitis vinifera seed oil"],
  ["grape seed oil", "vitis vinifera seed oil"],
  ["sunflower oil", "helianthus annuus seed oil"],
  ["sunflower seed oil", "helianthus annuus seed oil"],
  ["tea tree oil", "melaleuca alternifolia leaf oil"],
  ["lavender oil", "lavandula angustifolia oil"],
  ["candelilla wax", "euphorbia cerifera cera"],
  ["euphorbia cerifera wax", "euphorbia cerifera cera"],
  ["carnauba wax", "copernicia cerifera cera"],
  ["kojic acid dipalmitate", "kojic dipalmitate"],
  ["octyl salicylate", "ethylhexyl salicylate"],
  ["octyl methoxycinnamate", "ethylhexyl methoxycinnamate"],
  ["vitamin e", "tocopherol"],
  ["vitamin e acetate", "tocopheryl acetate"],
  ["vitamin c", "ascorbic acid"],
  ["vitamin b5", "panthenol"],
]);

const SYNONYM_GROUPS = [
  ["aqua", "water", "eau", "ater", "agua"],
  ["parfum", "fragrance"],
  ["ci 77891", "titanium dioxide"],
];

/**
 * What labels print in place of the INCI name, for the ordinary ingredients
 * people name by their common name: "jojoba seed oil" is
 * `simmondsia chinensis seed oil`, "flavor" is `aroma`. The dictionary is keyed
 * on INCI, so none of these matches as written, and they are the largest group
 * of misses that are not spelling.
 *
 * Only unambiguous ones. "Iron oxides" is three different colour indexes and
 * "citrus aurantium peel oil" is two different oranges, so neither is here — a
 * wrong mapping attaches another ingredient's safety note, which is worse than
 * a miss. The caller checks the target is in the dictionary, so an entry whose
 * target is absent does nothing.
 */
export function commonNameFor(name: string): string | undefined {
  return COMMON_NAMES.get(name);
}

/**
 * Map a delimited name the dictionary does not hold to the one it does.
 *
 * `matchWindow` already knows two printed-label habits, but only runs when the
 * list had no delimiters at all. A list split cleanly on commas skipped both,
 * so "aqua/water/eau" and "gly cerin" reached the dictionary as-is and missed.
 * In order, and each only when the one before found nothing:
 *
 *  - a British spelling: "sulphate" is `sulfate`;
 *  - a common name from `commonNameFor`;
 *  - the same letters and digits under different spacing or punctuation
 *    ("gly cerin", "methylstyrene" for `methyl styrene`, "acryloyldimethyl
 *    taurate" for `acryloyldimethyltaurate`) — through `squashIndex`, so it is
 *    one lookup, and when the dictionary holds the name more than once the one
 *    fewest edits from what was printed wins;
 *  - a unit annotation ("homosalate w/w") or an unclosed bracket ("aqua
 *    (water"): both are dropped from the end of the name;
 *  - "/" separating names for ONE ingredient: "aqua/water/eau" is aqua, and
 *    "iron oxides/ci 77491" is ci 77491. One part must be a known name or an
 *    alias, and each other part a known name, an alias, or a single word. A
 *    last part ending in polymer, resin or esters is held to that bar strictly,
 *    because those are the single real names that merely contain a
 *    slash ("hydroxyethyl acrylate/sodium acryloyldimethyl taurate
 *    copolymer"); anywhere else an unfamiliar translated part ("huile
 *    minerale") is fine, since the list was already split on commas and there is
 *    nothing after the slash to swallow.
 *
 * A name already in the dictionary, or matching none of these, comes back
 * unchanged.
 */
export function resolveKnownName(name: string, dictionary: ReadonlySet<string>, aliases?: ReadonlyMap<string, string>): string {
  if (dictionary.has(name)) return name;
  // A unit the label printed after the name ("homosalate w/w"), then a bracket
  // it never closed ("aqua (water"): normalise only removes a matched pair, so
  // the open half is still on the end of the name.
  const base = name
    .replace(/\s+w\/[wv]$/, "")
    .replace(/\s*\d+(?:[.,]\d+)?\s*(?:mg|g|ml|%)(?:\s*\/\s*(?:\d+\s*)?(?:mg|g|ml))?$/, "")
    .replace(/\s*\(.*$/, "")
    .replace(/\)+$/, "");
  if (base !== name && dictionary.has(base)) return base;
  const spelled = base.replace(/sulph/g, "sulf");
  if (dictionary.has(spelled)) return spelled;
  const common = commonNameFor(spelled);
  if (common && dictionary.has(common)) return common;
  const squashed = squashIndex(dictionary).get(squashKey(spelled));
  if (squashed) {
    let best = squashed[0];
    for (const candidate of squashed) {
      if (levenshtein(candidate, name, 99) < levenshtein(best, name, 99)) best = candidate;
    }
    return best;
  }
  if (base.includes("/")) {
    const parts = base.split("/").map(normalise);
    // A common name whose target the dictionary holds counts as known too, or
    // "aqua / petroleum jelly" would fold into aqua and lose the petrolatum.
    const isKnown = (part: string) => dictionary.has(part) || (aliases?.has(part) ?? false) || dictionary.has(commonNameFor(part) ?? "");
    const anchor = parts.find(isKnown);
    const strict = /(?:polymer|resin|esters?)$/.test(parts[parts.length - 1]);
    // A known part folds into the anchor only when it names the same ingredient
    // ("aqua/water"); "aqua / glycerin" is two ingredients and stays as it is.
    const canonical = (part: string) => aliases?.get(part) ?? commonNameFor(part) ?? part;
    const anchorName = canonical(anchor ?? "");
    const sameIngredient = (part: string) =>
      canonical(part) === anchorName || SYNONYM_GROUPS.some((group) => group.includes(canonical(part)) && group.includes(anchorName));
    const restIsPlausible = parts.every(
      (part) => part === anchor || (part.length > 1 && (isKnown(part) ? sameIngredient(part) : !part.includes(" ") || !strict))
    );
    if (parts.length > 1 && anchor && restIsPlausible) return dictionary.has(anchor) ? anchor : canonical(anchor);
  }
  return name;
}

/**
 * A token that lists several ingredients with a slash where a comma belongs:
 * "aqua / glycerin". Returned as its separate names when every part is a known
 * name or an alias of one, and the token as it was otherwise. It runs only after
 * `resolveKnownName` has left the token alone, so parts that name one ingredient
 * ("aqua/water") were already folded into it and never get here.
 */
export function splitSlashList(name: string, dictionary: ReadonlySet<string>, aliases?: ReadonlyMap<string, string>): string[] {
  if (!name.includes("/")) return [name];
  const parts = name.split("/").map(normalise).filter((part: string) => part.length > 1);
  if (parts.length < 2) return [name];
  const resolved: string[] = [];
  for (const part of parts) {
    const target = dictionary.has(part) ? part : (aliases?.get(part) ?? commonNameFor(part));
    if (target === undefined || !dictionary.has(target)) return [name];
    resolved.push(target);
  }
  return resolved;
}

/**
 * Split a token that is really two or more ingredients with the comma missing.
 *
 * "caprylyl glycol isohexadecane" and "camellia sinensis leaf extract arnica
 * montana flower extract" are printed with a gap where a comma belongs, and
 * each was being stored as one long junk name — 'caprylyl glycol
 * isohexadecane' is in the live dictionary as an unverified stub. Greedy,
 * longest known name first, and only when every word lands in a known name: one
 * leftover word means the token is not a run-together list, so it is returned
 * whole rather than guessed at.
 */
export function splitRunTogether(name: string, dictionary: ReadonlySet<string>): string[] {
  const words = name.split(" ");
  if (words.length < 2 || words.length > 12) return [name];
  const pieces = [];
  let i = 0;
  while (i < words.length) {
    let span = Math.min(6, words.length - i);
    while (span > 0 && !dictionary.has(words.slice(i, i + span).join(" "))) span--;
    if (span === 0) return [name];
    pieces.push(words.slice(i, i + span).join(" "));
    i += span;
  }
  return pieces.length > 1 ? pieces : [name];
}

/**
 * Correct a one-letter typo in a long name: "helianthus annus seed oil" for
 * `helianthus annuus seed oil`, "potassium cetyl phospate".
 *
 * Deliberately much tighter than the fuzzy match the no-delimiter path uses,
 * because that one is repairing OCR noise and this one is reading typed text. A
 * name must be at least 16 characters, sit exactly one edit from a single
 * unambiguous dictionary name, and carry the same digits — methylparaben and
 * ethylparaben are one edit apart, and so are polyquaternium-10 and -11, and
 * each is a different ingredient with a different safety note.
 */
export function fuzzyKnownName(name: string, dictionary: ReadonlySet<string>, attempts: { remaining: number }): string {
  if (name.length < 16) return name;
  const found = fuzzyLookup(name, lengthIndex(dictionary), attempts);
  if (!found || levenshtein(name, found, 1) > 1) return name;
  return name.replace(/\D/g, "") === found.replace(/\D/g, "") ? found : name;
}

/**
 * Recover the real ingredient from a fragment that is not a name on its own.
 *
 * The name check rejects "sodium sulfate: ci 12490" and "preservatives: benzyl
 * alcohol" because of the colon, but each holds a genuine ingredient that used
 * to be thrown away with the junk around it. Two shapes, and only these two:
 *
 *  - a colon-separated piece that is a known name in its own right, so both
 *    halves of "sodium sulfate: ci 12490" are kept;
 *  - a known name behind leading junk — a batch number ("2050519 10 -
 *    aqua/water") or heading text in other scripts ("ingrédients/ingredientes/
 *    sastojci helianthus annuus seed oil"). A word is skipped only if it has no
 *    letters, is non-ASCII, or is a slash-joined stack of heading words
 *    ("ingredientes/sastojci"); ordinary words never are, so "free from alcohol"
 *    does not become "alcohol", and a real slash name that the dictionary lacks
 *    ("peg/ppg-18/18 dimethicone") is not reduced to its last word.
 *
 * Nothing found returns an empty list. It is tried on every name the
 * dictionary does not hold, not only the ones the name check refuses, because
 * a fragment can pass that check and still carry junk in front of a real name.
 */
export function salvageKnownNames(name: string, dictionary: ReadonlySet<string>, aliases?: ReadonlyMap<string, string>): string[] {
  const found = [];
  for (const piece of name.split(/[:：]/)) {
    const words = normalise(piece).split(" ");
    for (let start = 0; start < words.length; start++) {
      const resolved = resolveKnownName(words.slice(start).join(" "), dictionary, aliases);
      if (dictionary.has(resolved)) {
        found.push(resolved);
        break;
      }
      if (!/^[^a-z]*$|[^\x00-\x7f]|(?=.*\/)(?:ingr[eé]dient|sastojci|sestavine|composition|zutaten|inhaltsstoffe)/.test(words[start])) break;
    }
  }
  return found;
}

/**
 * Pull the INCI list out of whatever else the OCR picked up.
 *
 * Real label photos capture claims, directions and barcodes alongside the
 * formula, so this first tries to isolate the block after an "Ingredients:"
 * heading, and only falls back to the whole text when there isn't one.
 *
 * `dictionary`, when supplied, backstops the delimiter split for labels
 * whose bullet separators (•) are small or low-contrast enough that Vision
 * doesn't detect them as characters at all — confirmed against a real photo,
 * not a hypothetical: the ingredients came back as one undifferentiated run
 * of words with no punctuation whatsoever to split on. Kept in step with
 * `lib/inci.ts`, the version under test — see that file for the same logic
 * annotated in more detail.
 */
export function parseIngredientBlock(
  text: string,
  dictionary?: ReadonlySet<string>,
  aliases?: ReadonlyMap<string, string>
): ParsedIngredient[] {
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ").replace(/\b(?:inactive ingredients?|may contain|peu(?:t|vent) contenir|puede contener|kann enthalten)\s*[:：]?\s*/gi, ", ");

  const heading = /(?:ingr[eé]dient(?:s|es|e|i)?|sastojci|composition|composição|zutaten|inhaltsstoffe)\s*[:：]\s*|(?:\bingredients?\b|전성분|全成分)\s*[:：]?\s*/i.exec(flat) ?? /성분\s*[:：]?\s*/.exec(flat);
  let block = heading ? flat.slice(heading.index + heading[0].length) : flat;

  // With a dictionary the heading's language stops mattering: the list is
  // wherever the known ingredients are. The heading pattern above stays as the
  // fallback for when nothing clears the bar, or no dictionary was supplied.
  const listed = dictionary ? findListByDictionary(flat, dictionary, aliases) : null;
  if (listed) block = listed;

  // Directions/cautions are the common case, but a photo also catches
  // whatever else shares the back of the label — the net-quantity mark (the
  // "e" symbol EU packaging prints beside a volume) and distributor/legal
  // boilerplate reliably sit right after the formula, and left in, both
  // degrade to junk fragments that dilute the recognised-ingredient ratio
  // enough to sink the verdict below "unknown" even when the OCR read was
  // otherwise clean.
  const stop =
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용\s?방법|사용법|주의\s?사항|사용\s?시의?\s?주의|사용할\s?때의?\s?주의|제조\s?판매\s?업자|제조\s?업자|책임\s?판매\s?업자|판매원|사용\s?기한|보관\s?방법|내용량|使用方法|使用上の注意|保管方法|製造販売元|販売元|内容量|\b(?:e\s*)?\d{2,4}\s*(?:ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b|\bstorage\b)/i.exec(
      block
    );
  if (stop) block = block.slice(0, stop.index);

  // Aliases resolve on the delimited path too, not only in reconstruction:
  // a bilingual label lists its French names comma-separated like any other,
  // so `glycérine` arrives here already well-formed and merely under the
  // wrong name.
  const canonical = (name: string) => aliases?.get(name) ?? name;

  const fuzzyAttempts = { remaining: MAX_FUZZY_ATTEMPTS_PER_BLOCK };
  const delimited = splitOnSeparators(block)
    .map(normalise)
    .filter((n) => n.length > 1 && n.length < 120 && /[a-z]|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/u.test(n))
    .flatMap((name) => {
      const resolved = canonical(name);
      // Without a dictionary a long real name cannot be recognised as known, so it is
      // exempt from the word limit only; every other check still reads the whole name.
      if (!dictionary) return isPlausibleIngredientName(resolved, true) ? [resolved] : [];
      const known = resolveKnownName(resolved, dictionary, aliases);
      if (dictionary.has(known)) return [known];
      const listed = splitSlashList(known, dictionary, aliases);
      if (listed.length > 1) return listed;
      const salvaged = salvageKnownNames(known, dictionary, aliases);
      if (salvaged.length > 0) return salvaged;
      if (!isPlausibleIngredientName(known)) return [];
      const pieces = splitRunTogether(known, dictionary);
      return pieces.length > 1 ? pieces : [fuzzyKnownName(known, dictionary, fuzzyAttempts)];
    })
    .map((inci_name, position) => ({ inci_name: canonical(inci_name), position }));

  if (delimited.length >= MIN_DELIMITED_TOKENS || !dictionary) return dedupe(delimited);

  const words = block.split(/\s+/).filter(Boolean).slice(0, MAX_RECONSTRUCTED_WORDS);
  return dedupe(
    reconstructFromDictionary(words, dictionary)
      .filter((p) => isPlausibleIngredientName(p.inci_name))
      .map((p) => ({ ...p, inci_name: canonical(p.inci_name) }))
  );
}

/**
 * `product_ingredients` is keyed on (product_id, position), not inci_name —
 * nothing stops two rows naming the same ingredient. Two different
 * multi-word ingredients that both fail to match the dictionary can degrade
 * to the same bare leftover word (two different oils both landing on
 * "oil"), and the client keys rows by inci_name, so a genuine duplicate
 * crashes into a React key collision there. First occurrence wins.
 */
export function dedupe(parsed: ParsedIngredient[]): ParsedIngredient[] {
  const seen = new Set<string>();
  const out: ParsedIngredient[] = [];
  for (const p of parsed) {
    if (seen.has(p.inci_name)) continue;
    seen.add(p.inci_name);
    out.push({ inci_name: p.inci_name, position: out.length });
  }
  return out;
}

/** Same normalisation as the import scripts, or the dictionary cannot match. */
export function normalise(raw: string): string {
  return raw
    // Full-width Latin/digits/punctuation (a common OCR read on a Japanese
    // label, e.g. "ＰＥＧ－４０") are Script=Common, not Latin or one of the
    // CJK scripts below, so the trim at the end stripped them as decoration
    // rather than keeping them as the name they are. NFKC folds them to
    // their standard-width equivalents first, matching how the dictionary
    // itself is spelled.
    .normalize("NFKC")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    // U+30FC, the katakana-hiragana prolongation mark ("ー" in "ポリマー"),
    // is Script=Common rather than Katakana, so it needs to be named
    // explicitly to survive the trim below the same way the four CJK
    // scripts do.
    .replace(/^[^a-z0-9\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]+|[^a-z0-9)\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]+$/gu, "");
}

/** Bounded edit distance — returns early once the result is certain to exceed `max`. */
function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Zero below `MIN_FUZZY_LENGTH`: within one edit of a short fragment sits half
 * the dictionary, so "oil", "code" and "fll" would each resolve to some real
 * ingredient. A fabricated match is worse than an unrecognised one.
 */
const MIN_FUZZY_LENGTH = 8;

function fuzzyBudget(length: number): number {
  if (length < MIN_FUZZY_LENGTH) return 0;
  return length <= 15 ? 1 : 2;
}

/**
 * Closest dictionary entry within the edit budget, or null.
 *
 * A tie is refused rather than broken: two different names equally close means
 * nothing in the text says which was printed, and picking either invents an
 * ingredient. Kept in step with `lib/inci.ts`.
 */
function fuzzyLookup(
  candidate: string,
  byLength: Map<number, string[]>,
  attempts: { remaining: number }
): string | null {
  if (attempts.remaining <= 0) return null;
  attempts.remaining -= 1;

  const budget = fuzzyBudget(candidate.length);
  if (budget === 0) return null;

  let best: string | null = null;
  let bestDist = budget + 1;
  let ambiguous = false;
  for (let len = candidate.length - budget; len <= candidate.length + budget; len++) {
    for (const entry of byLength.get(len) ?? []) {
      const dist = levenshtein(candidate, entry, budget);
      if (dist === 0) return entry;
      if (dist < bestDist) {
        best = entry;
        bestDist = dist;
        ambiguous = false;
      } else if (dist === bestDist && entry !== best) {
        ambiguous = true;
      }
    }
  }
  return ambiguous ? null : best;
}

/**
 * Resolve one window of words to a dictionary name, or null. Tries the words
 * as written, the words with spaces removed (OCR splits a printed word across
 * a line-wrap), and either side of a slash — on a label "/" separates two
 * names for ONE ingredient ("Aqua/Water"), so the canonical first name wins.
 * The slash case is strict: every later part must itself be a known name or a
 * single word, or a long window would swallow whatever followed the slash.
 * Kept in step with `lib/inci.ts`, the version under test.
 */
function matchWindow(
  window: string[],
  dictionary: ReadonlySet<string>,
  byLength: Map<number, string[]>,
  fuzzy: boolean,
  attempts: { remaining: number }
): string | null {
  const lookup = (value: string): string | null => {
    if (value.length <= 1) return null;
    if (dictionary.has(value)) return value;
    return fuzzy ? fuzzyLookup(value, byLength, attempts) : null;
  };

  const spaced = normalise(window.join(" "));
  const direct = lookup(spaced);
  if (direct) return direct;

  if (window.length > 1) {
    const joined = lookup(normalise(window.join("")));
    if (joined) return joined;
  }

  if (spaced.includes("/")) {
    const parts = spaced.split("/").map((part) => normalise(part));
    const head = parts[0] ? lookup(parts[0]) : null;
    // Exact-only for the trailing annotation, deliberately: allowing it to
    // match approximately let "…butter/shea butter glycerin" through as one
    // ingredient, eating the glycerin that followed it.
    const restIsPlausible = parts
      .slice(1)
      .every((part) => part.length > 1 && (dictionary.has(part) || !part.includes(" ")));
    if (head && parts.length > 1 && restIsPlausible) return head;
  }

  return null;
}

/**
 * Reconstruct ingredient boundaries from a run of words with no delimiters at
 * all, greedily matching the longest known dictionary name at each position.
 * Exact matches are exhausted at every window length before any fuzzy match is
 * considered at any length.
 */
function reconstructFromDictionary(
  words: string[],
  dictionary: ReadonlySet<string>
): ParsedIngredient[] {
  const byLength = new Map<number, string[]>();
  for (const entry of dictionary) {
    const bucket = byLength.get(entry.length);
    if (bucket) bucket.push(entry);
    else byLength.set(entry.length, [entry]);
  }

  const out: ParsedIngredient[] = [];
  const fuzzyAttempts = { remaining: MAX_FUZZY_ATTEMPTS_PER_BLOCK };
  let i = 0;

  while (i < words.length) {
    let matched: { name: string; consumed: number } | null = null;
    const maxSpan = Math.min(MAX_WINDOW_WORDS, words.length - i);

    for (const fuzzy of [false, true]) {
      for (let span = maxSpan; span >= 1 && !matched; span--) {
        const name = matchWindow(words.slice(i, i + span), dictionary, byLength, fuzzy, fuzzyAttempts);
        if (name) matched = { name, consumed: span };
      }
      if (matched) break;
    }

    if (!matched) matched = { name: normalise(words[i]), consumed: 1 };

    if (matched.name.length > 1) {
      out.push({ inci_name: matched.name, position: out.length });
    }
    i += matched.consumed;
  }

  return out;
}
