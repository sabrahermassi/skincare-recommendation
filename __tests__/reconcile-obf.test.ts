import { fetchStoredFormulas, isParserRefresh, parserOnlyChange } from "../scripts/lib/formula-diff.mjs";
import { parseInci } from "../scripts/lib/inci-parse.mjs";
import { fetchIngredients, formulaChanged, parseLimit } from "../scripts/reconcile-obf.mjs";

/**
 * The parser got better than the one that stored these rows. A rewrite would
 * stamp `formula_changed_at` and tell every user who saved the product that it
 * was reformulated, so a parser-only difference has to be told apart from a real
 * one.
 */
describe("parserOnlyChange", () => {
  const known = new Set(["aqua", "glycerin", "niacinamide"]);
  const stored = [
    { inci_name: "ingredients: aqua", position: 0 },
    { inci_name: "glycerin", position: 1 },
    { inci_name: "niacinamide", position: 2 },
  ];

  it("is true when the label is unchanged and only the stored junk name is cleaned up", () => {
    const fresh = parseInci("Ingredients: Aqua, Glycerin, Niacinamide", known);
    expect(formulaChanged(stored, fresh)).toBe(true);
    expect(parserOnlyChange(stored, fresh, known)).toBe(true);
  });

  it("is false when the label really dropped an ingredient", () => {
    const fresh = parseInci("Ingredients: Aqua, Glycerin", known);
    expect(parserOnlyChange(stored, fresh, known)).toBe(false);
  });

  it("is false when the label really swapped an ingredient", () => {
    const fresh = parseInci("Ingredients: Aqua, Glycerin, Alcohol Denat", known);
    expect(parserOnlyChange(stored, fresh, known)).toBe(false);
  });
});

/**
 * What the two importers pass as `p_parser_refresh` (migration 0021). A product
 * with no stored formula is new or identity-only, which the database already
 * treats as not a change, so it must never be marked a refresh.
 */
describe("isParserRefresh", () => {
  const known = new Set(["aqua", "glycerin"]);
  const fresh = [
    { inci_name: "aqua", position: 0 },
    { inci_name: "glycerin", position: 1 },
  ];

  it("is false for a product with no stored formula", () => {
    expect(isParserRefresh(undefined, fresh, known)).toBe(false);
    expect(isParserRefresh([], fresh, known)).toBe(false);
  });

  it("is true when only a stored junk name was cleaned up", () => {
    const stored = [
      { inci_name: "ingredients: aqua", position: 0 },
      { inci_name: "glycerin", position: 1 },
    ];
    expect(isParserRefresh(stored, fresh, known)).toBe(true);
  });

  it("is false when the stored formula really differs", () => {
    const stored = [{ inci_name: "aqua", position: 0 }];
    expect(isParserRefresh(stored, fresh, known)).toBe(false);
  });
});

describe("fetchStoredFormulas", () => {
  /** A stand-in for supabase-js's builder over a fixed list of rows, honouring `.in` and `.range`. */
  function fakeDb(rows: { product_id: string; inci_name: string; position: number }[]) {
    return {
      from: () => {
        let ids: string[] = [];
        const builder = {
          select: () => builder,
          in: (_col: string, values: string[]) => {
            ids = values;
            return builder;
          },
          order: () => builder,
          range: async (from: number, to: number) => ({
            data: rows.filter((r) => ids.includes(r.product_id)).slice(from, to + 1),
            error: null,
          }),
        };
        return builder;
      },
    };
  }

  it("groups rows by product", async () => {
    const db = fakeDb([
      { product_id: "a", inci_name: "aqua", position: 0 },
      { product_id: "a", inci_name: "glycerin", position: 1 },
      { product_id: "b", inci_name: "aqua", position: 0 },
    ]);
    const byId = await fetchStoredFormulas(db, ["a", "b", "c"]);
    expect(byId.get("a")).toHaveLength(2);
    expect(byId.get("b")).toHaveLength(1);
    expect(byId.has("c")).toBe(false);
  });

  it("reads past the 1000-row page limit instead of silently truncating", async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => ({ product_id: "big", inci_name: `n${i}`, position: i }));
    const byId = await fetchStoredFormulas(fakeDb(rows), ["big"]);
    expect(byId.get("big")).toHaveLength(2300);
  });

  it("throws rather than returning a partial read when the query fails", async () => {
    const failing = {
      from: () => {
        const b = { select: () => b, in: () => b, order: () => b, range: async () => ({ data: null, error: { message: "boom" } }) };
        return b;
      },
    };
    await expect(fetchStoredFormulas(failing, ["a"])).rejects.toThrow(/boom/);
  });
});

describe("parseLimit", () => {
  it("defaults to no limit", () => {
    expect(parseLimit(["node", "script.mjs", "--dry-run"])).toBe(Infinity);
  });

  it("reads a positive whole number", () => {
    expect(parseLimit(["node", "script.mjs", "--limit", "20"])).toBe(20);
  });

  it("refuses a missing, zero, negative or non-numeric value rather than silently doing nothing", () => {
    for (const argv of [
      ["node", "s.mjs", "--limit"],
      ["node", "s.mjs", "--limit", "0"],
      ["node", "s.mjs", "--limit", "-5"],
      ["node", "s.mjs", "--limit", "abc"],
      ["node", "s.mjs", "--limit", "2.5"],
    ]) {
      expect(() => parseLimit(argv)).toThrow(/positive whole number/);
    }
  });
});

