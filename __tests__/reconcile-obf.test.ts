import { fetchStoredFormulas, isParserRefresh, parserOnlyChange } from "../scripts/lib/formula-diff.mjs";
import { parseInci } from "../scripts/lib/inci-parse.mjs";
import { decideWrite, fetchBarcodeRows, fetchIngredients, formulaChanged, isRefinement, parseBarcodes, parseLimit, replaceArgs, unchangedUpdate, unreadBarcodes } from "../scripts/reconcile-obf.mjs";

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

describe("parseBarcodes", () => {
  it("is null for an ordinary run", () => {
    expect(parseBarcodes(["node", "script.mjs", "--dry-run"])).toBeNull();
  });

  it("reads a comma-separated list, once each", () => {
    expect(parseBarcodes(["node", "script.mjs", "--barcode", "3600541144019, 7798130373882,3600541144019"])).toEqual(["3600541144019", "7798130373882"]);
  });

  it("refuses more barcodes than one run reconciles, rather than leaving the rest unread", () => {
    const many = Array.from({ length: 301 }, (_, i) => String(10_000_000 + i)).join(",");
    expect(() => parseBarcodes(["node", "script.mjs", "--barcode", many])).toThrow("at most 300");
    expect(parseBarcodes(["node", "script.mjs", "--barcode", many.split(",").slice(0, 300).join(",")])).toHaveLength(300);
  });

  it.each([[undefined], [""], ["abc"], ["123"], ["3600541144019,xyz"]])("refuses %p, so a typo can't quietly re-read nothing", (value: string | undefined) => {
    expect(() => parseBarcodes(["node", "script.mjs", "--barcode", ...(value === undefined ? [] : [value])])).toThrow("--barcode needs");
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
    expect(await fetchIngredients("123")).toEqual({ ok: true, text: "Aqua, Glycerin", photographedAt: null, attempts: 1 });
  });

  it("trims the text, and tolerates a missing field as empty rather than throwing", async () => {
    respond({ body: { status: 1, product: {} } });
    expect(await fetchIngredients("123")).toEqual({ ok: true, text: "", photographedAt: null, attempts: 1 });
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

    expect(await fetchIngredients("123")).toEqual({ ok: true, text: "Aqua", photographedAt: null, attempts: 2 });
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

describe("fetchBarcodeRows", () => {
  /** A stand-in for the query builder: records each `.in()` and answers with a row per barcode asked for. */
  function fakeDb(rowFor: (code: string) => object | null) {
    const calls: { filters: string[]; codes: string[] }[] = [];
    const db = {
      from: () => {
        const call = { filters: [] as string[], codes: [] as string[] };
        const query: Record<string, unknown> = {};
        query.select = () => query;
        query.eq = (column: string, value: unknown) => (call.filters.push(`eq ${column}=${value}`), query);
        query.is = (column: string, value: unknown) => (call.filters.push(`is ${column}=${value}`), query);
        query.in = (_column: string, codes: string[]) => {
          call.codes = codes;
          calls.push(call);
          return Promise.resolve({ data: codes.flatMap((code) => rowFor(code) ?? []), error: null });
        };
        return query;
      },
    };
    return { db, calls };
  }

  it("reads obf rows only, once, a hundred barcodes to a query", async () => {
    const codes = Array.from({ length: 250 }, (_, i) => String(10_000_000 + i));
    const { db, calls } = fakeDb((barcode) => ({ barcode }));
    const rows = await fetchBarcodeRows(db, codes);
    expect(calls.map((call) => call.codes.length)).toEqual([100, 100, 50]);
    expect(calls.every((call) => call.filters.join() === "eq source=obf,is expires_at=null")).toBe(true);
    expect(rows).toHaveLength(250);
  });

  it("says which listed barcodes no row came back for", async () => {
    const { db } = fakeDb((barcode) => (barcode === "11111111" ? null : { barcode }));
    const rows = await fetchBarcodeRows(db, ["11111111", "22222222"]);
    expect(unreadBarcodes(["11111111", "22222222"], rows)).toEqual(["11111111"]);
    expect(unreadBarcodes(["22222222"], rows)).toEqual([]);
  });

  it("surfaces a database error instead of reading nothing", async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ in: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }) }) }) };
    await expect(fetchBarcodeRows(db, ["11111111"])).rejects.toThrow("products by barcode: boom");
  });
});

