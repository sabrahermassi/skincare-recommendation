import {
  consumeRateLimit,
  resetRateLimits,
  withinRateLimit,
  type RateLimit,
  type RateLimitDb,
} from "@/lib/rate-limit";

/**
 * `lib/rate-limit.ts` re-exports `supabase/functions/_shared/rate-limit.ts`
 * verbatim, so everything below exercises the exact module the Edge Functions
 * run.
 *
 * What is testable here is deliberately only half the limiter. The counting
 * itself lives in Postgres — `consume_rate_limit` in migration 0016 — because
 * an atomic upsert is the whole point and a JavaScript reimplementation of it
 * would prove nothing about the thing that ships. What this file pins is the
 * part with the interesting failure modes: which layer answers, and what
 * happens when the database does not.
 */

const LIMIT: RateLimit = { windowSeconds: 60, maxRequests: 3 };

/** A database whose RPC always answers the same way, recording every call. */
function db(answer: { data: unknown; error: unknown }): RateLimitDb & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    rpc(_fn, args) {
      calls.push(args);
      return Promise.resolve(answer);
    },
  };
}

beforeEach(() => {
  resetRateLimits();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the in-memory fallback", () => {
  it("allows up to the limit and refuses past it", () => {
    for (let i = 0; i < LIMIT.maxRequests; i++) {
      expect(withinRateLimit("1.2.3.4", LIMIT)).toBe(true);
    }
    expect(withinRateLimit("1.2.3.4", LIMIT)).toBe(false);
  });

  it("counts each caller separately", () => {
    for (let i = 0; i < LIMIT.maxRequests; i++) withinRateLimit("1.2.3.4", LIMIT);
    expect(withinRateLimit("1.2.3.4", LIMIT)).toBe(false);
    expect(withinRateLimit("5.6.7.8", LIMIT)).toBe(true);
  });

  it("forgets hits once their window has passed", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    for (let i = 0; i < LIMIT.maxRequests; i++) withinRateLimit("1.2.3.4", LIMIT);
    expect(withinRateLimit("1.2.3.4", LIMIT)).toBe(false);

    // One millisecond past the window, every recorded hit is outside it.
    now.mockReturnValue(1_000_000 + LIMIT.windowSeconds * 1000 + 1);
    expect(withinRateLimit("1.2.3.4", LIMIT)).toBe(true);
  });
});

describe("the durable check", () => {
  it("passes the operation, the caller and the limit to the database", async () => {
    const d = db({ data: true, error: null });
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT);

    expect(d.calls).toEqual([
      {
        p_bucket: "label-ocr",
        p_caller: "1.2.3.4",
        p_window_seconds: LIMIT.windowSeconds,
        p_max_requests: LIMIT.maxRequests,
      },
    ]);
  });

  it("refuses when the database says so, even with room in memory", async () => {
    const d = db({ data: false, error: null });
    expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT)).toBe(false);
    // The point of the shared counter: another isolate already spent this
    // caller's allowance, so the local map's opinion is irrelevant.
    expect(d.calls).toHaveLength(1);
  });

  /**
   * The ordering matters for cost, not just for correctness: a caller already
   * over the local limit is refused without a round trip. Pinned because the
   * cheap check being second would be invisible — the answer is the same
   * either way, only the database load differs.
   */
  it("does not reach the database once the in-memory limit is spent", async () => {
    const d = db({ data: true, error: null });
    for (let i = 0; i < LIMIT.maxRequests; i++) {
      expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT)).toBe(true);
    }
    expect(d.calls).toHaveLength(LIMIT.maxRequests);

    expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT)).toBe(false);
    expect(d.calls).toHaveLength(LIMIT.maxRequests);
  });

  it("keeps separate counts per operation", async () => {
    const d = db({ data: true, error: null });
    for (let i = 0; i < LIMIT.maxRequests; i++) {
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT);
    }
    // Same caller, different operation: a spent photo allowance must not
    // refuse a barcode lookup, which costs a different amount.
    expect(await consumeRateLimit(d, "product-lookup", "1.2.3.4", LIMIT)).toBe(true);
  });
});

describe("when the database cannot answer", () => {
  /**
   * The load-bearing decision in this module. A failed check must not fail
   * open past the in-memory limit, and must not fail closed either — a
   * database blip turning every scan into "Too many requests" tells the user
   * to slow down when the problem is ours.
   */
  const FAILURES: [string, { data: unknown; error: unknown }][] = [
    ["the rpc returns an error", { data: null, error: { message: "boom" } }],
    ["the rpc returns a non-boolean", { data: "yes", error: null }],
  ];

  it.each(FAILURES)(
    "falls back to the in-memory limit when %s",
    async (_label: string, answer: { data: unknown; error: unknown }) => {
      const d = db(answer);

      // Allowed while the local allowance lasts...
      for (let i = 0; i < LIMIT.maxRequests; i++) {
        expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT)).toBe(true);
      }
      // ...and refused after it, rather than unbounded.
      expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT)).toBe(false);
    },
  );

  it("falls back when the rpc throws rather than resolving", async () => {
    const thrower: RateLimitDb = {
      rpc: () => Promise.reject(new Error("connection reset")),
    };

    for (let i = 0; i < LIMIT.maxRequests; i++) {
      expect(await consumeRateLimit(thrower, "label-ocr", "1.2.3.4", LIMIT)).toBe(true);
    }
    expect(await consumeRateLimit(thrower, "label-ocr", "1.2.3.4", LIMIT)).toBe(false);
  });

  /**
   * A limiter silently running in fallback mode for a week is
   * indistinguishable from one that works. The log line is the only thing
   * that tells anyone.
   */
  it("says so in the logs", async () => {
    const d = db({ data: null, error: { message: "boom" } });
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("durable check failed"),
      expect.anything(),
    );
  });
});

describe("refusal logging", () => {
  /**
   * Without this the only place a throttled caller shows up is the provider's
   * invoice. It is also what separates "someone is hammering us" from "we got
   * popular", which is not a distinction anyone can make after the fact.
   */
  it("records a refusal the shared counter made, with the request id", async () => {
    const d = db({ data: false, error: null });
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, "req-abc");

    expect(console.warn).toHaveBeenCalledWith(
      "[rate-limit] refused bucket=label-ocr caller=1.2.3.4 layer=shared request=req-abc",
    );
  });

  /**
   * The `layer` field is the one worth having. A local refusal is one isolate
   * seeing enough traffic by itself; a shared one means the caller had already
   * spent its allowance on another isolate, which is the isolate-hopping this
   * migration exists to catch. Same line without it.
   */
  it("distinguishes a local refusal from a shared one", async () => {
    const d = db({ data: true, error: null });
    for (let i = 0; i < LIMIT.maxRequests; i++) {
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, "req-1");
    }
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, "req-2");

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("layer=local"));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("request=req-2"));
  });

  it("says nothing while requests are allowed", async () => {
    const d = db({ data: true, error: null });
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, "req-1");
    expect(console.warn).not.toHaveBeenCalled();
  });

  /**
   * A missing id should cost a log line its correlation, never a caller its
   * limit — so the parameter has a default rather than being required.
   */
  it("still refuses when no request id is supplied", async () => {
    const d = db({ data: false, error: null });
    expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT)).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("request=-"));
  });
});
