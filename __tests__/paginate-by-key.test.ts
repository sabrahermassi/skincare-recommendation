import { paginateByKey } from "../scripts/lib/paginate.mjs";

/**
 * #457 review: `regulatory_entries` is keyed by (annex, entry) and `ingredient_regulatory` by (inci_name,
 * annex, entry). Paging either by one column drops the rest of a run of rows that share that column's value
 * when a page ends inside it. `paginateByKey` orders by the whole key and pages by position.
 */

type Row = { annex: string; entry: string };

/** A client that answers like Supabase: sorted by the columns asked for, then a range. */
function client(table: Row[], fail = false) {
  return {
    from: () => {
      const orders: string[] = [];
      const builder = {
        select: () => builder,
        order: (column: string) => {
          orders.push(column);
          return builder;
        },
        range: async (from: number, to: number) => {
          if (fail) return { data: null, error: { message: "boom" } };
          const sorted = [...table].sort((a, b) => orders.map((c) => (a as never)[c] < (b as never)[c] ? -1 : (a as never)[c] > (b as never)[c] ? 1 : 0).find((x) => x !== 0) ?? 0);
          return { data: sorted.slice(from, to + 1), error: null };
        },
      };
      return builder;
    },
  };
}

// Entries 1..7 in both annexes: every entry number is shared, so a page of 3 ends inside a pair.
const TABLE: Row[] = ["II", "III"].flatMap((annex) => Array.from({ length: 7 }, (_, i) => ({ annex, entry: String(i + 1) })));

it("returns every row of a composite-key table, even when a page ends between rows that share a value", async () => {
  const rows = await paginateByKey(client(TABLE) as never, "regulatory_entries", { select: "*", orderColumns: ["annex", "entry"], pageSize: 3 });
  expect(rows).toHaveLength(TABLE.length);
  expect(new Set(rows.map((r: Row) => `${r.annex}/${r.entry}`)).size).toBe(TABLE.length);
});

it("returns the same rows whatever the page size", async () => {
  const one = await paginateByKey(client(TABLE) as never, "t", { select: "*", orderColumns: ["annex", "entry"], pageSize: 1 });
  const all = await paginateByKey(client(TABLE) as never, "t", { select: "*", orderColumns: ["annex", "entry"], pageSize: 1000 });
  expect(one).toEqual(all);
});

it("stops with the error instead of returning a truncated table", async () => {
  await expect(paginateByKey(client(TABLE, true) as never, "regulatory_entries", { select: "*", orderColumns: ["annex", "entry"], pageSize: 3 })).rejects.toThrow("regulatory_entries rows 0-2: boom");
});
