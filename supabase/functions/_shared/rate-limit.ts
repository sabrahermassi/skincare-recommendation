// Per-caller rate limiting, in two layers.
//
// Moved here out of `_shared/http.ts` so it can be tested. That file reads
// `Deno.env`, which Metro and Jest cannot resolve; this one touches no Deno
// global and takes its database client and its salt as arguments, so
// `lib/rate-limit.ts` re-exports it and `__tests__/rate-limit.test.ts`
// exercises the exact module the Edge Functions run — the same arrangement
// `strip-metadata.ts` already uses, and for the same reason.

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
  /** Confirms a signed-in caller's token (#241). Absent, everyone is charged by address. */
  auth?: SessionVerifier;
};

/** The part of a Supabase client that can confirm a session token is real. */
export type SessionVerifier = {
  getUser(jwt: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
};

// ── Windows ─────────────────────────────────────────────────────────────────

/**
 * The start of the window `nowMs` falls in, in whole seconds.
 *
 * Deliberately the same arithmetic as `consume_rate_limit`'s
 * `floor(extract(epoch from now()) / window) * window`. The two layers used to
 * disagree — this one kept a sliding window of timestamps while the database
 * kept a fixed one — so a caller refused locally and a caller refused in
 * Postgres regained their allowance at different moments, and the fallback
 * behaved unlike the thing it was standing in for. Found in review.
 */
function windowStart(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / 1000 / windowSeconds) * windowSeconds;
}

/**
 * Seconds until the caller's current window closes — the honest `Retry-After`.
 *
 * Always between 1 and `windowSeconds`, without needing a clamp to say so:
 * flooring puts `elapsed` in `[0, windowSeconds - 1]`, so the difference is in
 * `[1, windowSeconds]`. The first draft guarded the lower bound with
 * `Math.max(1, ...)`, which no input could ever reach — a mutation test caught
 * it surviving, which is the same evidence as it being unreachable.
 *
 * That the floor is 1 rather than 0 matters: `Retry-After: 0` invites the
 * retry storm the header exists to prevent.
 */
export function retryAfterSeconds(limit: RateLimit, nowMs: number = Date.now()): number {
  const elapsed = Math.floor(nowMs / 1000) - windowStart(nowMs, limit.windowSeconds);
  return limit.windowSeconds - elapsed;
}

// ── The in-memory layer ─────────────────────────────────────────────────────

/**
 * `windowSeconds` is carried per entry rather than read from the caller's
 * `limit` at sweep time.
 *
 * Today every entry in this map shares one window, because each Edge Function
 * is its own isolate and each declares a single `RATE_LIMIT` — so the two
 * maps below never hold a 60-second `product-lookup` tally beside a
 * 300-second `label-ocr` one. But nothing said so, and nothing enforced it:
 * the moment one function wants two limits (a per-endpoint cap plus a global
 * one, say) a sweep triggered by the shorter window would evict live entries
 * belonging to the longer one, silently handing those callers a fresh
 * allowance exactly when the durable counter is unavailable and the fallback
 * is all there is. Raised by review on PR #117 as a live bug; it is not one
 * yet, which is the only reason it is cheap to fix now.
 */
type Tally = { window: number; windowSeconds: number; count: number };

const hits = new Map<string, Tally>();

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
 * A refused request still increments, matching `consume_rate_limit`. Someone
 * hammering the endpoint should not get a fresh look the moment they cross the
 * line.
 *
 * One tally per key rather than an array of timestamps: a fixed window needs a
 * counter and a boundary, not a history, so the memory a warm isolate holds no
 * longer grows with the traffic it has seen.
 */
export function withinRateLimit(key: string, limit: RateLimit): boolean {
  return tally(key, limit) <= limit.maxRequests;
}

/**
 * The caller's new count in the current window.
 *
 * Separate from `withinRateLimit` because the count carries one fact a verdict
 * cannot: `maxRequests + 1` is the request that *first* crossed the line in
 * this window, which is what bounds the refusal log without a second map to
 * remember what has already been logged.
 */
