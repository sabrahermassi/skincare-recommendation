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
 * A comma sitting directly between two digits belongs to the name, not to the
 * list: "1,2-Hexanediol" is one ingredient, and splitting there produced a bare
 * "1" and a "2-hexanediol" that matches nothing — the most common bad name in
 * the catalogue. A real separator is always followed by a space or a letter,
 * never by a digit with nothing between, so a lookahead tells them apart.
 */
export function splitOnSeparators(text: string): string[] {
  return text.split(/[;•·]|,(?!\d)/);
}

/** Below this many delimiter-split tokens, the split itself is untrustworthy. */
const MIN_DELIMITED_TOKENS = 4;

/** Longest run of words tried as one ingredient name (e.g. "Peg-20 Methyl Glucose Sesquistearate"). */
const MAX_WINDOW_WORDS = 6;

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
function fuzzyLookup(candidate: string, byLength: Map<number, string[]>): string | null {
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
  fuzzy: boolean
): string | null {
  const lookup = (value: string): string | null => {
    if (value.length <= 1) return null;
    if (dictionary.has(value)) return value;
    return fuzzy ? fuzzyLookup(value, byLength) : null;
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
  let i = 0;

  while (i < words.length) {
    let matched: { name: string; consumed: number } | null = null;
    const maxSpan = Math.min(MAX_WINDOW_WORDS, words.length - i);

    for (const fuzzy of [false, true]) {
      for (let span = maxSpan; span >= 1 && !matched; span--) {
        const name = matchWindow(words.slice(i, i + span), dictionary, byLength, fuzzy);
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
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ");

  const heading = /(?:ingredients?|전성분|성분)\s*[:：]?\s*/i.exec(flat);
  let block = heading ? flat.slice(heading.index + heading[0].length) : flat;

  // Directions/cautions are the common case, but a photo also catches
  // whatever else shares the back of the label — the net-quantity mark (the
  // "e" symbol EU packaging prints beside a volume) and distributor/legal
  // boilerplate reliably sit right after the formula, and left in, both
  // degrade to junk fragments that dilute the recognised-ingredient ratio
  // enough to sink the verdict below "unknown" even when the OCR read was
  // otherwise clean.
  const stop =
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법|\be\s*\d+([.,]\d+)?\s*(ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b)/i.exec(
      block
    );
  if (stop) block = block.slice(0, stop.index);

  // Aliases resolve on the delimited path too, not only in reconstruction:
  // a bilingual label lists its French names comma-separated like any other,
  // so `glycérine` arrives here already well-formed and merely under the
  // wrong name.
  const canonical = (name: string) => aliases?.get(name) ?? name;

  const delimited = splitOnSeparators(block)
    .map(normalise)
    .filter((n) => n.length > 1 && n.length < 120 && /[a-z]/.test(n))
    .map((name, position) => ({ inci_name: canonical(name), position }));

  if (delimited.length >= MIN_DELIMITED_TOKENS || !dictionary) return dedupe(delimited);

  const words = block.split(/\s+/).filter(Boolean);
  return dedupe(
    reconstructFromDictionary(words, dictionary).map((p) => ({
      ...p,
      inci_name: canonical(p.inci_name),
    }))
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
