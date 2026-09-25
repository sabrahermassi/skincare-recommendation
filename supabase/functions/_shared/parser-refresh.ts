export type FormulaRow = { inci_name: string; position: number };

/**
 * Whether a difference between a stored formula and a freshly parsed one is only
 * the parser having improved since the row was stored, not the label having
 * changed. The stored names came out of an older parser ("benzoic acid. caprylyl
 * glycol. glycerin" as one name); reading the same names through today's parser
 * gives the fresh list exactly when nothing on the label moved.
 *
 * It matters because `replace_product_with_ingredients` stamps
 * `formula_changed_at` whenever the list it is handed differs from the stored
 * one (migration 0019), and the product screen turns that stamp into a
 * "reformulated" notice for everyone who saved the product. A caller that can
 * see the stored formula passes the answer as `p_parser_refresh` (migration
 * 0021). Plain TypeScript with no Deno imports, so Jest can import it; the parser
 * is passed in because only the caller knows which read produced the fresh
 * list — the plain one, or the dictionary-repaired one `formula-gate.ts` falls
 * back to — and the stored names must be read back the same way.
 *
 * A product with no stored formula is new or identity-only, which the database
 * already treats as not a change, and an identical formula needs no flag.
 */
export function isParserOnlyChange(
  stored: FormulaRow[],
  fresh: FormulaRow[],
  parse: (text: string) => FormulaRow[]
): boolean {
  if (stored.length === 0) return false;
  const names = [...stored].sort((a, b) => a.position - b.position).map((row) => row.inci_name);
  const identical = names.length === fresh.length && names.every((name, i) => name === fresh[i].inci_name);
  if (identical) return false;
  const reparsed = parse(names.join(", "));
  return reparsed.length === fresh.length && reparsed.every((row, i) => row.inci_name === fresh[i].inci_name);
}
