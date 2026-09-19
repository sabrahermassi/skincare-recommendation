/**
 * INCI label parsing, shared by the import scripts.
 *
 * `lib/inci.ts` is the canonical version and the one under test; this is the
 * plain-JavaScript form the `.mjs` operator scripts can import, carrying the
 * delimited path only — no dictionary reconstruction, no aliases.
 *
 * It exists because there were already four hand-copies of `normalise` across
 * `scripts/`, and `__tests__/inci-parser-parity.test.ts` had to be widened to
 * watch them after the Open Beauty Facts copy drifted and started writing
 * label headings into the ingredient dictionary. A fifth copy for DailyMed
 * would have been the same mistake again, so the second caller extracts it
 * instead.
 *
 * `scripts/import-obf.mjs` still holds its own copy: moving it belongs with
 * that file's own change rather than with a new importer, and the parity test
 * guards both against `lib/inci.ts` in the meantime.
 */

export function normalise(raw) {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/g, "");
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
 * every sentence found in it.
 */
export function isPlausibleIngredientName(name) {
  if (/[:：]/.test(name.replace(/\d[:：]\d/g, ""))) return false;
  if (/\.(?:jpe?g|png|gif|webp|pdf)\b/i.test(name)) return false;
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
export function findListByDictionary(flat, dictionary, aliases) {
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
 * Map a delimited name the dictionary does not hold to the one it does.
 *
 * `matchWindow` already knows two printed-label habits, but only runs when the
 * list had no delimiters at all. A list split cleanly on commas skipped both,
 * so "aqua/water/eau" and "gly cerin" reached the dictionary as-is and missed —
 * about a fifth of every unmatched name in a live sample, for ingredients the
 * dictionary holds under a plain name.
 *
 *  - OCR splits one printed word: "gly cerin", "be henyl alcohol".
 *  - "/" separates names for ONE ingredient: "aqua/water/eau" is aqua. Strict,
 *    as in `matchWindow`: every later part must be a known name or a single
 *    word, so "hydroxyethyl acrylate/sodium acryloyldimethyl taurate
 *    copolymer" — one real name that merely contains a slash — is left alone.
 *
 * A name already in the dictionary, or matching neither shape, comes back
 * unchanged.
 */
export function resolveKnownName(name, dictionary) {
  if (dictionary.has(name)) return name;
  const words = name.split(" ");
  for (let i = 0; i + 1 < words.length; i++) {
    const joined = [...words.slice(0, i), words[i] + words[i + 1], ...words.slice(i + 2)].join(" ");
    if (dictionary.has(joined)) return joined;
  }
  if (name.includes("/")) {
    const parts = name.split("/").map(normalise);
    const restIsPlausible = parts.slice(1).every((p) => p.length > 1 && (dictionary.has(p) || !p.includes(" ")));
    if (parts.length > 1 && dictionary.has(parts[0]) && restIsPlausible) return parts[0];
  }
  return name;
}

/**
 * `dictionary`, when given, finds the list by what it contains rather than by
 * the language of the heading above it. `rejected`, when given, collects the
 * fragments the name check threw out, so an importer can print them.
 */
export function parseInci(text, dictionary, rejected) {
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ").replace(/\b(?:inactive ingredients?|may contain|peut contenir)\s*[:：]?\s*/gi, ", ");

  // 1 ── Drop everything up to and including an "Ingredients:" heading. Same
  // pattern as lib/inci.ts, Korean forms included.
  const heading = /(?:ingr[eé]dient(?:s|es|e|i)?|sastojci|composition|composição|zutaten|inhaltsstoffe)\s*[:：]\s*|(?:ingredients?|전성분|성분)\s*[:：]?\s*/i.exec(flat);
  let block = heading ? flat.slice(heading.index + heading[0].length) : flat;

  // With a dictionary the heading's language stops mattering; see lib/inci.ts.
  const listed = dictionary ? findListByDictionary(flat, dictionary) : null;
  if (listed) block = listed;

  // 2 ── ...and truncate at whatever shares the back of the label. Legal
  // boilerplate and net-quantity marks reliably follow the formula.
  const stop =
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법|\b(?:e\s*)?\d{2,4}\s*(?:ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b|\bstorage\b)/i.exec(
      block
    );
  if (stop) block = block.slice(0, stop.index);

  // 3 ── Split, protecting a comma between two digits: "1,2-Hexanediol" is one
  // ingredient, and splitting there produced a bare "1" and a "2-hexanediol"
  // that matches nothing — lib/inci.ts calls this the most common bad name in
  // the catalogue, and this copy was still producing it.
  const PLACEHOLDER = "\uE000";
  const protectedText = block.replace(/,(?=\d)/g, (match, offset) =>
    offset > 0 && /\d/.test(block[offset - 1]) ? PLACEHOLDER : match
  );

  const delimited = protectedText
    .split(/[;•·]|,/)
    .map((s) => s.replace(new RegExp(PLACEHOLDER, "g"), ","))
    .map(normalise)
    // 4 ── A token with no letter in it is a quantity or a code, not a name.
    .filter((p) => p.length > 1 && p.length < 120 && /[a-z]/.test(p))
    // ...and a fragment that cannot be a name (a label section, a file name) is
    // reported rather than written into the shared dictionary.
    .filter((p) => {
      const ok = isPlausibleIngredientName(p);
      if (!ok) rejected?.push(p);
      return ok;
    })
    .map((inci_name, position) => ({
      inci_name: dictionary ? resolveKnownName(inci_name, dictionary) : inci_name,
      position,
    }));

  // 5 ── ...and drop repeats, renumbering as it goes. Both of
  // `parseIngredientBlock`'s return paths end in this; this copy did not,
  // which is the one place it still diverged.
  return dedupe(delimited);
}

export function dedupe(parsed) {
  const seen = new Set();
  const out = [];
  for (const p of parsed) {
    if (seen.has(p.inci_name)) continue;
    seen.add(p.inci_name);
    out.push({ inci_name: p.inci_name, position: out.length });
  }
  return out;
}
