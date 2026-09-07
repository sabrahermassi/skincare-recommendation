/**
 * One spelling for a CosIng functional role, shared by every importer.
 *
 * The two dictionary importers each had their own splitting logic and wrote
 * the same role two different ways: `import-cosing.mjs` lowercased but kept
 * the CSV's spaces ("skin conditioning"), while `import-inci-dictionary.mjs`
 * stripped an `en:` prefix and did neither, passing through the OBF
 * taxonomy's hyphens and casing ("skin-conditioning"). Both forms are in the
 * live `ingredients.functions` column today, which means any consumer has to
 * know about both — and the scoring layer's Layer 2 lookup is exactly such a
 * consumer.
 *
 * `normaliseFunction` in lib/rules.ts applies the same transform at read
 * time, so existing rows still resolve without a backfill. This is what stops
 * the problem growing.
 */
export function normaliseFunction(raw) {
  return String(raw)
    .trim()
    .replace(/^en:/i, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

/** Split a delimited function list into normalised, deduped roles. */
export function parseFunctions(raw, separator = /[,/]/) {
  if (!raw) return [];
  const seen = new Set();
  for (const part of String(raw).split(separator)) {
    const role = normaliseFunction(part);
    if (role) seen.add(role);
  }
  return [...seen];
}
