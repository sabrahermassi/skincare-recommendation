import { capDelay, fetchTags, parseLimit, proposeChange } from "../scripts/reclassify-from-tags.mjs";

/**
 * The decisions `reclassify-from-tags.mjs` makes that aren't I/O. It is the
 * only script allowed to overwrite a type that already looks right, so the
 * rule about what it will and won't write is worth pinning.
 */

describe("parseLimit", () => {
  it("defaults to no limit", () => {
    expect(parseLimit(["node", "script.mjs", "--dry-run"])).toBe(Infinity);
  });

  it("reads a positive whole number", () => {
    expect(parseLimit(["node", "script.mjs", "--limit", "60"])).toBe(60);
  });

  // The bug this replaced: `Number(undefined)` is NaN, `slice(0, NaN)` is
  // empty, and the run reported "0 candidates" as though all was well.
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

describe("proposeChange", () => {
  const row = { id: "obf-1", brand: "B", name: "N", type: "sunscreen" };

  it("proposes a change when the fresh guess differs", () => {
    expect(proposeChange(row, "lip-balm")).toMatchObject({ id: "obf-1", type: "sunscreen", now: "lip-balm" });
  });

  it("proposes nothing when the guess agrees with what's stored", () => {
    expect(proposeChange(row, "sunscreen")).toBeNull();
  });

  it("never trades a real type for unknown", () => {
    // The row already carries a guess made from this same evidence; replacing
    // it with "unknown" is a regression, not a repair.
    expect(proposeChange(row, "unknown")).toBeNull();
  });

  it("does fill in a row that is currently unknown", () => {
    expect(proposeChange({ ...row, type: "unknown" }, "serum")).toMatchObject({ now: "serum" });
  });
});

/**
 * `fetchTags` decides which misses get checkpointed, and a row checkpointed by
 * mistake is never read again — so the line between "OBF says no" and "the read
 * failed" is the one thing here worth testing over the network boundary.
 */
describe("fetchTags", () => {
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

  it("reads the tags off a good response", async () => {
    respond({ body: { status: 1, product: { categories_tags: ["en:eye-cream"] } } });
    expect(await fetchTags("123")).toEqual({ ok: true, tags: ["en:eye-cream"] });
  });

  it("treats OBF's own status 0 as permanent", async () => {
    respond({ body: { status: 0 } });
    expect(await fetchTags("123")).toMatchObject({ ok: false, permanent: true });
  });

  it("treats a 404 as permanent", async () => {
    respond({ status: 404 });
    expect(await fetchTags("123")).toMatchObject({ ok: false, permanent: true });
  });

  // The bug this replaced: a truncated body or an HTML error page from a proxy
  // parsed to null, read as "no such product", and checkpointed the row — so a
  // momentary blip permanently stopped that product from ever being repaired.
  it("keeps an unparseable 200 retryable rather than calling the product gone", async () => {
    respond({ text: "<html>502 Bad Gateway</html>" });
    expect(await fetchTags("123")).toMatchObject({ ok: false, permanent: false });
  });

  it("keeps a 5xx retryable", async () => {
    respond({ status: 503 });
    expect(await fetchTags("123")).toMatchObject({ ok: false, permanent: false });
  });
});

describe("capDelay", () => {
  it("passes a sane Retry-After through untouched", () => {
    expect(capDelay(5_000)).toBe(5_000);
  });

  it("caps a delay that would park the run for hours", () => {
    // Nothing bounds a server-supplied Retry-After; a large number or an HTTP
    // date days out would otherwise stall the repair.
    expect(capDelay(6 * 60 * 60 * 1000)).toBe(60_000);
  });

  it("clamps a negative delay to zero", () => {
    // retryAfterMs already returns 0 for a past date; this holds the floor
    // regardless of what it is handed.
    expect(capDelay(-1)).toBe(0);
  });
});
