// Request plumbing shared by every Edge Function: CORS, JSON replies, and the
// per-caller rate limit.
//
// It lives here rather than being copied into each function because the copies
// had already drifted once — see the parity test in `__tests__/inci.test.ts`
// for the same lesson learned on the parser.

/**
 * Browsers preflight `functions.invoke` — it sends `Content-Type:
 * application/json` plus an `Authorization` header, which is never a simple
 * request. Without a reply carrying `Access-Control-Allow-Origin` the browser
 * blocks the call before our handler ever runs, and the client sees a generic
 * network failure rather than anything it can explain to the user. That is
 * exactly how this went unnoticed: `data/api.ts` maps the failure to
 * "unreadable", so a blocked preflight looked like a bad photo.
 *
 * `ALLOWED_ORIGINS` (comma-separated) narrows this when set. Unset falls back
 * to `*`, which is safe *today* and only today: these endpoints are
 * unauthenticated, carry no cookies and hold no session, so a wildcard grants a
 * hostile page nothing it could not get with curl. The moment accounts exist,
 * set the variable — issue #31 tracks the policy.
 */
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");

  // Native has no Origin header at all; there is nothing to allow, and sending
  // the header anyway would be noise.
  if (!origin) return {};

  const allowed =
    ALLOWED_ORIGINS.length === 0
      ? "*"
      : ALLOWED_ORIGINS.includes(origin)
        ? origin
        : null;
  if (!allowed) return {};

  return {
    "Access-Control-Allow-Origin": allowed,
    // Echoing the requested headers rather than hardcoding a list: supabase-js
    // sends `apikey`, `authorization`, `content-type` and `x-client-info`, and
    // that set has changed between minor versions before.
    "Access-Control-Allow-Headers":
      req.headers.get("access-control-request-headers") ??
      "authorization, x-client-info, apikey, content-type, x-device-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    // Only meaningful when an allowlist is configured, but harmless otherwise
    // and required for any shared cache in front of us to behave.
    ...(allowed === "*" ? {} : { Vary: "Origin" }),
  };
}

/** Preflight reply. 204 rather than 200: there is deliberately no body. */
export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

// ── Rate limiting ───────────────────────────────────────────────────────────

export type RateLimit = { windowSeconds: number; maxRequests: number };

const hits = new Map<string, number[]>();

/**
 * In-memory and therefore per-isolate, which is the right trade here: it costs
 * nothing, survives the only case that matters (one client looping), and a
 * burst spread across cold starts is still bounded by the upstream quota.
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
 * Who to charge a request to.
 *
 * The caller's address, NOT `x-device-id`. A client-supplied header is a
 * client-supplied bucket: `for i in $(seq 1000); do curl -H "x-device-id: $i"`
 * defeats the limit entirely, and the limit is the only thing standing between
 * an anonymous caller and a metered Vision key.
 *
 * `x-forwarded-for` is appended to by the Supabase gateway, so the LAST entry
 * is the one it observed and the earlier ones are whatever the client claimed.
 * Reading from the right end is the difference between an address and a wish.
 *
 * The cost is that one shop's wifi shares a bucket. At 10 requests per 5
 * minutes that is a real person scanning a shelf, so the ceiling is set for a
 * NAT rather than for a single handset.
 */
export function callerKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (chain.length > 0) return chain[chain.length - 1];
  }
  return req.headers.get("x-real-ip") ?? req.headers.get("cf-connecting-ip") ?? "unknown";
}
