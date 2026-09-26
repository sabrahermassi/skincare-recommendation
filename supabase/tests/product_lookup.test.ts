// `product-lookup`'s request-to-response path (#203), with a fake database and
// fake upstreams: the status for each outcome, the order of the checks, and
// what gets logged and written. The deployed function is checked with curl.
import { assert, assertEquals } from "jsr:@std/assert@1";

import { handleProductLookup, type ProductLookupDeps, SOURCE_TIMEOUT_MS } from "../functions/product-lookup/handler.ts";
import { resetRateLimits, resetVerifiedTokens } from "../functions/_shared/rate-limit.ts";
import { allKnown, type DbAnswer, type DbCall, FakeDb, fakeFetch, filterValue, jsonResponse } from "./fakes.ts";

// The limiter fingerprints callers with this; without it every request throws.
Deno.env.set("RATE_LIMIT_SALT", "test-salt");

const BARCODE = "8801234567890";
const FORMULA = "Water, Glycerin, Niacinamide, Butylene Glycol, Panthenol";

const CATALOGUE_ROW = {
  id: "obf-8801234567890",
  barcode: BARCODE,
  name: "Calming Toner",
  product_ingredients: [{ position: 0, ingredients: { inci_name: "water" } }],
};

type Upstream = (url: string) => Response;

const OBF_MISS: Upstream = () => jsonResponse({ status: 0 }, 404);

function obfHit(formula = FORMULA): Upstream {
  return () =>
    jsonResponse({
      status: 1,
      product: { product_name: "Calming Toner", brands: "Brand A, Brand B", ingredients_text: formula, categories_tags: [] },
    });
}

function setup(answer: DbAnswer = () => undefined, upstream: Upstream = OBF_MISS, inciApiKey = "") {
  resetRateLimits();
  resetVerifiedTokens();
  const db = new FakeDb(answer);
  const { fetch, calls: fetched } = fakeFetch(upstream);
  const deps: ProductLookupDeps = { db, fetch, inciApiKey };
  return { db, deps, fetched };
}