function tally(key: string, limit: RateLimit): number {
  const now = Date.now();
  const current = windowStart(now, limit.windowSeconds);
  const entry = hits.get(key);

  if (!entry || entry.window !== current) {
    hits.set(key, { window: current, windowSeconds: limit.windowSeconds, count: 1 });
    // Opportunistic sweep — cheap, and keeps a long-lived isolate from
    // accumulating a bucket per caller it has ever seen. Each entry is judged
    // against its *own* window, not the one that happened to trigger the
    // sweep; see `Tally`.
    if (hits.size > 5_000) {
      const nowSeconds = Math.floor(now / 1000);
      for (const [k, t] of hits) {
        if (t.window + t.windowSeconds <= nowSeconds) hits.delete(k);
      }
    }
    return 1;
  }

  entry.count += 1;
  return entry.count;
}

// ── Logging ─────────────────────────────────────────────────────────────────

/**
 * Strip anything that could forge a second field in the one-line `key=value`
 * format `refused()` writes.
 *
 * `callerKey()` normally returns an address the gateway observed, but it falls
 * back to `x-real-ip` and `cf-connecting-ip`, which are entirely
 * client-supplied — so on a direct invocation a caller could otherwise put a
 * `layer=` or `request=` of their choosing into a log this module says will be
 * grepped and counted. `requestId()` was already sanitised for exactly this
 * reason; the caller was not. Found in review.
 *
 * `:` and `.` survive because an address is unreadable without them.
 */
function logSafe(value: string): string {
  return value.replace(/[^\w.:-]/g, "").slice(0, 64) || "unknown";
}

/**
 * Record that a request was turned away.
 *
 * `console.warn`, not `console.error`: a refusal is the limiter working, not
 * the limiter failing. The two are different questions and want different
 * severities — one of them is "someone is hammering us", the other is "our
 * counter is broken and we are running on the fallback".
 *
 * `layer` is the part worth having. A `local` refusal means this isolate alone
 * saw enough traffic to say no; a `shared` one means the caller had already
 * spent its allowance elsewhere, which is the isolate-hopping this whole
 * migration exists to catch. A run of `shared` refusals is a different story
 * from a run of `local` ones, and without this field they are the same line.
 *
 * **Called only for the request that first crosses the line in a window**, so
 * one refusal is logged and the rest are silent. The first version logged every
 * refusal, which handed anyone looping against a throttled endpoint an
 * unbounded, metered log bill on what had been the free path — refusing costs
 * nothing, so the logging was the only thing left worth attacking.
 *
 * The second version bounded it with a `lastLogged` map, which was the same
 * mistake this whole migration exists to correct, one layer up: that map was
 * per-isolate, so "one line per window" meant "one line per window per
 * isolate", and a burst that scales out or cold-starts repeatedly approaches a
 * line per attempt again. Both versions found in review.
 *
 * It is the *count* that fixes it, because the count is the one value every
 * isolate already agrees on — `maxRequests + 1` happens exactly once per
 * window however many isolates are serving.
 *
 * **The two layers are bounded differently, and the difference is worth
 * stating rather than glossing.** A `shared` line is exactly one per caller
 * per window, globally: the count comes from `consume_rate_limit`, which every
 * isolate shares. A `local` line is one per caller per window *per isolate*,
 * because the local fast path returns before reaching the database and so has
 * no global count to test against. Review pressed on this twice and was right
 * to; an earlier version of this comment claimed a global bound for both.
 *
 * That looser bound is accepted rather than fixed, because of what a local
 * line costs the caller who triggers it: reaching one means a single isolate
 * served `maxRequests + 1` requests, so at `label-ocr`'s limit of 10 the worst
 * case is one line per eleven attempts, and each additional line needs another
 * warm isolate as well as another eleven requests. A hundred lines would take
 * a hundred warm isolates and eleven hundred requests from one address inside
 * five minutes — which is not a log bill, it is the thing the log exists to
 * report.
 *
 * Closing the gap would mean consulting the database on the refusal path,
 * which is the one path deliberately kept free of it: that path is the
 * attacker's, and making it do work is how a rate limiter becomes an
 * amplifier.
 *
 * The caller here is the address, not the fingerprint stored in the database.
 * Logs are short-lived and this is the only place the raw value survives at
 * all, which is what keeps identifying an abuser possible;
 * `docs/threat-model.md` anticipated exactly this ("Same, unless logging is
 * added later").
 */
