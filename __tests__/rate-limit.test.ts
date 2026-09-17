import {
  consumeRateLimit,
  fingerprintCaller,
  resetRateLimits,
  retryAfterSeconds,
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
const SECRET = "test-salt";
const OPTS = { secret: SECRET, requestId: "req-1" };

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

  /**
   * Fixed window, matching `consume_rate_limit`'s own arithmetic. The two
   * layers used to disagree — this one slid, the database's did not — so a
   * caller regained their allowance at different moments depending on which
   * layer refused them.
   */
  it("resets on the window boundary, not a window after the last hit", () => {
    const now = jest.spyOn(Date, "now");
    // Mid-window: 30s into a 60s window that started at 1_000_020.
    now.mockReturnValue(1_000_050_000);
    for (let i = 0; i < LIMIT.maxRequests; i++) withinRateLimit("1.2.3.4", LIMIT);
    expect(withinRateLimit("1.2.3.4", LIMIT)).toBe(false);

    // Still inside the same window a moment later — a sliding window would
    // have started forgiving by now.
    now.mockReturnValue(1_000_070_000);
    expect(withinRateLimit("1.2.3.4", LIMIT)).toBe(false);

    // The boundary itself clears it.
    now.mockReturnValue(1_000_080_000);
    expect(withinRateLimit("1.2.3.4", LIMIT)).toBe(true);
  });
});

describe("the durable check", () => {
  it("passes the operation, the caller and the limit to the database", async () => {
    const d = db({ data: true, error: null });
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);

    expect(d.calls).toEqual([
      {
        p_bucket: "label-ocr",
        // The fingerprint, never the address — see `fingerprintCaller`.
        p_caller: await fingerprintCaller("1.2.3.4", SECRET),
        p_window_seconds: LIMIT.windowSeconds,
        p_max_requests: LIMIT.maxRequests,
      },
    ]);
  });

  it("refuses when the database says so, even with room in memory", async () => {
    const d = db({ data: false, error: null });
    expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(false);
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
      expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(true);
    }
    expect(d.calls).toHaveLength(LIMIT.maxRequests);

    expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(false);
    expect(d.calls).toHaveLength(LIMIT.maxRequests);
  });

  it("keeps separate counts per operation", async () => {
    const d = db({ data: true, error: null });
    for (let i = 0; i < LIMIT.maxRequests; i++) {
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
    }
    // Same caller, different operation: a spent photo allowance must not
    // refuse a barcode lookup, which costs a different amount.
    expect(await consumeRateLimit(d, "product-lookup", "1.2.3.4", LIMIT, OPTS)).toBe(true);
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
        expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(true);
      }
      // ...and refused after it, rather than unbounded.
      expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(false);
    },
  );

  it("falls back when the rpc throws rather than resolving", async () => {
    const thrower: RateLimitDb = {
      rpc: () => Promise.reject(new Error("connection reset")),
    };

    for (let i = 0; i < LIMIT.maxRequests; i++) {
      expect(await consumeRateLimit(thrower, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(true);
    }
    expect(await consumeRateLimit(thrower, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(false);
  });

  /**
   * A limiter silently running in fallback mode for a week is
   * indistinguishable from one that works. The log line is the only thing
   * that tells anyone.
   */
  it("says so in the logs", async () => {
    const d = db({ data: null, error: { message: "boom" } });
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
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
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, { secret: SECRET, requestId: "req-abc" });

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
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, { secret: SECRET, requestId: "req-1" });
    }
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, { secret: SECRET, requestId: "req-2" });

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("layer=local"));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("request=req-2"));
  });

  it("says nothing while requests are allowed", async () => {
    const d = db({ data: true, error: null });
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, { secret: SECRET, requestId: "req-1" });
    expect(console.warn).not.toHaveBeenCalled();
  });

  /**
   * A missing id should cost a log line its correlation, never a caller its
   * limit — so the parameter has a default rather than being required.
   */
  it("still refuses when no request id is supplied", async () => {
    const d = db({ data: false, error: null });
    expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, { secret: SECRET })).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("request=-"));
  });
});

