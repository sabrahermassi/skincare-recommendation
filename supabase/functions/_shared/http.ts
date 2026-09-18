// Request plumbing shared by every Edge Function: CORS, JSON replies, and the
// per-caller rate limit.
//
// The limiter itself now lives in `./rate-limit.ts` and is re-exported at the
// bottom of this file, so every existing `from "../_shared/http.ts"` import
// keeps working. It moved because this file reads `Deno.env`, which Jest and
// Metro cannot resolve — and the limiter is the one piece here worth a test.
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
    // Without this the browser hands the page a response with these headers
    // stripped, so `x-request-id` — the whole point of returning one — reads as
    // null on web, and a client cannot honour `Retry-After` either. Native is
    // unaffected, which is exactly how this went unnoticed until review.
    "Access-Control-Expose-Headers": "x-request-id, retry-after",
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

export function json(
  req: Request,
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req), ...extraHeaders },
  });
}

/**
 * A handle for one request, for tying a log line to the reply someone saw.
 *
 * Reuses an inbound `x-request-id` when there is one so a client or a proxy
 * that already has a trace can keep it, and mints one otherwise. Trusting a
 * client-supplied value is safe *here* precisely because it is not used for
 * anything but correlation — this is the opposite of `callerKey`, which
 * refuses client input for exactly the reason this accepts it.
 *
 * Returned on rate-limit replies via the `x-request-id` header, so "I keep
 * getting an error" can become "here is the id" without anyone reading a log
 * to guess which request they meant.
 */
export function requestId(req: Request): string {
  const supplied = req.headers.get("x-request-id");
  // Bounded and stripped of anything that could forge a second field in the
  // one-line, key=value log format `refused()` writes.
  if (supplied) return supplied.replace(/[^\w.-]/g, "").slice(0, 64) || crypto.randomUUID();
  return crypto.randomUUID();
}

// ── Rate limiting ───────────────────────────────────────────────────────────

// Re-exported rather than defined here: see the note at the top of this file.
// Only what an Edge Function actually calls — `withinRateLimit` and
// `resetRateLimits` are internals of that module and its tests, and re-exporting
// them here kept alive a surface no function used. Found in review.
export {
  callerKey,
  consumeRateLimit,
  // TEMPORARY — remove with the probe itself. See PR #120.
  probeCallerHeaders,
  retryAfterSeconds,
  type RateLimit,
  type RateLimitDb,
} from "./rate-limit.ts";

/**
 * The HMAC key that turns a caller's address into the fingerprint stored in
 * `rate_limits` — see `fingerprintCaller`.
 *
 * `RATE_LIMIT_SALT` when set, and the service-role key otherwise. The fallback
 * is deliberate rather than lazy: the salt has to be identical across every
 * isolate or the shared counter silently stops being shared, and a value that
 * must be configured before the limiter works correctly is a value someone will
 * forget to configure. The service-role key is already required by all three
 * functions, already secret, and already identical everywhere. Using it as an
 * HMAC key reveals nothing about it — that is what one-way means — but setting
 * the dedicated variable is still better hygiene, because it lets the key be
 * rotated without rotating the database credential.
 *
 * Read at call time rather than at module load: the tests for the functions
 * that use this set the environment per-case.
 */
export function callerSalt(): string {
  return Deno.env.get("RATE_LIMIT_SALT") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
