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

export function parseInci(text) {
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ");

  // 1 ── Drop everything up to and including an "Ingredients:" heading. Same
  // pattern as lib/inci.ts, Korean forms included.
  const heading = /(?:ingredients?|전성분|성분)\s*[:：]?\s*/i.exec(flat);
  let block = heading ? flat.slice(heading.index + heading[0].length) : flat;

  // 2 ── ...and truncate at whatever shares the back of the label. Legal
  // boilerplate and net-quantity marks reliably follow the formula.
  const stop =
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법|\b(?:e\s*)?\d{2,4}\s*(?:ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b)/i.exec(
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
    .map((inci_name, position) => ({ inci_name, position }));

  // 5 ── ...and drop repeats, renumbering as it goes. Both of
  // `parseIngredientBlock`'s return paths end in this; this copy did not,
  // which is the one place it still diverged.
  return dedupe(delimited);
}

function dedupe(parsed) {
  const seen = new Set();
  const out = [];
  for (const p of parsed) {
    if (seen.has(p.inci_name)) continue;
    seen.add(p.inci_name);
    out.push({ inci_name: p.inci_name, position: out.length });
  }
  return out;
}
