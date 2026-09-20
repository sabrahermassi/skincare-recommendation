import { parseInci } from "./inci-parse.mjs";

const PRODUCTS_PER_READ = 25;
const PAGE = 1000; // PostgREST's default row cap: a longer read is cut short without an error.

/**
 * Whether a difference between a stored formula and a fresh one is only the
 * parser having improved since the row was stored, not the label having changed.
 * The stored names came out of an older parser ("ingredients: aqua"); running the
 * same names through today's parser gives the fresh list exactly when nothing on
 * the label moved.
 *
 * It matters because `replace_product_with_ingredients` stamps
 * `formula_changed_at` whenever the list it is handed differs from the stored
 * one (migration 0019), and the product screen turns that stamp into a
 * "reformulated" notice for everyone who saved the product. A parser upgrade must
 * not tell people their moisturiser was reformulated. Callers that can see the
 * stored formula pass the answer as `p_parser_refresh` (migration 0021).
 */
export function parserOnlyChange(current, fresh, known, aliases) {
  const stored = [...current].sort((a, b) => a.position - b.position).map((i) => i.inci_name);
  const reparsed = parseInci(stored.join(", "), known, undefined, aliases);
  return reparsed.length === fresh.length && reparsed.every((r, i) => r.inci_name === fresh[i].inci_name);
}

/**
 * Whether writing `fresh` over a product that already has a stored formula is a
 * parser-only refresh. A product with no stored formula is new or identity-only,
 * which the database already treats as not a change.
 */
export function isParserRefresh(stored, fresh, known, aliases) {
  return Boolean(stored?.length) && parserOnlyChange(stored, fresh, known, aliases);
}

/** product id → its stored `{ inci_name, position }` rows, for the ids that have any. */
export async function fetchStoredFormulas(db, ids) {
  const byId = new Map();
  for (let i = 0; i < ids.length; i += PRODUCTS_PER_READ) {
    const chunk = ids.slice(i, i + PRODUCTS_PER_READ);
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db
        .from("product_ingredients")
        .select("product_id, inci_name, position")
        .in("product_id", chunk)
        .order("product_id", { ascending: true })
        .order("position", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`reading stored formulas: ${error.message}`);
      for (const r of data) {
        if (!byId.has(r.product_id)) byId.set(r.product_id, []);
        byId.get(r.product_id).push({ inci_name: r.inci_name, position: r.position });
      }
      if (data.length < PAGE) break;
    }
  }
  return byId;
}
