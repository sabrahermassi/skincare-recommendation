// The limiter, end to end: a real HTTP request in, a real 429 out, a real
// Postgres in the middle.
//
// Everything else tests one layer. `__tests__/rate-limit.test.ts` tests the
// arithmetic against a stub database; `rate_limits.test.sql` tests the SQL
// against no HTTP at all. Both passed the whole time the limiter was letting
// everyone through, because the bug was in neither — `callerKey` read an
// `x-forwarded-for` hop that Cloudflare varies per request, so every request
// arrived as a new caller and no count ever accumulated. Each layer was
// correct and the chain was broken.
//
// So this test's job is the joins: header → identity → RPC → row → verdict.
// It drives `enforceRateLimit`, the same function the three Edge Functions
// call, over a real loopback server, with headers shaped like the ones a
// deployed `product-lookup` was measured returning.
//
// Which test carries which claim, checked by mutation rather than assumed:
// with the database never reached, "over the limit comes back 429" and "a cold
// start" fail while the other two pass; with the RPC running but its answer
// mishandled, only "a cold start" fails. So the cold-start case is the one
// holding the durable layer up. The middle two pass against the in-memory
// layer alone — not a weakness, because `Retry-After` and per-caller
// separation are true at both layers, but worth knowing before trusting a
// green run to mean the database did anything.
//
// Run by the `migrations` CI job, against the Postgres the migrations were
// just applied to. Locally:
//
//   deno test --allow-net --allow-env supabase/tests/rate_limit_e2e.test.ts
//
// with PGHOST/PGUSER/PGPASSWORD/PGDATABASE set.

import { assertEquals } from "jsr:@std/assert@1";
import { Client } from "jsr:@db/postgres@0.19";

import { enforceRateLimit, type RateLimit, type RateLimitDb } from "../functions/_shared/http.ts";
import { resetRateLimits, resetVerifiedTokens, SIGNED_IN_PER_ADDRESS } from "../functions/_shared/rate-limit.ts";

/**
 * The real client is `jsr:@supabase/supabase-js`, which speaks PostgREST over
 * HTTP and needs a whole Supabase stack behind it. `RateLimitDb` is structural
 * precisely so it does not have to be that — the contract is one `rpc` call —
 * and this satisfies it by making the same call over the wire protocol
 * instead.
 *
 * What that trades away is honest and worth stating: PostgREST's own
 * marshalling is not exercised, so a mistake in how it renders an integer
 * would not be caught here. What it keeps is everything this test exists for
 * — the same SQL function, running in the same database, reached through the
 * same `RateLimitDb` seam the Edge Functions use.
 */
