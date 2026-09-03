// Cursor-paginated table reads shared by the import scripts that walk the
// full `ingredients` table.
//
// It lives here rather than being copied into each script because the copies
// had already drifted once — see the parity test in `__tests__/inci.test.ts`
// for the same lesson learned on the label-ocr parser. Concretely, this
// replaced independent `for (let offset = 0; ...) { .range(offset, offset +
// 999) }` loops in import-cosing.mjs and import-wikidata-synonyms.mjs (and a
// third, error-swallowing copy in supabase/functions/label-ocr — see
// supabase/functions/_shared/paginate.ts) that had no `.order()` clause at
// all: without one, Postgres does not guarantee page N returns the same rows
// twice, and a row inserted or deleted between page requests can shift every
// later offset window and silently drop a name from the read.
// import-cosing.mjs's own comment states rows already verified by another
// source must never be overwritten — an omitted row breaks that promise
// silently, since it then reads as "new" and gets force-upserted.
//
// Ordering by a stable, unique column and asking for "everything after the
// last row I saw" instead of "the Nth page" is unaffected by concurrent
// writes elsewhere in the table — label-ocr and product-lookup both write to
// `ingredients` while these scripts may be running.

/**
 * Reads every row of `table`, paging by `cursorColumn` instead of by offset.
 * Throws on the first page that errors, rather than returning a silently
 * truncated result.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 * @param {{ select: string, cursorColumn: string, pageSize?: number, filter?: (query: any) => any }} options
 */
export async function paginateOrdered(client, table, { select, cursorColumn, pageSize = 1000, filter }) {
  const rows = [];
  let cursor = null;

  for (;;) {
    let query = client.from(table).select(select).order(cursorColumn, { ascending: true }).limit(pageSize);
    if (filter) query = filter(query);
    if (cursor !== null) query = query.gt(cursorColumn, cursor);

    const { data, error } = await query;
    if (error) throw new Error(`${table} page after ${cursor ?? "start"}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...data);
    cursor = data[data.length - 1][cursorColumn];
    if (data.length < pageSize) break;
  }

  return rows;
}