function refused(
  bucket: string,
  caller: string,
  layer: "local" | "shared",
  requestId: string,
): void {
  console.warn(
    `[rate-limit] refused bucket=${logSafe(bucket)} caller=${logSafe(caller)} ` +
      `layer=${layer} request=${logSafe(requestId)}`,
  );
}

// ── Who the caller is ───────────────────────────────────────────────────────

/**
 * Who to charge a request to.
 *
 * The caller's address, NOT `x-device-id`. A client-supplied header is a
 * client-supplied bucket: `for i in $(seq 1000); do curl -H "x-device-id: $i"`
 * defeats the limit entirely, and the limit is the only thing standing between
 * an anonymous caller and a metered Vision key.
 *
 * **`cf-connecting-ip` first, not the end of `x-forwarded-for`.** The previous
 * order was textbook-correct and wrong here, which is a combination worth
 * recording rather than quietly deleting.
 *
 * The reasoning was: a gateway *appends* what it observed to `x-forwarded-for`,
 * so the last entry is an address and the earlier ones are whatever the client
 * claimed. True in general. But these functions run on Deno Deploy behind
 * Cloudflare, and what gets appended on the way in is an internal hop that
 * differs between requests — so the "caller" was the proxy that happened to
 * carry the request, not the person making it. Every request looked like a new
 * caller, the count never accumulated, and **nobody was rate limited at all**.
 * Found by running 25 requests against the deployed endpoint and getting 25
 * successes where 20 were expected: `rate_limits` held 16 rows for 37
 * requests, which is one row per hop rather than one per caller.
 *
 * `cf-connecting-ip` is set by Cloudflare to the originating client and
 * *overwritten* on every request, so neither a client nor an internal hop can
 * choose it.
 *
 * **And nothing else is accepted, deliberately.** The first version of this fix
 * fell back to `x-real-ip` and then `x-forwarded-for`'s first entry, with a
 * comment admitting the second "rotates under a determined caller" — which is
 * the bug this function exists to prevent, written down and shipped anyway.
 * Neither header is rewritten by an ingress we control, so a caller reaching
 * the function directly could hand over a fresh value per request and mint a
 * new bucket every time, defeating the limiter completely. Raised by review on
 * PR #120.
 *
 * So an absent header returns `"unknown"` rather than a guess. Every such
 * request then shares one bucket, which is strict rather than absent: the
 * failure is "too many people throttled together", not "the metered key is
 * unprotected". Given what sits behind these endpoints, that is the correct
 * direction to be wrong in.
 *
 * **It is also self-reporting.** `refused()` logs the caller, so a production
 * log line reading `caller=unknown` says plainly that this platform does not
 * send the header and the limit has become global — which is exactly the thing
 * that would otherwise be invisible.
 *
 * The cost is unchanged — one shop's wifi shares a bucket. At 10 requests per
 * 5 minutes that is a real person scanning a shelf, so the ceiling is set for
 * a NAT rather than for a single handset.
 */
