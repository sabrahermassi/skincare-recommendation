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

/** A PostgREST filter value, quoted so a comma, bracket or quote inside it is data and not syntax. */
const quoted = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * The PostgREST `or` filter for "rows after `last` in the order of `columns`": a lexicographic comparison,
 * which no single `gt` can say for a composite key. For columns (a, b) and last (x, y):
 * `a.gt."x",and(a.eq."x",b.gt."y")`.
 */
export function keysetFilter(columns, last) {
  return columns
    .map((column, i) => {
      const equal = columns.slice(0, i).map((c) => `${c}.eq.${quoted(last[c])}`);
      const after = `${column}.gt.${quoted(last[column])}`;
      return equal.length === 0 ? after : `and(${[...equal, after].join(",")})`;
    })
    .join(",");
}

/**
 * Reads every row of a table whose key is more than one column. `paginateOrdered` advances past the last row's
 * value, which skips the rest of a run of rows that share it, and no single column of a composite key is
 * unique; paging by offset instead shifts if a row is inserted or deleted between pages. This orders by every
 * key column, which makes the order total, and asks for the rows after the last one seen by a lexicographic
 * cursor, so neither a boundary nor a concurrent write drops or repeats a row. Throws on the first page that
 * errors, rather than returning a silently truncated result.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 * @param {{ select: string, orderColumns: string[], pageSize?: number }} options
 * @returns {Promise<any[]>}
 */
export async function paginateByKey(client, table, { select, orderColumns, pageSize = 1000 }) {
  const rows = [];
  let last = null;
  for (;;) {
    let query = client.from(table).select(select);
    for (const column of orderColumns) query = query.order(column, { ascending: true });
    query = query.limit(pageSize);
    if (last) query = query.or(keysetFilter(orderColumns, last));
    const { data, error } = await query;
    if (error) throw new Error(`${table} page after ${last ? orderColumns.map((c) => last[c]).join("/") : "start"}: ${error.message}`);
    if (!data || data.length === 0) return rows;
    rows.push(...data);
    if (data.length < pageSize) return rows;
    last = data[data.length - 1];
  }
}
