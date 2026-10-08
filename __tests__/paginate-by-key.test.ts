import { keysetFilter, paginateByKey } from "../scripts/lib/paginate.mjs";

/**
 * #457 review: `regulatory_entries` is keyed by (annex, entry) and `ingredient_regulatory` by (inci_name,
 * annex, entry). Paging either by one column drops the rest of a run of rows that share that column's value
 * when a page ends inside it, and paging by offset shifts when a row is written between pages.
 * `paginateByKey` orders by the whole key and asks for the rows after the last one seen.
 */

type Row = { annex: string; entry: string };

/**
 * A client that answers like Supabase: sorted by the columns asked for, then `limit`, with the `or` filter
 * this helper builds (`a.gt."x"` and `and(a.eq."x",b.gt."y")`) read back and applied. `afterPage` runs after
 * each answer, to write to the table between pages.
 */
function client(table: Row[], opts: { fail?: boolean; afterPage?: () => void } = {}) {
  return {
    from: () => {
      const orders: string[] = [];
      let limit = Infinity;
      let filter: string | null = null;
      const builder = {
        select: () => builder,
        order: (column: string) => {
          orders.push(column);
          return builder;
        },
        limit: (n: number) => {
          limit = n;
          return builder;
        },
        or: (text: string) => {
          filter = text;
          return builder;
        },
        then: (resolve: (value: unknown) => void) => {
          if (opts.fail) return resolve({ data: null, error: { message: "boom" } });
          const compare = (a: Row, b: Row) => orders.map((c) => ((a as never)[c] < (b as never)[c] ? -1 : (a as never)[c] > (b as never)[c] ? 1 : 0)).find((x) => x !== 0) ?? 0;
          let rows = [...table].sort(compare);
          if (filter) {
            const terms = filter.match(/and\([^)]*\)|[^,()]+/g) ?? [];
            rows = rows.filter((row) =>
              terms.some((term) =>
                term
                  .replace(/^and\(|\)$/g, "")
                  .split(",")
                  .every((cond) => {
                    const [, col, op, val] = /^(\w+)\.(eq|gt)\."(.*)"$/.exec(cond) ?? [];
                    const mine = (row as never)[col] as string;
                    return op === "eq" ? mine === val : mine > val;
                  }),
              ),
            );
          }
          const data = rows.slice(0, limit);
          resolve({ data, error: null });
          opts.afterPage?.();
        },
      };
      return builder;
    },
  };
}

// Entries 1..7 in both annexes: every entry number is shared, so a page of 3 ends inside a pair.
const TABLE: Row[] = ["II", "III"].flatMap((annex) => Array.from({ length: 7 }, (_, i) => ({ annex, entry: String(i + 1) })));
const read = (c: ReturnType<typeof client>, pageSize: number) => paginateByKey(c as never, "regulatory_entries", { select: "*", orderColumns: ["annex", "entry"], pageSize });

it("returns every row of a composite-key table, even when a page ends between rows that share a value", async () => {
  const rows = await read(client(TABLE), 3);
  expect(rows).toHaveLength(TABLE.length);
  expect(new Set(rows.map((r: Row) => `${r.annex}/${r.entry}`)).size).toBe(TABLE.length);
});

it("returns the same rows whatever the page size", async () => {
  expect(await read(client(TABLE), 1)).toEqual(await read(client(TABLE), 1000));
});

it("neither drops nor repeats a row when one is written before the cursor between pages", async () => {
  const table = [...TABLE];
  let written = false;
  const rows = await read(
    client(table, {
      afterPage: () => {
        if (written) return;
        written = true;
        table.unshift({ annex: "II", entry: "0" });
      },
    }),
    3,
  );
  const keys = rows.map((r: Row) => `${r.annex}/${r.entry}`);
  // The new row sorts before the cursor, so this pass does not see it, and none of the rest shifts or repeats.
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toHaveLength(TABLE.length);
});

it("stops with the error instead of returning a truncated table", async () => {
  await expect(read(client(TABLE, { fail: true }), 3)).rejects.toThrow("regulatory_entries page after start: boom");
});

describe("the cursor", () => {
  it("is a lexicographic comparison over the key's columns", () => {
    expect(keysetFilter(["annex", "entry"], { annex: "II", entry: "7" })).toBe('annex.gt."II",and(annex.eq."II",entry.gt."7")');
    expect(keysetFilter(["inci_name", "annex", "entry"], { inci_name: "A", annex: "II", entry: "1" })).toBe('inci_name.gt."A",and(inci_name.eq."A",annex.gt."II"),and(inci_name.eq."A",annex.eq."II",entry.gt."1")');
  });

  it("quotes a value, so a comma, bracket or quote in an INCI name is data and not filter syntax", () => {
    expect(keysetFilter(["inci_name"], { inci_name: 'PEG-8, (and) "x"' })).toBe('inci_name.gt."PEG-8, (and) \\"x\\""');
  });
});