export function callerKey(req: Request): string {
  // One header, and no fallbacks. Cloudflare sets `cf-connecting-ip` to the
  // originating client and *overwrites* whatever arrived, so a client cannot
  // choose its own value. Nothing else here has that property.
  //
  // Measured, not assumed — a temporary probe on a deployed `product-lookup`
  // reported five requests from one machine as:
  //
  //   cf-connecting-ip=49c69ef7 xff.hops=3 xff.first=49c69ef7 xff.last=802cbfc1
  //   cf-connecting-ip=49c69ef7 xff.hops=3 xff.first=49c69ef7 xff.last=67f8d516
  //   cf-connecting-ip=49c69ef7 xff.hops=3 xff.first=49c69ef7 xff.last=f628681b
  //
  // (header names and truncated HMACs, never addresses). `cf-connecting-ip`
  // holds still; the last `x-forwarded-for` hop does not, which is the whole
  // of the bug this branch fixes. `x-real-ip`, `forwarded` and
  // `true-client-ip` never arrived at all, so the earlier fallback chain was
  // reaching for headers this platform does not send.
  const observed = req.headers.get("cf-connecting-ip");
  if (observed) return observed.trim();

  // Everything without that header shares one bucket, which is the safe
  // direction to be wrong in. Read the note above for why this is not a
  // fallback but a refusal to guess.
  return "unknown";
}

// ── Signed-in callers (#241) ────────────────────────────────────────────────

/**
 * A signed-in caller's confirmed account id, cached per isolate until the
 * token expires — or, for a token Auth refused, for a minute. `null` is a
 * refusal worth remembering, so the same bad token isn't sent to Auth again.
 */
const verified = new Map<string, { account: string | null; until: number }>();
const REFUSED_TOKEN_TTL_MS = 60_000;

/** For tests, which would otherwise carry one case's verdicts into the next. */
export function resetVerifiedTokens(): void {
  verified.clear();
}

function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

/**
 * The token's claims, **unverified** — read only to decide whether it is
 * worth asking Auth about. Nothing here is trusted until `getUser` agrees.
 */
function unverifiedClaims(token: string): { role?: unknown; sub?: unknown; exp?: unknown } | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)));
  } catch {
    return null;
  }
}

/**
 * The account behind this request, or `null` for a guest.
 *
 * Guests send the project's anon key, whose `role` is `anon`, and never reach
 * Auth. A token claiming `authenticated` is checked with Auth before its
 * `sub` is believed: the gateway's own JWT check already refuses a forged
 * signature, but a function deployed without it would otherwise let a caller
 * write any `sub` they liked and mint a fresh bucket per request — the exact
 * failure `callerKey` refuses `x-device-id` for. Anything Auth doesn't
 * confirm, or can't be asked about, is treated as a guest and charged by
 * address, which still limits it.
 */
export async function signedInAccount(req: Request, auth: SessionVerifier | undefined): Promise<string | null> {
  if (!auth) return null;
  const token = bearerToken(req);
  if (!token) return null;
  const claims = unverifiedClaims(token);
  if (claims?.role !== "authenticated" || typeof claims.sub !== "string") return null;

  const now = Date.now();
  const cached = verified.get(token);
  if (cached && cached.until > now) return cached.account;

  let account: string | null = null;
  try {
    const { data, error } = await auth.getUser(token);
    if (!error && data.user) account = data.user.id;
  } catch {
    // Auth unreachable: charged by address this time, and asked again next time.
    return null;
  }
  const expires = typeof claims.exp === "number" ? claims.exp * 1000 : now;
  if (verified.size > 5_000) {
    for (const [t, v] of verified) if (v.until <= now) verified.delete(t);
  }
  verified.set(token, { account, until: account ? expires : now + REFUSED_TOKEN_TTL_MS });
  return account;
}

/**
 * Who a request is charged to: a signed-in account by its id, so a network
 * change doesn't hand it a fresh allowance and a shared café connection
 * doesn't make strangers share one; everyone else by address, as before.
 * Scanning stays open to guests, so the address bucket stays too.
 */
export async function chargeTo(req: Request, auth: SessionVerifier | undefined): Promise<string> {
  const account = await signedInAccount(req, auth);
  return account ? `user:${account}` : callerKey(req);
}

// ── The caller fingerprint ──────────────────────────────────────────────────

const encoder = new TextEncoder();