describe("decideWrite", () => {
  const known = new Set(["aqua", "water", "glycerin", "acrylamide", "acrylamide/sodium acryloyldimethyltaurate copolymer"]);
  const stored = (...names: string[]) => names.map((inci_name, position) => ({ inci_name, position }));

  it("leaves a formula that reads the same alone", () => {
    expect(decideWrite(stored("aqua", "glycerin"), stored("aqua", "glycerin"), false, known, undefined)).toBe("unchanged");
    expect(decideWrite(stored("aqua", "glycerin"), stored("aqua", "glycerin"), true, known, undefined)).toBe("unchanged");
  });

  it("stamps a reformulation when the label moved and today's parser doesn't explain it", () => {
    expect(decideWrite(stored("aqua", "glycerin"), stored("aqua", "acrylamide"), false, known, undefined)).toBe("reformulated");
  });

  it("refreshes, with no stamp, a difference today's parser explains", () => {
    // Stored by an older parser as "aqua/water"; today's reads it as aqua.
    expect(decideWrite(stored("aqua/water", "glycerin"), stored("aqua", "glycerin"), false, known, undefined)).toBe("refresh");
  });

  it("refreshes, with no stamp, a repair that only refines names, even one the stored names can't explain", () => {
    // `acrylamide` is all the old parser kept of a whole polymer name, so re-parsing it can't give the name back.
    const before = stored("aqua", "acrylamide", "glycerin");
    const after = stored("aqua", "acrylamide/sodium acryloyldimethyltaurate copolymer", "glycerin");
    expect(decideWrite(before, after, false, known, undefined)).toBe("reformulated");
    expect(decideWrite(before, after, true, known, undefined)).toBe("refresh");
  });

  it("stamps a reformulation found in a repair, so the repair can't hide it", () => {
    const before = stored("aqua", "glycerin");
    expect(decideWrite(before, stored("aqua", "glycerin", "acrylamide"), true, known, undefined)).toBe("reformulated");
    expect(decideWrite(before, stored("aqua"), true, known, undefined)).toBe("reformulated");
    expect(decideWrite(before, stored("glycerin", "aqua"), true, known, undefined)).toBe("reformulated");
    // A refined name beside an ingredient that really changed.
    expect(decideWrite(stored("aqua", "acrylamide", "glycerin"), stored("aqua", "acrylamide/sodium acryloyldimethyltaurate copolymer", "water"), true, known, undefined)).toBe("reformulated");
  });
});

describe("replaceArgs", () => {
  const row = {
    id: "p1",
    barcode: "3600541144019",
    brand: "B",
    name: "N",
    type: "serum",
    area: null,
    description: null,
    image_url: null,
    volume: null,
    in_stock: true,
    suitable_for: [],
    targets: [],
    source: "obf",
    attribution: null,
    expires_at: null,
    // Read alongside the row, but not columns `replace_product_with_ingredients` takes.
    fetched_at: "2026-10-01T00:00:00Z",
    product_ingredients: [{ inci_name: "aqua", position: 0 }],
  };
  const fresh = [{ inci_name: "aqua", position: 0 }, { inci_name: "glycerin", position: 1 }];

  it("never stamps formula_changed_at on a refresh", () => {
    const args: Record<string, unknown> = replaceArgs(row, fresh, "refresh");
    expect(args.p_parser_refresh).toBe(true);
    expect("p_formula_changed_at" in args).toBe(false);
  });

  it("stamps formula_changed_at, in the same call, on a reformulation", () => {
    const args: Record<string, unknown> = replaceArgs(row, fresh, "reformulated");
    expect(typeof args.p_formula_changed_at).toBe("string");
    expect(Number.isNaN(Date.parse(String(args.p_formula_changed_at)))).toBe(false);
    expect("p_parser_refresh" in args).toBe(false);
  });

  it("passes the new formula and only the product's own columns", () => {
    for (const action of ["refresh", "reformulated"]) {
      const args: Record<string, unknown> = replaceArgs(row, fresh, action);
      expect(args.p_ingredients).toBe(fresh);
      expect(Object.keys(args.p_product as object).sort()).toEqual(
        ["id", "barcode", "brand", "name", "type", "area", "description", "image_url", "volume", "in_stock", "suitable_for", "targets", "source", "attribution", "expires_at"].sort()
      );
    }
  });

  it("refuses to build a write for an unchanged formula", () => {
    expect(() => replaceArgs(row, fresh, "unchanged")).toThrow("nothing to write");
  });

  it("carries the photo date when this read looked, null included, and no key when it did not (#446)", () => {
    const product = (photographedAt?: string | null) => (replaceArgs(row, fresh, "refresh", photographedAt) as { p_product: Record<string, unknown> }).p_product;
    expect(product("2018-04-08T17:29:34.000Z").ingredients_photographed_at).toBe("2018-04-08T17:29:34.000Z");
    expect(product(null)).toHaveProperty("ingredients_photographed_at", null);
    // No key: the function keeps the date already stored (migration 0034).
    expect("ingredients_photographed_at" in product()).toBe(false);
  });
});

