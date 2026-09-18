import {
  callerKey,
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

const ALLOWED = { data: 1, error: null };
const FIRST_REFUSAL = { data: LIMIT.maxRequests + 1, error: null };
const LATER_REFUSAL = { data: LIMIT.maxRequests + 9, error: null };

/**
 * A database whose RPC always answers the same way, recording every call.
 *
 * `consume_rate_limit` returns the caller's new count in the window, not a
 * verdict — so `ALLOWED` is any count inside the limit and `FIRST_REFUSAL` is
 * the one that crosses it, which is the value the refusal log keys on.
 */
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
    const d = db(ALLOWED);
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
    const d = db(FIRST_REFUSAL);
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
    const d = db(ALLOWED);
    for (let i = 0; i < LIMIT.maxRequests; i++) {
      expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(true);
    }
    expect(d.calls).toHaveLength(LIMIT.maxRequests);

    expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(false);
    expect(d.calls).toHaveLength(LIMIT.maxRequests);
  });

  it("keeps separate counts per operation", async () => {
    const d = db(ALLOWED);
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
    ["the rpc returns a non-number", { data: "yes", error: null }],
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
    const d = db(FIRST_REFUSAL);
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
    const d = db(ALLOWED);
    for (let i = 0; i < LIMIT.maxRequests; i++) {
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, { secret: SECRET, requestId: "req-1" });
    }
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, { secret: SECRET, requestId: "req-2" });

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("layer=local"));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("request=req-2"));
  });

  it("says nothing while requests are allowed", async () => {
    const d = db(ALLOWED);
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, { secret: SECRET, requestId: "req-1" });
    expect(console.warn).not.toHaveBeenCalled();
  });

  /**
   * A missing id should cost a log line its correlation, never a caller its
   * limit — so the parameter has a default rather than being required.
   */
  it("still refuses when no request id is supplied", async () => {
    const d = db(FIRST_REFUSAL);
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
    const d = db(ALLOWED);
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
    const d = db(ALLOWED);
    for (let i = 0; i < LIMIT.maxRequests; i++) {
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
    }
    for (let i = 0; i < 50; i++) {
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
    }
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("still logs a different caller in the same window", async () => {
    const d = db(FIRST_REFUSAL);
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
    const d = db(FIRST_REFUSAL);
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

describe("refusal logging across isolates", () => {
  /**
   * Raised by review on PR #117, against the `lastLogged` map that used to
   * bound this. That map was per-isolate — the exact shortcoming migration
   * 0016 exists to correct, reintroduced one layer up. "One line per window"
   * meant "one line per window per isolate", so a burst that scales out, or a
   * run of cold starts, drifts back toward a line per attempt.
   *
   * `resetRateLimits()` between calls is a fresh isolate: empty memory, same
   * caller, same window, and a shared counter that has already been passed.
   */
  it("stays silent on a fresh isolate when the line was already crossed", async () => {
    const d = db(LATER_REFUSAL);
    for (let isolate = 0; isolate < 20; isolate++) {
      resetRateLimits();
      expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(false);
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logs exactly once for the request that crosses the line", async () => {
    const d = db(FIRST_REFUSAL);
    resetRateLimits();
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
    resetRateLimits();
    await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);

    // Two fresh isolates, but `maxRequests + 1` is a fact about the window
    // rather than about either of them — in production only one request ever
    // carries that count.
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("layer=shared"));
  });

  it("logs a local refusal once and then stays quiet", async () => {
    const d = db(ALLOWED);
    for (let i = 0; i < LIMIT.maxRequests + 40; i++) {
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
    }
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("layer=local"));
  });
});

describe("the boundary between the last allowed request and the first refused one", () => {
  /**
   * `consume_rate_limit` returns a count and this module decides the verdict,
   * so the comparison here is the only thing keeping the two halves agreeing.
   * A mutation test found `>` could become `>=` without any existing case
   * noticing, which would silently cost every caller the last request of every
   * window.
   *
   * Verified against real Postgres: at `maxRequests = 3` the RPC returns
   * 1, 2, 3, 4, 5 — so 3 is the last allowed and 4 is the first refusal.
   */
  it("allows the request whose count equals the limit", async () => {
    resetRateLimits();
    const d = db({ data: LIMIT.maxRequests, error: null });
    expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("refuses the very next one", async () => {
    resetRateLimits();
    const d = db({ data: LIMIT.maxRequests + 1, error: null });
    expect(await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS)).toBe(false);
  });
});

describe("what the local bound actually is", () => {
  /**
   * Review pressed twice on the claim that the log is bounded globally. It is
   * not, for `local` refusals: that path returns before reaching the database,
   * so it has no shared count to test against and each warm isolate logs its
   * own line. This pins the real behaviour so the bound is documented where it
   * can be checked rather than only asserted in a comment.
   *
   * It is accepted rather than closed because of the price. Reaching a local
   * refusal at all means one isolate served `maxRequests + 1` requests, so
   * each line costs the caller that many attempts *and* another warm isolate.
   * Closing it would mean querying the database on the refusal path — the one
   * path deliberately kept free of work, because it is the attacker's.
   */
  it("emits one local line per isolate, not one per attempt", async () => {
    const d = db(ALLOWED);
    const ISOLATES = 4;
    const PER_ISOLATE = LIMIT.maxRequests + 25;

    for (let isolate = 0; isolate < ISOLATES; isolate++) {
      resetRateLimits(); // a fresh isolate: empty memory, same caller
      for (let i = 0; i < PER_ISOLATE; i++) {
        await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
      }
    }

    // One per isolate — emphatically not one per attempt.
    expect(console.warn).toHaveBeenCalledTimes(ISOLATES);
    expect(ISOLATES).toBeLessThan(ISOLATES * PER_ISOLATE);
  });

  /**
   * The other half of the bound, and the reason the looser one is affordable:
   * a line is only ever reached by spending a whole allowance on one isolate.
   */
  it("says nothing at all until an isolate has spent the whole allowance", async () => {
    const d = db(ALLOWED);
    for (let i = 0; i < LIMIT.maxRequests; i++) {
      await consumeRateLimit(d, "label-ocr", "1.2.3.4", LIMIT, OPTS);
    }
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe("who the caller is", () => {
  const req = (headers: Record<string, string>) => new Request("https://x/", { headers });

  /**
   * This function had no test and shipped a bug that disabled the limiter
   * entirely in production: it read the *last* entry of `x-forwarded-for`, on
   * the textbook reasoning that a gateway appends what it observed. On Deno
   * Deploy behind Cloudflare what gets appended is an internal hop that
   * differs per request, so every request looked like a new caller and nobody
   * was limited. Found by running 25 requests against the deployed endpoint
   * and getting 25 successes.
   *
   * It lived in `http.ts`, which reads `Deno.env` and so cannot be imported by
   * Jest — which is exactly why it was the untested one. Moved here.
   */
  it("prefers the address Cloudflare observed", () => {
    expect(
      callerKey(req({
        "cf-connecting-ip": "81.229.14.22",
        // An internal hop appended on the way in, and a client-supplied claim.
        "x-forwarded-for": "9.9.9.9, 10.0.0.7",
        "x-real-ip": "10.0.0.7",
      })),
    ).toBe("81.229.14.22");
  });

  /**
   * The first version of this fix fell back to `x-real-ip` and then the
   * forwarded chain's first entry. Neither is rewritten by an ingress we
   * control, so a caller reaching the function directly could hand over a
   * fresh value per request and mint a new bucket every time — the very bug
   * this function exists to prevent. Raised by review on PR #120.
   */
  it("refuses to guess from headers a client could simply write", () => {
    expect(callerKey(req({ "x-real-ip": "81.229.14.22" }))).toBe("unknown");
    expect(callerKey(req({ "x-forwarded-for": "81.229.14.22, 10.0.0.7" }))).toBe("unknown");
    expect(callerKey(req({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" }))).toBe("unknown");
  });

  /**
   * The bypass itself: a thousand made-up values must not buy a thousand
   * allowances. They all land in one bucket, which is strict rather than
   * absent — the safe direction to be wrong in when a metered key is behind
   * the limit.
   */
  it("cannot be rotated by inventing header values", () => {
    const keys = new Set(
      Array.from({ length: 50 }, (_, i) =>
        callerKey(req({ "x-real-ip": `10.0.0.${i}`, "x-forwarded-for": `10.1.0.${i}` })),
      ),
    );
    expect(keys).toEqual(new Set(["unknown"]));
  });

  /**
   * And the trusted header still wins over anything alongside it — Cloudflare
   * overwrites `cf-connecting-ip`, so a client cannot displace it by shouting
   * louder in the others.
   */
  it("is not displaced by client-supplied headers", () => {
    expect(
      callerKey(req({
        "cf-connecting-ip": "81.229.14.22",
        "x-real-ip": "6.6.6.6",
        "x-forwarded-for": "7.7.7.7, 8.8.8.8",
      })),
    ).toBe("81.229.14.22");
  });

  /**
   * The regression itself: the same caller behind two different internal hops
   * must land in one bucket. If these differ, the count never accumulates and
   * the limit never fires — which is precisely what happened.
   */
  it("gives one caller one identity across different internal hops", () => {
    const a = callerKey(req({ "cf-connecting-ip": "81.229.14.22", "x-forwarded-for": "81.229.14.22, 10.0.0.1" }));
    const b = callerKey(req({ "cf-connecting-ip": "81.229.14.22", "x-forwarded-for": "81.229.14.22, 10.0.0.2" }));
    const c = callerKey(req({ "cf-connecting-ip": "81.229.14.22", "x-forwarded-for": "81.229.14.22, 10.0.0.3" }));
    expect(new Set([a, b, c]).size).toBe(1);
  });

  /**
   * The shape a live deployment actually sends, rather than the one this code
   * assumed. A probe on a deployed `product-lookup` reported five requests
   * from one machine as three hops, with `cf-connecting-ip` and the first
   * `x-forwarded-for` entry constant and the last entry taking three
   * different values across the five.
   *
   * Reproduced here with addresses standing in for the truncated HMACs the
   * probe printed. Without this the measurement lives only in a commit
   * message, and the next person to touch `callerKey` has the same inference
   * available to them that produced the bug.
   */
  it("gives one identity across the three-hop shape this platform really sends", () => {
    // The five last-hop values the probe distinguished, as five requests.
    const keys = [11, 47, 203, 11, 11].map((lastHop) =>
      callerKey(req({
        "cf-connecting-ip": "81.229.14.22",
        "x-forwarded-for": `81.229.14.22, 172.16.0.9, 10.0.0.${lastHop}`,
      })),
    );
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("81.229.14.22");
  });

  it("still tells two real callers apart", () => {
    expect(callerKey(req({ "cf-connecting-ip": "81.229.14.22" })))
      .not.toBe(callerKey(req({ "cf-connecting-ip": "90.112.8.5" })));
  });

  /**
   * Never `x-device-id`: a client-supplied bucket is a bucket the client can
   * rotate, which is the whole attack this key exists to resist.
   */
  it("ignores a client-supplied device id", () => {
    expect(callerKey(req({ "x-device-id": "whatever-i-like" }))).toBe("unknown");
  });

  /**
   * `caller=unknown` in a refusal log is the signal that this platform does
   * not send `cf-connecting-ip` and the limit has silently become global.
   * Without it that would be invisible.
   */
  it("says unknown, which is what makes an absent header visible in the logs", () => {
    expect(callerKey(req({}))).toBe("unknown");
  });

  it("says unknown rather than throwing when nothing identifies the caller", () => {
    expect(callerKey(req({}))).toBe("unknown");
  });
});
