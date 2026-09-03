// Cursor-paginated table reads shared by every Edge Function that has to walk
// the full `ingredients` table.
//
// It lives here rather than being copied into each function because the
// copies had already drifted once — see the parity test in
// `__tests__/inci.test.ts` for the same lesson learned on the label-ocr
// parser. Concretely, this replaced three independent `for (let offset = 0;
// ...) { .range(offset, offset + PAGE - 1) }` loops (two in `scripts/`, one
// here) that had no `.order()` clause at all: without one, Postgres does not
// guarantee page N returns the same rows twice, and a row inserted or deleted
// between page requests can shift every later offset window and silently
// drop a name from the read. `label-ocr` and `product-lookup` write to
// `ingredients` concurrently with any script or function reading it, so this
// was not a theoretical risk.
//
// Ordering by a stable, unique column and asking for "everything after the
// last row I saw" instead of "the Nth page" is unaffected by concurrent
// writes elsewhere in the table.

// deno-lint-ignore no-explicit-any
type QueryBuilder = any;

export type PaginateOptions = {
  select: string;
  /** A stable, unique column to order and page on — e.g. a primary key. */
  cursorColumn: string;
  pageSize?: number;
  /** Applies additional filters (`.eq(...)`, etc.) before the cursor is applied. */
  filter?: (query: QueryBuilder) => QueryBuilder;
};

/**
 * Reads every row of `table`, paging by `cursorColumn` instead of by offset.
 * Throws on the first page that errors, rather than returning a silently
 * truncated result — a partial read here has caused real, sticky bad data in
 * the past (see the `fetchDictionary` comment above its call site).
 */
export async function paginateOrdered<T>(
  // deno-lint-ignore no-explicit-any
  client: any,
  table: string,
  { select, cursorColumn, pageSize = 1000, filter }: PaginateOptions
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | number | null = null;

  for (;;) {
    let query: QueryBuilder = client
      .from(table)
      .select(select)
      .order(cursorColumn, { ascending: true })
      .limit(pageSize);
    if (filter) query = filter(query);
    if (cursor !== null) query = query.gt(cursorColumn, cursor);

    const { data, error } = await query;
    if (error) {
      throw new Error(`${table} page after ${cursor ?? "start"}: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));
    cursor = (data[data.length - 1] as Record<string, string | number>)[cursorColumn];
    if (data.length < pageSize) break;
  }

  return rows;
}
