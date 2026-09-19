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
  const guarded = text.replace(/\([^)]*\)/g, (group) => group.replace(/\./g, ""));
  const protectedText = guarded.replace(/,(?=\d)/g, (match, offset: number) =>
    offset > 0 && /\d/.test(text[offset - 1]) ? PLACEHOLDER : match
  );
  return protectedText
    .split(/[;•·]|,|\.(?=\s)/)
    .map((s) => s.replace(new RegExp(PLACEHOLDER, "g"), ",").replace(//g, "."));
}

/** Below this many delimiter-split tokens, the split itself is untrustworthy. */
const MIN_DELIMITED_TOKENS = 4;

/** Longest run of words tried as one ingredient name (e.g. "Peg-20 Methyl Glucose Sesquistearate"). */
const MAX_WINDOW_WORDS = 6;

/**
 * Ceiling on the words reconstruction will consider.
 *
 * Reconstruction is the expensive path — every window is checked against a
 * dictionary of tens of thousands of names, with a fuzzy pass behind it — and
 * it only runs when the block could not be split on punctuation. If the block
 * boundary is ever missed, that block becomes the whole label and the work
 * grows with it: a real request died on the Edge Function's compute limit
 * exactly this way. No ingredient list runs past this, so the cap costs
 * nothing and bounds the damage when the boundary is wrong.
 */
const MAX_RECONSTRUCTED_WORDS = 400;

/**
 * Ceiling on fuzzy-match attempts across one `reconstructFromDictionary`
 * call. Every unmatched position can try up to `MAX_WINDOW_WORDS` window
 * spans, each of which can call `fuzzyLookup` more than once (the spaced
 * form, the joined form, the slash head) — and each `fuzzyLookup` scans every
 * dictionary entry within the edit-distance budget's length buckets. Without
 * a ceiling, a long run of unmatched words (the reconstruction path only
 * runs when the label was already too garbled to delimiter-split) still
 * spends real CPU per request even with the word cap above in place.
 *
 * Not benchmarked against real garbled labels — picked generously above what
 * a legitimate reconstruction should ever need, so it should only ever bite
 * on pathological input. Revisit with real data if it turns out too tight.
 */
const MAX_FUZZY_ATTEMPTS_PER_BLOCK = 800;

/**
 * Bounded Levenshtein distance — returns early once the result is certain to
 * exceed `max`, since this runs against many candidate dictionary entries per
 * word and the exact distance beyond `max` is never needed.
 */
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
    if (rowMin > max) return max + 1; // whole row exceeds budget — no recovery possible
    prev = curr;
  }
  return prev[b.length];
}

/**
 * How much OCR noise a candidate may carry and still count as a match.
 *
 * Zero below `MIN_FUZZY_LENGTH`: within one edit of a short fragment sits half
 * the dictionary, so "oil", "code" and "fll" would all resolve to some real
 * ingredient. A fabricated match is worse than an unrecognised one — it inflates
 * coverage and can put a safety note on something that was never in the product
 * — so short fragments are left unmatched instead.
 */
const MIN_FUZZY_LENGTH = 8;

function fuzzyBudget(length: number): number {
  if (length < MIN_FUZZY_LENGTH) return 0;
  return length <= 15 ? 1 : 2;
}

/**
 * Closest dictionary entry within the edit budget, or null. Length-bucketed to
 * keep the scan small.
 *
 * A tie is refused rather than broken. When two different names sit the same
 * distance from what was printed, nothing in the text says which one it was,
 * and picking either invents an ingredient the product may not contain. This
 * matters more as the dictionary grows: every name added is another
 * near-neighbour, so the safeguard has to scale with it.
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
 * Resolve one window of words to a dictionary name, or null.
 *
 * Three shapes are tried, because a printed label is not a database:
 *  - the words as written;
 *  - the words with the spaces removed, since OCR splits a single printed word
 *    across a line-wrap ("polyacryloyldimethyl taurate" for one printed word);
 *  - either side of a slash. On a label "/" separates two names for ONE
 *    ingredient — "Aqua/Water", "Butyrospermum Parkii Butter/Shea Butter" — so
 *    the canonical first name is what we store.
 *
 * The slash case is deliberately strict. Accepting it whenever the first part
 * matched would let a long window swallow whatever followed the slash: for
 * "…seed oil/rapeseed taurate peg-100" the first part matches outright, and the
 * three words after it are a different ingredient. So every later part must
 * itself be a name we know, or be a single word.
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
 * Reconstruct ingredient boundaries from a run of words that carries no
 * delimiters at all — the printed bullet separators (•) between ingredients
 * are sometimes invisible to OCR entirely, not just misread, leaving one
 * undifferentiated block of words with nothing to split on.
 *
 * Greedy longest-match against the known ingredient dictionary, word by
 * word: try the longest plausible window first, since a multi-word name like
 * "Butyrospermum Parkii Butter" must win over matching "Butyrospermum" alone
 * and leaving "Parkii Butter" stranded. Exact matches are exhausted at every
 * window length before any fuzzy match is considered at any length — a name we
 * hold verbatim always beats a longer approximate one. When nothing matches at
 * all the bare word is emitted unverified, so this never stalls and never
 * silently drops a fragment.
 */