describe("unchangedUpdate", () => {
  const now = new Date("2026-10-07T00:00:00.000Z");

  it("confirms the row today and records how old its list is, so an old row gets the date (#446)", () => {
    expect(unchangedUpdate("2018-04-08T17:29:34.000Z", now)).toEqual({ fetched_at: "2026-10-07T00:00:00.000Z", ingredients_photographed_at: "2018-04-08T17:29:34.000Z" });
    expect(unchangedUpdate(null, now)).toEqual({ fetched_at: "2026-10-07T00:00:00.000Z", ingredients_photographed_at: null });
  });

  it("touches only the confirmation date when the read did not look at the photos", () => {
    expect(unchangedUpdate(undefined, now)).toEqual({ fetched_at: "2026-10-07T00:00:00.000Z" });
  });
});

describe("isRefinement", () => {
  const names = (...list: string[]) => list.map((inci_name, position) => ({ inci_name, position }));

  it.each([
    ["a name split by a stray comma, joined again", ["aqua", "acrylamide", "sodium", "acryloyldimethyltaurate copolymer", "cetyl alcohol"], ["aqua", "acrylamide/sodium acryloyldimethyltaurate copolymer", "cetyl alcohol"]],
    ["a name folded to its first word, restored", ["aqua", "acrylamide", "glycerin"], ["aqua", "acrylamide/ammonium acrylate copolymer", "glycerin"]],
    ["a comma before the last word", ["polysorbate 80", "acrylonitrile", "copolymer", "cetyl alcohol"], ["polysorbate 80", "acrylonitrile/methyl methacrylate/vinylidene chloride copolymer", "cetyl alcohol"]],
    ["a blend split in two", ["phenyl trimethicone", "acrylamide", "soybean oil peg-8 esters"], ["phenyl trimethicone", "acrylamide/sodium acrylate copolymer", "trideceth-6", "soybean oil peg-8 esters"]],
  ])("is true for %s", (_label: string, before: string[], after: string[]) => {
    expect(isRefinement(names(...before), names(...after))).toBe(true);
  });

  it.each([
    ["an ingredient added", ["aqua", "glycerin"], ["aqua", "glycerin", "dimethicone"]],
    ["an ingredient removed", ["aqua", "glycerin", "dimethicone"], ["aqua", "glycerin"]],
    ["an ingredient swapped", ["aqua", "glycerin"], ["aqua", "dimethicone"]],
    ["only the order moved", ["aqua", "glycerin"], ["glycerin", "aqua"]],
    ["a repaired name beside a real change", ["aqua", "acrylamide", "glycerin"], ["aqua", "acrylamide/sodium acryloyldimethyltaurate copolymer", "silica", "dimethicone"]],
    ["nothing changed", ["aqua", "glycerin"], ["aqua", "glycerin"]],
  ])("is false for %s", (_label: string, before: string[], after: string[]) => {
    expect(isRefinement(names(...before), names(...after))).toBe(false);
  });
});