/**
 * `formulaChanged` is the whole point of this script: whether a re-check
 * finds the same formula or a different one decides whether a saved
 * product's user ever sees a notice at all.
 */
describe("formulaChanged", () => {
  it("says nothing changed when the names and order match", () => {
    const current = [
      { inci_name: "aqua", position: 0 },
      { inci_name: "glycerin", position: 1 },
    ];
    const fresh = [
      { inci_name: "aqua", position: 0 },
      { inci_name: "glycerin", position: 1 },
    ];
    expect(formulaChanged(current, fresh)).toBe(false);
  });

  it("does not care what order product_ingredients happens to arrive in, only position", () => {
    // A row from a join is not guaranteed to arrive position-sorted.
    const current = [
      { inci_name: "glycerin", position: 1 },
      { inci_name: "aqua", position: 0 },
    ];
    const fresh = [
      { inci_name: "aqua", position: 0 },
      { inci_name: "glycerin", position: 1 },
    ];
    expect(formulaChanged(current, fresh)).toBe(false);
  });

  it("flags a genuinely different ingredient", () => {
    const current = [{ inci_name: "aqua", position: 0 }];
    const fresh = [{ inci_name: "alcohol denat", position: 0 }];
    expect(formulaChanged(current, fresh)).toBe(true);
  });

  it("flags a reordering, even with the same names", () => {
    // Position weighting reads the formula in concentration order — two
    // ingredients swapping places is a real change, not noise.
    const current = [
      { inci_name: "aqua", position: 0 },
      { inci_name: "glycerin", position: 1 },
    ];
    const fresh = [
      { inci_name: "glycerin", position: 0 },
      { inci_name: "aqua", position: 1 },
    ];
    expect(formulaChanged(current, fresh)).toBe(true);
  });

  it("flags an added or removed ingredient", () => {
    const current = [{ inci_name: "aqua", position: 0 }];
    const fresh = [
      { inci_name: "aqua", position: 0 },
      { inci_name: "niacinamide", position: 1 },
    ];
    expect(formulaChanged(current, fresh)).toBe(true);
  });
});

/**
 * Same shape and the same reasoning as `fetchTags`'s own tests in
 * reclassify-from-tags.test.ts: the line between "OBF says no" and "the read
 * failed" decides whether a row is ever re-checked again.
 */
describe("fetchIngredients", () => {
  const realFetch = global.fetch;
  const respond = (init: { status?: number; body?: unknown; text?: string }) => {
    global.fetch = jest.fn().mockResolvedValue({
      status: init.status ?? 200,
      ok: (init.status ?? 200) < 400,
      headers: new Headers(),
      json: async () => {
        if (init.text !== undefined) throw new SyntaxError("Unexpected token < in JSON");
        return init.body;
      },
    }) as unknown as typeof global.fetch;
  };

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("reads the ingredients text off a good response", async () => {
    respond({ body: { status: 1, product: { ingredients_text: "Aqua, Glycerin" } } });
    expect(await fetchIngredients("123")).toEqual({ ok: true, text: "Aqua, Glycerin", attempts: 1 });
  });

  it("trims the text, and tolerates a missing field as empty rather than throwing", async () => {
    respond({ body: { status: 1, product: {} } });
    expect(await fetchIngredients("123")).toEqual({ ok: true, text: "", attempts: 1 });
  });

  // The bug this replaced: a 429 retry is a second real HTTP request, but the
  // main loop only ever incremented its own request counter once per call —
  // so a persistently rate-limited run could spend up to twice the intended
  // MAX_REQUESTS_PER_RUN requests without the ceiling ever noticing. Found by
  // Codex on PR #122.
  it("counts a 429 retry as two attempts, not one", async () => {
    let call = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return {
          status: 429,
          ok: false,
          headers: new Headers({ "retry-after": "0" }),
          json: async () => ({}),
        };
      }
      return {
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => ({ status: 1, product: { ingredients_text: "Aqua" } }),
      };
    }) as unknown as typeof global.fetch;

    expect(await fetchIngredients("123")).toEqual({ ok: true, text: "Aqua", attempts: 2 });
    expect(call).toBe(2);
  });

  it("treats OBF's own status 0 as permanent", async () => {
    respond({ body: { status: 0 } });
    expect(await fetchIngredients("123")).toMatchObject({ ok: false, permanent: true });
  });

  it("treats a 404 as permanent", async () => {
    respond({ status: 404 });
    expect(await fetchIngredients("123")).toMatchObject({ ok: false, permanent: true });
  });

  it("keeps an unparseable 200 retryable rather than calling the product gone", async () => {
    respond({ text: "<html>502 Bad Gateway</html>" });
    expect(await fetchIngredients("123")).toMatchObject({ ok: false, permanent: false });
  });

  it("keeps a 5xx retryable", async () => {
    respond({ status: 503 });
    expect(await fetchIngredients("123")).toMatchObject({ ok: false, permanent: false });
  });

  it("keeps a valid-JSON-but-unexpected shape retryable, not just status 0", async () => {
    respond({ body: { error: "upstream unavailable" } });
    expect(await fetchIngredients("123")).toMatchObject({ ok: false, permanent: false });
  });

  it("keeps status 1 with no product retryable", async () => {
    respond({ body: { status: 1 } });
    expect(await fetchIngredients("123")).toMatchObject({ ok: false, permanent: false });
  });
});