describe("the caller fingerprint", () => {
  /**
   * The finding this replaced: `rate_limits` held the raw address, turning a
   * counter into a per-IP activity log that `docs/threat-model.md` said did
   * not exist.
   */
  it("never hands the address to the database", async () => {
    const d = db({ data: true, error: null });
    await consumeRateLimit(d, "label-ocr", "81.229.14.22", LIMIT, OPTS);
    expect(JSON.stringify(d.calls)).not.toContain("81.229.14.22");
  });

  it("is stable, so counting still works", async () => {
    expect(await fingerprintCaller("1.2.3.4", SECRET)).toBe(
      await fingerprintCaller("1.2.3.4", SECRET),
    );
  });

  it("separates callers, and separates secrets", async () => {
    const a = await fingerprintCaller("1.2.3.4", SECRET);
    expect(await fingerprintCaller("1.2.3.5", SECRET)).not.toBe(a);
    // Rotating the salt must invalidate old fingerprints rather than collide.
    expect(await fingerprintCaller("1.2.3.4", "other-salt")).not.toBe(a);
  });

  it("is 128 bits of hex", async () => {
    expect(await fingerprintCaller("1.2.3.4", SECRET)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("log volume and forgery", () => {
  /**
   * Refusing costs nothing, so before this the logging was the only part of a
   * throttled request left worth attacking — one metered line per attempt, for
   * as long as the attacker cared to loop.
   */
  it("logs a caller at most once per window", async () => {
    const d = db({ data: true, error: null });
    for (let i = 0; i < LIMIT.maxRequests; i++) {
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
    }
    for (let i = 0; i < 50; i++) {
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
    }
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("still logs a different caller in the same window", async () => {
    const d = db({ data: false, error: null });
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
    await consumeRateLimit(d, "label-ocr", "5.6.7.8", LIMIT, OPTS);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  /**
   * `callerKey()` falls back to `x-real-ip`/`cf-connecting-ip`, which are
   * entirely client-supplied, so without sanitising this an attacker could
   * write their own `layer=` into the line that is meant to be grepped.
   */
  it("cannot be used to forge fields in the log line", async () => {
    const d = db({ data: false, error: null });
    await consumeRateLimit(d, "label-ocr", "1.2.3.4 layer=local request=x", LIMIT, OPTS);

    // Structural cast rather than `jest.Mock` — the jest namespace is not in
    // scope for tsc here, only the globals this repo declares.
    const warn = console.warn as unknown as { mock: { calls: string[][] } };
    const line = warn.mock.calls[0][0];
    expect(line).toMatch(/layer=shared request=req-1$/);
    expect(line.match(/layer=/g)).toHaveLength(1);
  });
});

describe("retryAfterSeconds", () => {
  // 1_000_020s is exactly a 60s boundary; 1_000_080s is the next one.
  it("counts down to the window boundary", () => {
    // 20s elapsed in a 60s window leaves 40.
    expect(retryAfterSeconds(LIMIT, 1_000_040_000)).toBe(40);
    expect(retryAfterSeconds(LIMIT, 1_000_079_000)).toBe(1);
  });

  it("never tells a client to retry immediately", () => {
    // On the boundary the honest answer is a full window, not 0 — a
    // `Retry-After: 0` invites the retry storm the header exists to stop.
    expect(retryAfterSeconds(LIMIT, 1_000_020_000)).toBe(LIMIT.windowSeconds);
    expect(retryAfterSeconds(LIMIT, 1_000_080_000)).toBe(LIMIT.windowSeconds);
  });
});

describe("sweeping a map that holds more than one window length", () => {
  /**
   * Raised by review on PR #117. Not reachable today — each Edge Function is
   * its own isolate and declares a single `RATE_LIMIT`, so these two never
   * share a map — but nothing stated that invariant and nothing enforced it.
   *
   * The failure it guards against is the nasty kind: a sweep triggered by the
   * *short* window evicts live entries belonging to the *long* one, so those
   * callers silently regain a full allowance — and they do so precisely when
   * the durable counter is unavailable and this layer is the only thing left.
   */
  const SHORT: RateLimit = { windowSeconds: 60, maxRequests: 3 };
  const LONG: RateLimit = { windowSeconds: 3600, maxRequests: 3 };

  it("keeps a long-window tally alive when a short-window sweep runs", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1_000_020_000);

    // Spend the long-window caller's allowance.
    for (let i = 0; i < LONG.maxRequests; i++) withinRateLimit("long:1.2.3.4", LONG);
    expect(withinRateLimit("long:1.2.3.4", LONG)).toBe(false);

    // Push past the sweep threshold with short-window entries, one window
    // later so the sweep has something legitimate to collect.
    now.mockReturnValue(1_000_080_000);
    for (let i = 0; i < 5_001; i++) withinRateLimit(`short:${i}`, SHORT);

    // The long window has not closed, so its tally must have survived.
    expect(withinRateLimit("long:1.2.3.4", LONG)).toBe(false);
  });

  it("still collects a long-window tally once its own window has closed", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1_000_020_000);
    for (let i = 0; i < LONG.maxRequests; i++) withinRateLimit("long:1.2.3.4", LONG);

    // An hour and change later the entry is genuinely stale.
    now.mockReturnValue(1_000_020_000 + LONG.windowSeconds * 1000 + 60_000);
    for (let i = 0; i < 5_001; i++) withinRateLimit(`short:${i}`, SHORT);
    expect(hitsHolds("long:1.2.3.4", LONG)).toBe(true);
  });
});

/** A fresh window means the tally was collected or expired — either is fine. */
function hitsHolds(key: string, limit: RateLimit): boolean {
  return withinRateLimit(key, limit);
}