function dbOver(client: Client): RateLimitDb {
  return {
    async rpc(fn, args) {
      try {
        const result = await client.queryArray<[number]>(
          `select ${fn}($1, $2, $3, $4)`,
          [args.p_bucket, args.p_caller, args.p_window_seconds, args.p_max_requests],
        );
        return { data: result.rows[0][0], error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  };
}

/**
 * The header shape a deployed `product-lookup` was measured sending, rather
 * than the one this code assumed: three hops, `cf-connecting-ip` constant, and
 * the last `x-forwarded-for` entry different on almost every request.
 *
 * `lastHop` varying is not decoration. It is the bug, reproduced: key off that
 * value and each of these is a new caller.
 */
function request(ip: string, lastHop: number): Request {
  return new Request("http://localhost/product-lookup", {
    method: "POST",
    headers: {
      "cf-connecting-ip": ip,
      "x-forwarded-for": `${ip}, 172.16.0.9, 10.0.0.${lastHop}`,
    },
  });
}

const LIMIT: RateLimit = { windowSeconds: 600, maxRequests: 20 };

// `callerSalt()` reads this. In production it falls back to
// `SUPABASE_SERVICE_ROLE_KEY`, which is always set — without it the function
// cannot reach the database at all. Here nothing sets either, and an empty
// HMAC key is a configuration error rather than a thing to paper over, so the
// test supplies one the way a deployment does.
Deno.env.set("RATE_LIMIT_SALT", "test-salt-not-a-secret");

async function connect(): Promise<Client> {
  const client = new Client({
    hostname: Deno.env.get("PGHOST") ?? "localhost",
    port: Number(Deno.env.get("PGPORT") ?? 5432),
    user: Deno.env.get("PGUSER") ?? "postgres",
    password: Deno.env.get("PGPASSWORD") ?? "postgres",
    database: Deno.env.get("PGDATABASE") ?? "postgres",
  });
  await client.connect();
  return client;
}

/**
 * A fresh bucket per test. The in-memory tally in `consumeRateLimit` is
 * per-process and is not reset between tests, so two tests sharing a bucket
 * and a caller would have the second start wherever the first stopped — and
 * it would fail for that reason rather than for a real one.
 */
let n = 0;
const bucket = () => `e2e-${Date.now()}-${n++}`;

/** The window index `consume_rate_limit` and `windowStart()` both floor to. */
const currentWindow = () => Math.floor(Date.now() / 1000 / LIMIT.windowSeconds);

/**
 * Run a scenario, and re-run it once if the fixed window rolled underneath it.
 *
 * The limiter's window is wall-clock rather than per-caller —
 * `floor(epoch / 600)` — so a scenario that starts a second before a boundary
 * has its count reset mid-run in both layers at once. Every assertion here is
 * then measuring the wrong thing: extra allowed requests, a second row, a
 * cold-start request that is allowed rather than refused. At ~1s per scenario
 * against a 600s window that is roughly one CI run in 150, which is frequent
 * enough to teach people that a red build means nothing.
 *
 * Retrying rather than sleeping to the next boundary: the common case costs
 * nothing, and a retry begins just after the boundary it crossed, so it has a
 * full window ahead of it. A failure is reported only when the window held, so
 * this cannot turn a real failure green — verified against a mutant.
 *
 * `resetRateLimits()` clears the process-local tally before each attempt, so a
 * retry does not inherit the abandoned one. Raised by review on PR #123.
 */
async function inOneWindow(run: (b: string) => Promise<void>): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const before = currentWindow();
    resetRateLimits();
    try {
      await run(bucket());
      if (currentWindow() === before) return;
    } catch (err) {
      if (currentWindow() === before) throw err;
    }
  }
  // Two rolls in a row would mean a scenario is taking minutes rather than the
  // ~1s these do — something is wrong with the run, not with the limiter.
  throw new Error("the rate-limit window rolled on both attempts");
}

Deno.test("a real request over the limit comes back 429", () =>
  inOneWindow(async (b) => {
    const client = await connect();
    const db = dbOver(client);

    try {
      const codes: number[] = [];
      for (let i = 0; i < 25; i++) {
        // The caller is one machine throughout. Only the internal hop moves.
        const res = await enforceRateLimit(request("203.0.113.7", i), db, b, LIMIT);
        codes.push(res?.status ?? 200);
      }

      assertEquals(
        codes,
        [...Array(20).fill(200), ...Array(5).fill(429)],
        "twenty allowed then five refused",
      );

      // The codes alone are weaker evidence than they look: `consumeRateLimit`
      // checks its in-memory tally first and would produce this exact sequence
      // with the RPC broken, since both layers carry the same limit. The row is
      // what proves the database was reached and did the counting — and the
      // database is the only layer that survives a cold start.
      const rows = await client.queryArray<[string, number]>(
        "select caller, count from rate_limits where bucket = $1",
        [b],
      );
      assertEquals(rows.rows.length, 1, "one machine should produce one row");

      // 20, not 25. Once the in-memory tally is over the limit `consumeRateLimit`
      // returns before the round trip, so the five refusals never reach the
      // database — a refusal should not cost a query. The database still counts
      // every request that got as far as it, which is what
      // `rate_limits.test.sql` asserts directly.
      assertEquals(rows.rows[0][1], 20, "the database counted every request that reached it");

      // And never the address itself — `docs/threat-model.md` classifies a
      // caller IP as personal data this system does not persist.
      assertEquals(rows.rows[0][0].includes("203.0.113.7"), false, "the row holds a fingerprint");
    } finally {
      await client.end();
    }
  }));

Deno.test("the refusal carries what a client needs to back off", () =>
  inOneWindow(async (b) => {
    const client = await connect();
    const db = dbOver(client);

    try {
      let refusal: Response | null = null;
      for (let i = 0; i < 21; i++) {
        refusal = await enforceRateLimit(request("203.0.113.8", i), db, b, LIMIT);
      }

      assertEquals(refusal?.status, 429);

      // Without a `Retry-After` a client's only option is to guess, and the
      // guess that costs nothing to make is "immediately".
      const retry = Number(refusal?.headers.get("retry-after"));
      assertEquals(retry > 0 && retry <= LIMIT.windowSeconds, true, `retry-after was ${retry}`);

      // The id a user can quote. `requestId` mints one when the caller sends
      // none, so this is never absent.
      assertEquals(typeof refusal?.headers.get("x-request-id"), "string");

      await refusal?.body?.cancel();
    } finally {
      await client.end();
    }
  }));

Deno.test("two machines do not share one allowance", () =>
  inOneWindow(async (b) => {
    const client = await connect();
    const db = dbOver(client);

    try {
      // One caller spends the whole window.
      for (let i = 0; i < 25; i++) {
        await enforceRateLimit(request("203.0.113.9", i), db, b, LIMIT);
      }

      // A different machine must still be served. A limiter that refuses this
      // is a limiter that takes the whole shop down when one person loops, and
      // it would pass the test above perfectly happily.
      const other = await enforceRateLimit(request("198.51.100.4", 0), db, b, LIMIT);
      assertEquals(other, null);
    } finally {
      await client.end();
    }
  }));

Deno.test("a cold start does not hand out a fresh allowance", () =>
  inOneWindow(async (b) => {
    // The reason the counter moved into Postgres at all, and the one property no
    // other test here covers. An isolate holding its own `Map` starts empty, so
    // a limit that lives only in memory is a suggestion: spend it, wait for a
    // recycle, and spend it again.
    //
    // `resetRateLimits()` is what makes this observable. It empties the same map
    // a new isolate would start with, so the request after it has nothing local
    // saying the caller is over — the database is the only thing left that can
    // refuse, which is exactly the claim. A new connection alongside it, since a
    // real isolate would not inherit one.
    const caller = "203.0.113.11";

    const first = await connect();
    try {
      for (let i = 0; i < 20; i++) {
        const res = await enforceRateLimit(request(caller, i), dbOver(first), b, LIMIT);
        assertEquals(res, null, `request ${i + 1} of the allowance was refused`);
      }
    } finally {
      await first.end();
    }

    resetRateLimits();

    const second = await connect();
    try {
      const refusal = await enforceRateLimit(request(caller, 99), dbOver(second), b, LIMIT);
      assertEquals(refusal?.status, 429, "a fresh isolate was handed a new allowance");
      await refusal?.body?.cancel();

      // And the fresh isolate's own request was counted, rather than the window
      // being read without being written to.
      const rows = await second.queryArray<[number]>(
        "select count from rate_limits where bucket = $1",
        [b],
      );
      assertEquals(rows.rows[0][0], 21, "the refused request still incremented the shared count");
    } finally {
      await second.end();
    }
  }));

/** A session token's shape: only its claims are read before Auth confirms it. */
function sessionToken(sub: string): string {
  const part = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${part({ alg: "HS256" })}.${part({ role: "authenticated", sub, exp })}.signature`;
}

function signedIn(ip: string, sub: string): Request {
  const req = request(ip, 0);
  req.headers.set("authorization", `Bearer ${sessionToken(sub)}`);
  return req;
}

// Security review of the accounts stack: a signed-in request used to be
// charged to its account alone, so one machine holding many accounts got one
// allowance per account. Driven through `enforceRateLimit` itself, so the
// order of the charges and the refusal are the shipped code's, not a copy.
Deno.test("many accounts on one machine share one ceiling", () =>
  inOneWindow(async (b) => {
    resetVerifiedTokens();
    const client = await connect();
    // Auth confirms every token as the account its `sub` names.
    const db: RateLimitDb = {
      ...dbOver(client),
      auth: {
        getUser: (jwt) =>
          Promise.resolve({ data: { user: { id: JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub } }, error: null }),
      },
    };
    const small: RateLimit = { windowSeconds: LIMIT.windowSeconds, maxRequests: 2 };

    try {
      // Fewer accounts than the ten fresh tokens an address may have checked
      // per minute, so every request is a confirmed account's.
      let allowed = 0;
      for (let a = 0; a < SIGNED_IN_PER_ADDRESS + 3; a++) {
        for (let i = 0; i < small.maxRequests; i++) {
          const res = await enforceRateLimit(signedIn("203.0.113.20", `farm-${a}`), db, b, small);
          if (res === null) allowed++;
          else await res.body?.cancel();
        }
      }
      assertEquals(allowed, small.maxRequests * SIGNED_IN_PER_ADDRESS, "the address ceiling capped the accounts");

      // Each account's own allowance still applies on a fresh address.
      const own = await enforceRateLimit(signedIn("198.51.100.20", "farm-0"), db, b, small);
      assertEquals(own?.status, 429, "an account's own allowance was spent");
      await own?.body?.cancel();

      // And a guest on the farmed address keeps the guests' own allowance.
      assertEquals(await enforceRateLimit(request("203.0.113.20", 1), db, b, small), null);
    } finally {
      await client.end();
    }
  }));