function post(body: unknown): Request {
  return new Request("https://example.test/product-lookup", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function outcomes(db: FakeDb): unknown[] {
  return db.inserts("scan_log").map((row) => row.outcome);
}

/** The catalogue lookup by barcode, answered with `row` (null: not there). */
function catalogue(row: unknown, error: unknown = null): DbAnswer {
  return (call) =>
    call.kind === "select" && call.table === "products" && filterValue(call, "eq", "barcode") !== undefined
      ? { data: row, error }
      : undefined;
}

/** The read-back after a write: the row as it was sent, with its ingredients. */
function readBack(call: DbCall, written: () => Record<string, unknown> | undefined) {
  if (call.kind === "select" && call.table === "products" && filterValue(call, "eq", "id") !== undefined) {
    return { data: { ...written(), product_ingredients: [{ position: 0 }] }, error: null };
  }
  return undefined;
}

function either(...answers: DbAnswer[]): DbAnswer {
  return (call) => {
    for (const answer of answers) {
      const reply = answer(call);
      if (reply) return reply;
    }
    return undefined;
  };
}

// ── The order of the checks ─────────────────────────────────────────────────

Deno.test("a preflight is answered with no body and no database call", async () => {
  const { db, deps } = setup();
  const reply = await handleProductLookup(new Request("https://example.test/", { method: "OPTIONS" }), deps);
  assertEquals(reply.status, 204);
  assertEquals(db.calls, []);
});

Deno.test("only POST is accepted, before anything is read", async () => {
  const { db, deps } = setup();
  const reply = await handleProductLookup(new Request("https://example.test/", { method: "GET" }), deps);
  assertEquals(reply.status, 405);
  assertEquals(db.calls, []);
});

Deno.test("a body that isn't JSON is refused before the limiter", async () => {
  const { db, deps } = setup();
  const reply = await handleProductLookup(post("{not json"), deps);
  assertEquals(reply.status, 400);
  assertEquals(db.calls, []);
});

Deno.test("a barcode that isn't 8-14 digits is refused before the limiter", async () => {
  for (const barcode of ["123", "88012345678901234", "8801234abc", 8801234567890, null]) {
    const { db, deps } = setup();
    const reply = await handleProductLookup(post({ barcode }), deps);
    assertEquals(reply.status, 400, `barcode ${barcode}`);
    assertEquals(db.rpcCalls("consume_rate_limit"), []);
  }
});

Deno.test("a caller over the limit gets 429 with Retry-After, and nothing is looked up", async () => {
  const { db, deps, fetched } = setup((call) =>
    call.kind === "rpc" && call.fn === "consume_rate_limit" ? { data: 21, error: null } : undefined
  );
  const reply = await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(reply.status, 429);
  assert(Number(reply.headers.get("retry-after")) >= 1);
  assertEquals(db.selects("products"), []);
  assertEquals(fetched, []);
  assertEquals(outcomes(db), []);
});

// ── Our own catalogue ───────────────────────────────────────────────────────

Deno.test("a product already in the catalogue is returned without asking anyone else", async () => {
  const { db, deps, fetched } = setup(catalogue(CATALOGUE_ROW));
  const reply = await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(reply.status, 200);
  assertEquals((await reply.json()).id, CATALOGUE_ROW.id);
  assertEquals(fetched, []);
  assertEquals(outcomes(db), ["resolved"]);
});

Deno.test("an expired third-party row is not served: the catalogue query excludes it", async () => {
  const { db, deps } = setup();
  await handleProductLookup(post({ barcode: BARCODE }), deps);
  const lookup = db.selects("products")[0];
  assert(String(filterValue(lookup, "or", "")).startsWith("expires_at.is.null,expires_at.gt."));
});

Deno.test("a catalogue row with no ingredients is 'not found', and no other source is asked", async () => {
  const { db, deps, fetched } = setup(catalogue({ ...CATALOGUE_ROW, product_ingredients: [] }));
  const reply = await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(reply.status, 404);
  assertEquals(fetched, []);
  assertEquals(outcomes(db), ["not_found"]);
});

// ── The sources ─────────────────────────────────────────────────────────────

Deno.test("a barcode nowhere is 404 and logged as not found", async () => {
  const { db, deps, fetched } = setup();
  const reply = await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(reply.status, 404);
  assertEquals(fetched.length, 1);
  assert(fetched[0].url.includes(`/product/${BARCODE}.json`));
  assertEquals(outcomes(db), ["not_found"]);
});

Deno.test("an Open Beauty Facts hit is written in one transaction and read back", async () => {
  let written: Record<string, unknown> | undefined;
  const { db, deps } = setup(
    either(allKnown, (call) => readBack(call, () => written), (call) => {
      if (call.kind === "rpc" && call.fn === "replace_product_with_ingredients") {
        written = call.args.p_product as Record<string, unknown>;
      }
      return undefined;
    }),
    obfHit(),
  );
  const reply = await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(reply.status, 200);
  const body = await reply.json();
  assertEquals(body.id, `obf-${BARCODE}`);
  assertEquals(body.brand, "Brand A");
  assertEquals(body.source, "obf");
  // ODbL: ours to keep.
  assertEquals(body.expires_at, null);
  const [write] = db.rpcCalls("replace_product_with_ingredients");
  assertEquals((write.p_ingredients as unknown[]).length, 5);
  assertEquals(outcomes(db), ["resolved"]);
});

Deno.test("a write that fails is 502, never 'not found' or a half answer", async () => {
  const { db, deps } = setup(
    either(allKnown, (call) =>
      call.kind === "rpc" && call.fn === "replace_product_with_ingredients"
        ? { data: null, error: { message: "boom" } }
        : undefined
    ),
    obfHit(),
  );
  const reply = await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(reply.status, 502);
  assertEquals(await reply.json(), { error: "Could not save the product" });
  assertEquals(outcomes(db), ["internal_error"]);
});

Deno.test("a source that is down is an upstream failure, not a miss", async () => {
  for (const upstream of [() => jsonResponse({}, 503), () => { throw new TypeError("dns"); }]) {
    const { db, deps } = setup(() => undefined, upstream);
    const reply = await handleProductLookup(post({ barcode: BARCODE }), deps);
    assertEquals(reply.status, 404);
    assertEquals(outcomes(db), ["upstream_failure"]);
  }
});

Deno.test("a formula the gate refuses is not stored, and is logged as the gate", async () => {
  // No name in it is a dictionary entry.
  const { db, deps } = setup(() => undefined, obfHit("Qzx, Wvb, Plk, Mnr, Ytr"));
  const reply = await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(reply.status, 404);
  assertEquals(db.rpcCalls("replace_product_with_ingredients"), []);
  assertEquals(outcomes(db), ["quality_gate"]);
});

Deno.test("INCI API is asked only when Open Beauty Facts has nothing usable, and its row expires", async () => {
  let written: Record<string, unknown> | undefined;
  const { db, deps, fetched } = setup(
    either(allKnown, (call) => readBack(call, () => written), (call) => {
      if (call.kind === "rpc" && call.fn === "replace_product_with_ingredients") {
        written = call.args.p_product as Record<string, unknown>;
      }
      return undefined;
    }),
    (url) =>
      url.startsWith("https://inciapi.com/")
        ? jsonResponse({ name: "Calming Toner", brand: "Brand", ingredients: FORMULA }, 200, {
          "cache-control": "max-age=3600",
        })
        : jsonResponse({ status: 0 }, 404),
    "inci-key",
  );
  const before = Date.now();
  const reply = await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(reply.status, 200);
  assertEquals(fetched.map((f) => new URL(f.url).host), ["world.openbeautyfacts.org", "inciapi.com"]);
  assertEquals((fetched[1].init?.headers as Record<string, string>)["X-API-Key"], "inci-key");
  const body = await reply.json();
  assertEquals(body.source, "inci_api");
  const expires = Date.parse(body.expires_at);
  assert(expires >= before + 3_600_000 && expires <= Date.now() + 3_600_000);
  assertEquals(db.rpcCalls("replace_product_with_ingredients").length, 1);
});

Deno.test("each outside source gets a deadline inside the app's 12 s wait (#198)", async () => {
  const { deps, fetched } = setup(() => undefined, OBF_MISS, "inci-key");
  await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(fetched.length, 2);
  for (const call of fetched) assert(call.init?.signal instanceof AbortSignal, call.url);
  assert(2 * SOURCE_TIMEOUT_MS < 12_000);
});

Deno.test("with no INCI API key, that source is never called", async () => {
  const { deps, fetched } = setup();
  await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(fetched.every((f) => !f.url.includes("inciapi.com")), true);
});

Deno.test("a catalogue outage with no other answer is our failure, not a miss", async () => {
  const { db, deps } = setup(catalogue(null, { message: "down" }));
  const reply = await handleProductLookup(post({ barcode: BARCODE }), deps);
  assertEquals(reply.status, 404);
  assertEquals(outcomes(db), ["internal_error"]);
});
