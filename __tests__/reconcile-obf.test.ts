import { fetchIngredients, formulaChanged, parseLimit } from "../scripts/reconcile-obf.mjs";

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
    expect(await fetchIngredients("123")).toEqual({ ok: true, text: "Aqua, Glycerin" });
  });

  it("trims the text, and tolerates a missing field as empty rather than throwing", async () => {
    respond({ body: { status: 1, product: {} } });
    expect(await fetchIngredients("123")).toEqual({ ok: true, text: "" });
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