export function reconstructFromDictionary(
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
 * name. Eight words is above every real INCI name in the dictionary and below
 * every sentence found in it. An HTML entity ("&lt;") or a run of seven digits
 * (a barcode, a batch number) is packaging text that OCR or a paste carried in,
 * as is a web address or e-mail, and a fragment that opens with the word
 * "ingredients" is a footnote about the list, not a member of it.
 */
export function isPlausibleIngredientName(name: string): boolean {
  if (/[:：]/.test(name.replace(/\d[:：]\d/g, ""))) return false;
  if (/\.(?:jpe?g|png|gif|webp|pdf)\b/i.test(name)) return false;
  if (/&(?:lt|gt|amp|quot|nbsp|#\d+)\b|[<>]/i.test(name)) return false;
  if (/\d{7,}/.test(name)) return false;
  if (/\bwww\.|https?:|@|\.(?:com|net|org)\b/i.test(name)) return false;
  if (/^ingr[eé]dients?\b/i.test(name)) return false;
  return name.split(/\s+/).length <= 8;
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
 */
export function squashKey(name: string): string {
  return name.replace(/[^a-z0-9]/g, "");
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
  const table = new Map([
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
  return table.get(name);
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
    const isKnown = (part: string) => dictionary.has(part) || (aliases?.has(part) ?? false);
    const anchor = parts.find(isKnown);
    const strict = /(?:polymer|resin|esters?)$/.test(parts[parts.length - 1]);
    const restIsPlausible = parts.every((part) => part === anchor || (part.length > 1 && (isKnown(part) || !part.includes(" ") || !strict)));
    if (parts.length > 1 && anchor && restIsPlausible) return anchor;
  }
  return name;
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
 * Extract the ordered ingredient list from a block of label text.
 *
 * Position is preserved because INCI order is regulated information —
 * descending concentration — and the verdict engine weights by it. A photo
 * also catches claims, directions and small print, so the list is isolated
 * from an "Ingredients:" heading where one exists (including the Korean
 * 전성분) and truncated at the next section heading.
 *
 * `dictionary`, when supplied, backstops the common delimiter split: some
 * labels print bullet-separated ingredients with dots small or light enough
 * that OCR drops them entirely rather than misreading them, leaving no
 * punctuation to split on at all. When the plain split comes back too thin to
 * trust, the block is re-parsed by matching known ingredient names directly
 * against the run of words. Without a dictionary, behaviour is unchanged.
 */
export function parseIngredientBlock(
  text: string,
  dictionary?: ReadonlySet<string>,
  aliases?: ReadonlyMap<string, string>
): ParsedIngredient[] {
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ").replace(/\b(?:inactive ingredients?|may contain|peut contenir)\s*[:：]?\s*/gi, ", ");

  const heading = /(?:ingr[eé]dient(?:s|es|e|i)?|sastojci|composition|composição|zutaten|inhaltsstoffe)\s*[:：]\s*|(?:\bingredients?\b|전성분|성분)\s*[:：]?\s*/i.exec(flat);
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
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법|\b(?:e\s*)?\d{2,4}\s*(?:ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b|\bstorage\b)/i.exec(
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
    .filter((n) => n.length > 1 && n.length < 120 && /[a-z]/.test(n))
    .flatMap((name) => {
      const resolved = canonical(name);
      if (!dictionary) return isPlausibleIngredientName(resolved) ? [resolved] : [];
      const known = resolveKnownName(resolved, dictionary, aliases);
      if (dictionary.has(known)) return [known];
      const salvaged = salvageKnownNames(known, dictionary, aliases);
      if (salvaged.length > 0) return salvaged;
      if (!isPlausibleIngredientName(known)) return [];
      const pieces = splitRunTogether(known, dictionary);
      return pieces.length > 1 ? pieces : [fuzzyKnownName(known, dictionary, fuzzyAttempts)];
    })
    .map((inci_name, position) => ({ inci_name, position }));

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
 * nothing stops two rows naming the same ingredient. A regulated INCI list
 * never repeats a name, but two *different* multi-word ingredients that both
 * fail to match the dictionary can degrade to the same bare leftover word
 * (two different oils both landing on "oil"), and the UI keys rows by
 * inci_name, so a genuine duplicate crashes into a React key collision.
 * First occurrence wins — earliest position is the more informative one to
 * keep, since INCI order is descending concentration — and positions are
 * renumbered so there is no gap where a duplicate was dropped.
 */
function dedupe(parsed: ParsedIngredient[]): ParsedIngredient[] {
  const seen = new Set<string>();
  const out: ParsedIngredient[] = [];
  for (const p of parsed) {
    if (seen.has(p.inci_name)) continue;
    seen.add(p.inci_name);
    out.push({ inci_name: p.inci_name, position: out.length });
  }
  return out;
}
