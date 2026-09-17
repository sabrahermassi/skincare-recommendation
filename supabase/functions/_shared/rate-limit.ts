// Per-caller rate limiting, in two layers.
//
// Moved here out of `_shared/http.ts` so it can be tested. That file reads
// `Deno.env`, which Metro and Jest cannot resolve; this one touches no Deno
// global and takes its database client as an argument, so `lib/rate-limit.ts`
// re-exports it and `__tests__/rate-limit.test.ts` exercises the exact module
// the Edge Functions run — the same arrangement `strip-metadata.ts` already
// uses, and for the same reason.
//
// `http.ts` re-exports everything below, so existing imports from there keep
// working.

export type RateLimit = { windowSeconds: number; maxRequests: number };

/**
 * The minimum a database client has to look like for `consumeRateLimit`.
 *
 * Structural rather than importing Supabase's own type: this module is bundled
 * by Metro for the test build, and `jsr:@supabase/supabase-js` is exactly the
 * kind of specifier that cannot survive that trip. The Edge Functions' real
 * client satisfies this shape.
 */
export type RateLimitDb = {
  rpc(
    fn: "consume_rate_limit",
    args: {
      p_bucket: string;
      p_caller: string;
      p_window_seconds: number;
      p_max_requests: number;
    },
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

const hits = new Map<string, number[]>();

/**
 * Drops every in-memory bucket. For tests, which would otherwise carry one
 * case's counts into the next.
 */
export function resetRateLimits(): void {
  hits.clear();
}

/**
 * In-memory and therefore per-isolate.
 *
 * Since 0016 this is the *fallback* rather than the whole limit — see
 * `consumeRateLimit`. It is kept rather than deleted because it is the only
 * thing left standing when the database cannot be reached, and because it
 * costs nothing: no round trip, no failure mode of its own.
 *
 * Empty buckets are dropped rather than left behind. With the key derived from
 * the caller's address the set is bounded in practice, but a map that only ever
 * grows is a slow leak in an isolate that stays warm for hours.
 */
export function withinRateLimit(key: string, limit: RateLimit): boolean {
  const now = Date.now();
  const cutoff = now - limit.windowSeconds * 1000;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= limit.maxRequests) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic sweep — cheap, and keeps a long-lived isolate from
  // accumulating a bucket per caller it has ever seen.
  if (hits.size > 5_000) {
    for (const [k, times] of hits) {
      if (times.every((t) => t <= cutoff)) hits.delete(k);
    }
  }

  return true;
}

/**
 * The real limit: one counter in Postgres, shared by every isolate and
 * surviving a cold start.
 *
 * **On failure this falls back to the in-memory limiter rather than to either
 * extreme**, and that is the load-bearing decision in this file.
 *
 * Failing *open* is unacceptable: the limit is the only thing between an
 * anonymous caller and a metered Vision key, so "the database blinked" must not
 * become "spend without a ceiling". Failing *closed* is worse than it sounds —
 * it turns a transient database blip into a scanner that refuses every photo,
 * and the paid endpoints already need the database for the write that follows,
 * so the user was going to get an error anyway. The difference is that a
 * refusal here is a 429 telling them to slow down, which is a lie when the real
 * problem is ours.
 *
 * So a failed check degrades to exactly the protection that existed before this
 * migration — bounded per isolate, unbounded in total — which is weaker than
 * intended but never weaker than what shipped. The degradation is silent on
 * purpose at the call site and noisy here: `console.error` puts it in the
 * function logs, because a limiter quietly running in fallback mode for a week
 * is indistinguishable from one that works.
 *
 * Both layers are consulted when the database answers, and the in-memory one is
 * consulted *first*: it is free, and a caller already over the local limit
 * needs no round trip to be refused.
 */
export async function consumeRateLimit(
  db: RateLimitDb,
  bucket: string,
  caller: string,
  limit: RateLimit,
): Promise<boolean> {
  if (!withinRateLimit(`${bucket}:${caller}`, limit)) return false;

  try {
    const { data, error } = await db.rpc("consume_rate_limit", {
      p_bucket: bucket,
      p_caller: caller,
      p_window_seconds: limit.windowSeconds,
      p_max_requests: limit.maxRequests,
    });

    if (error) {
      console.error("[rate-limit] durable check failed, using in-memory only:", error);
      return true;
    }

    // A non-boolean means the function returned something unexpected — a
    // signature drift, a migration half-applied. Treated as a failed check
    // rather than as a refusal, for the same reason as `error` above: this is
    // our fault, not the caller's.
    if (typeof data !== "boolean") {
      console.error("[rate-limit] consume_rate_limit returned a non-boolean:", data);
      return true;
    }

    return data;
  } catch (err) {
    console.error("[rate-limit] durable check threw, using in-memory only:", err);
    return true;
  }
}