/**
 * A stable, non-reversible stand-in for the caller's address.
 *
 * The limiter only ever asks "is this the same caller as a moment ago?", so
 * equality is the entire requirement and the address itself does no work. What
 * it *does* do is turn a counter table into an activity log: a row per address
 * per operation per window, kept a day, is a record of who used which feature
 * and when — health-adjacent by inference for this app, and classified in
 * `docs/threat-model.md` as personal data it promised never to persist. Found
 * in review, after the first version of this file wrote the address straight
 * into `rate_limits.caller` while a comment three lines above claimed it did
 * not.
 *
 * HMAC rather than a bare hash. There are only ~4 billion IPv4 addresses, so
 * `sha256(ip)` is a lookup table anyone can build in an afternoon; the key is
 * what makes the fingerprint irreversible to someone holding only the database.
 *
 * Truncated to 128 bits — far past collision risk for a keyspace this size,
 * and it keeps the primary key narrow.
 */
export async function fingerprintCaller(caller: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(caller));
  return Array.from(new Uint8Array(signature).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── The check ───────────────────────────────────────────────────────────────

export type ConsumeOptions = {
  /**
   * The HMAC key for `fingerprintCaller`. Required rather than optional: a
   * missing salt would mean either a raw address in the table or a per-boot
   * random one that makes the shared counter useless, and both failures are
   * invisible from the outside.
   */
  secret: string;
  /**
   * Threaded through only so a refusal can be tied back to the response the
   * caller saw. Defaults to `-`, because a missing id should cost a log line
   * its correlation, never a caller its limit.
   */
  requestId?: string;
};

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
 * needs no round trip — nor a fingerprint, which is a round of HMAC it also
 * does not have to pay for.
 */
export async function consumeRateLimit(
  db: RateLimitDb,
  bucket: string,
  caller: string,
  limit: RateLimit,
  opts: ConsumeOptions,
): Promise<boolean> {
  const requestId = opts.requestId ?? "-";

  const local = tally(`${bucket}:${caller}`, limit);
  if (local > limit.maxRequests) {
    if (local === limit.maxRequests + 1) refused(bucket, caller, "local", requestId);
    return false;
  }

  // Outside the try, deliberately. `fingerprintCaller` throws on an empty
  // secret — `crypto.subtle.importKey` rejects a zero-length HMAC key — and
  // inside the try that throw was caught, logged as a database problem and
  // answered with `return true`. So a missing salt did not degrade the
  // limiter, it removed it: every request allowed, for as long as the
  // misconfiguration lasted, behind a log line claiming the opposite.
  //
  // A configuration error is not a database outage and must not borrow its
  // handling. Letting it propagate turns an endpoint with no working limit
  // into an endpoint that fails loudly on its first request, which is the
  // error anyone would rather have. It cannot fire in a working deployment:
  // `callerSalt()` falls back to `SUPABASE_SERVICE_ROLE_KEY`, without which
  // these functions cannot reach the database at all.
  //
  // Found by `supabase/tests/rate_limit_e2e.test.ts` on its first run.
  const fingerprint = await fingerprintCaller(caller, opts.secret);

  try {
    const { data, error } = await db.rpc("consume_rate_limit", {
      p_bucket: bucket,
      p_caller: fingerprint,
      p_window_seconds: limit.windowSeconds,
      p_max_requests: limit.maxRequests,
    });

    if (error) {
      console.error("[rate-limit] durable check failed, using in-memory only:", error);
      return true;
    }

    // A non-number means the function returned something unexpected — a
    // signature drift, a migration half-applied. Treated as a failed check
    // rather than as a refusal, for the same reason as `error` above: this is
    // our fault, not the caller's.
    if (typeof data !== "number") {
      console.error("[rate-limit] consume_rate_limit returned a non-number:", data);
      return true;
    }

    if (data > limit.maxRequests) {
      // Exactly once per window across every isolate — see `refused`.
      if (data === limit.maxRequests + 1) refused(bucket, caller, "shared", requestId);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[rate-limit] durable check threw, using in-memory only:", err);
    return true;
  }
}
