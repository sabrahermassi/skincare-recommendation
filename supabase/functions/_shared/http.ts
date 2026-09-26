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

import {
  chargesFor,
  consumeRateLimit,
  retryAfterSeconds,
  type RateLimit,
  type RateLimitDb,
} from "./rate-limit.ts";

/**
 * Browsers preflight `functions.invoke` — it sends `Content-Type:
 * application/json` plus an `Authorization` header, which is never a simple
 * request. Without a reply carrying `Access-Control-Allow-Origin` the browser
 * blocks the call before our handler ever runs, and the client sees a generic
 * network failure rather than anything it can explain to the user. That is
 * exactly how this went unnoticed: `data/api.ts` maps the failure to
 * "unreadable", so a blocked preflight looked like a bad photo.
 *
 * `ALLOWED_ORIGINS` (comma-separated) lists the origins a browser may call
 * from. Accounts exist (#218), so **unset refuses every browser** (#241):
 * an environment that was never configured must not be open to any page. It
 * used to fall back to `*` for local convenience, and production sat on that
 * fallback unnoticed (#282 self-review). Only browsers send an Origin; the
 * iOS app sends none and is unaffected either way.
 *
 * So production, while there is no web app, needs nothing set. An
 * environment with a web client lists it (staging: the local web dev
 * server), and a local `supabase functions serve` that wants any origin sets
 * `ALLOWED_ORIGINS=*` explicitly. No `Access-Control-Allow-Credentials` is
 * ever sent, so even a wildcard never lets a page ride a cookie — but a
 * session token is a credential, and a wildcard is a choice, not a default.
 * `npm run check:cors` asks a deployed environment which it is doing.
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

  const allowed = ALLOWED_ORIGINS.includes("*")
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

/**
 * Count this request against `bucket`, and return the 429 if it is over.
 *
 * `null` means carry on. The whole point is that a caller cannot forget the
 * check by forgetting to look at a boolean.
 *
 * This existed three times, character for character, in `label-ocr`,
 * `product-lookup` and `resolve-scan` (since removed). That is the shape the INCI parser was
 * in before it drifted — see the parity test in `__tests__/inci.test.ts` — and
 * the drift that matters here is silent: a function that mints its request id
 * after the check, or forgets `Retry-After`, still returns a plausible 429.
 *
 * It also gives the end-to-end test something real to call. `__tests__`
 * covers the arithmetic and `supabase/tests` covers the SQL, but nothing
 * joined them: no test took an actual `Request`, read an actual header off it,
 * and got an actual 429 back out of an actual Postgres. That chain is where
 * the production bug lived — every layer was correct in isolation and the
 * limiter still limited nobody, because `callerKey` read a header that changed
 * every request. `supabase/tests/rate_limit_e2e.test.ts` drives this function.
 */
export async function enforceRateLimit(
  req: Request,
  db: RateLimitDb,
  bucket: string,
  limit: RateLimit,
): Promise<Response | null> {
  // Minted before the check so the refusal log and the reply carry the same
  // id — the whole point is that a user quoting it lands on one line.
  const rid = requestId(req);

  // A guest is charged to their address; a signed-in caller to their account
  // and, more loosely, to their address as well (#241, `chargesFor`). The
  // fingerprint turns each into the same opaque key. In order, stopping at
  // the first refusal, so a spent account doesn't also burn the address.
  for (const charge of await chargesFor(req, db.auth, bucket, limit)) {
    const allowed = await consumeRateLimit(db, charge.bucket, charge.caller, charge.limit, {
      secret: callerSalt(),
      requestId: rid,
    });
    if (allowed) continue;

    // `Retry-After` is computed from the window rather than guessed, so a
    // client can back off exactly as long as it needs to and no longer.
    return json(req, { error: "Too many requests" }, 429, {
      "x-request-id": rid,
      "Retry-After": String(retryAfterSeconds(charge.limit)),
    });
  }
  return null;
}


// Types only. The three values that used to be re-exported here —
// `callerKey`, `consumeRateLimit` and `retryAfterSeconds` — are now reached
// through `enforceRateLimit` above (`callerKey` by way of `chargesFor`) and
// nothing else, so passing them back out again
// kept alive a surface no function used. That is the same finding an earlier
// review made about `withinRateLimit` and `resetRateLimits`, and extracting
// `enforceRateLimit` quietly recreated it; the comment here went on claiming
// the block held "only what an Edge Function actually calls" while that had
// stopped being true. Anything needing them directly imports `./rate-limit.ts`,
// which is where they live.
export { type RateLimit, type RateLimitDb };

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
  const salt = Deno.env.get("RATE_LIMIT_SALT");
  if (salt !== undefined) return salt;
  // Loudly, once per function instance (#198): the fallback works, but it
  // ties rotating this key to rotating the database credential.
  if (!warnedSaltFallback) {
    warnedSaltFallback = true;
    console.warn("[config] RATE_LIMIT_SALT is unset: fingerprinting callers with the service-role key instead");
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

let warnedSaltFallback = false;
