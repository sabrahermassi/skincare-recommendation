// `label-ocr`'s request-to-response path (#203), with a fake database and a
// fake Vision: the status for each outcome, the order of the checks, the read
// token, and a save racing another save of the same barcode. The deployed
// function is checked with curl.
import { assert, assertEquals } from "jsr:@std/assert@1";

import { handleLabelOcr, type LabelOcrDeps } from "../functions/label-ocr/handler.ts";
import { MAX_IMAGE_CHARS } from "../functions/_shared/image-limits.ts";
import { READ_TOKEN_TTL_MS, signReadToken, verifyReadToken } from "../functions/_shared/read-token.ts";
import { resetRateLimits, resetVerifiedTokens } from "../functions/_shared/rate-limit.ts";
import { allKnown, type DbAnswer, FakeDb, fakeFetch, filterValue, jsonResponse } from "./fakes.ts";

// The limiter fingerprints callers with this; without it every request throws.
Deno.env.set("RATE_LIMIT_SALT", "test-salt");

const SECRET = "read-token-secret";
const BARCODE = "8801234567890";
const LABEL = "Ingredients: Water, Glycerin, Niacinamide, Butylene Glycol, Panthenol";
const NAMES = ["water", "glycerin", "niacinamide", "butylene glycol", "panthenol"];

/** A well-formed 16x16 baseline JPEG: the smallest thing the metadata pass accepts as an image. */
function tinyJpeg(): string {
  const segment = (marker: number, payload: number[]) => {
    const length = payload.length + 2;
    return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
  };
  const bytes = [
    0xff, 0xd8,
    ...segment(0xc0, [0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00]),
    ...segment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    0x12, 0x34, 0x56, 0x78,
    0xff, 0xd9,
  ];
  return btoa(String.fromCharCode(...bytes));
}

type Vision = (url: string, init?: RequestInit) => Response;

function visionReads(text: string | null): Vision {
  return () => jsonResponse({ responses: [text === null ? {} : { fullTextAnnotation: { text } }] });
}

function setup(answer: DbAnswer = () => undefined, vision: Vision = visionReads(LABEL), visionApiKey = "vision-key") {
  resetRateLimits();
  resetVerifiedTokens();
  const db = new FakeDb(answer);
  const { fetch, calls: fetched } = fakeFetch(vision);
  const deps: LabelOcrDeps = { db, fetch, visionApiKey, readTokenSecret: SECRET };
  return { db, deps, fetched };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/label-ocr", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function outcomes(db: FakeDb): unknown[] {
  return db.inserts("scan_log").map((row) => row.outcome);
}

function limiterBuckets(db: FakeDb): unknown[] {
  return db.rpcCalls("consume_rate_limit").map((args) => args.p_bucket);
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

const overTheLimit: DbAnswer = (call) =>
  call.kind === "rpc" && call.fn === "consume_rate_limit" ? { data: 999, error: null } : undefined;

// ── Order of the checks ─────────────────────────────────────────────────────

Deno.test("only POST is accepted, before anything is read", async () => {
  const { db, deps } = setup();
  const reply = await handleLabelOcr(new Request("https://example.test/", { method: "GET" }), deps);
  assertEquals(reply.status, 405);
  assertEquals(db.calls, []);
});

Deno.test("an oversized body is refused on its declared length, charged and logged, never read", async () => {
  const { db, deps, fetched } = setup();
  const reply = await handleLabelOcr(post("{}", { "content-length": String(MAX_IMAGE_CHARS + 64 * 1024 + 1) }), deps);
  assertEquals(reply.status, 413);
  assertEquals(limiterBuckets(db), ["label-ocr"]);
  assertEquals(outcomes(db), ["image_too_large"]);
  assertEquals(fetched, []);
});

Deno.test("an oversized body from a caller over the limit gets 429, and no log row", async () => {
  const { db, deps } = setup(overTheLimit);
  const reply = await handleLabelOcr(post("{}", { "content-length": String(MAX_IMAGE_CHARS + 64 * 1024 + 1) }), deps);
  assertEquals(reply.status, 429);
  assertEquals(outcomes(db), []);
});

Deno.test("a body that isn't JSON is refused before the limiter", async () => {
  const { db, deps } = setup();
  const reply = await handleLabelOcr(post("{not json"), deps);
  assertEquals(reply.status, 400);
  assertEquals(db.calls, []);
});

Deno.test("malformed fields are refused before the limiter", async () => {
  for (const body of [
    { imageBase64: tinyJpeg(), barcode: 8801234567890 },
    { imageBase64: tinyJpeg(), barcode: "12ab" },
    { imageBase64: tinyJpeg(), name: 5 },
    { imageBase64: tinyJpeg(), brand: ["x"] },
    {},
    { imageBase64: "" },
  ]) {
    const { db, deps } = setup();
    const reply = await handleLabelOcr(post(body), deps);
    assertEquals(reply.status, 400, JSON.stringify(body).slice(0, 60));
    assertEquals(db.calls, []);
  }
});

// ── Reading a photo ─────────────────────────────────────────────────────────

Deno.test("a read over the limit gets 429, and Vision is never called", async () => {
  const { deps, fetched } = setup(overTheLimit);
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 429);
  assert(reply.headers.get("retry-after"));
  assertEquals(fetched, []);
});

Deno.test("with no Vision key a read is 503 and still leaves a scan_log row (CLAUDE.md)", async () => {
  const { db, deps, fetched } = setup(() => undefined, visionReads(LABEL), "");
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 503);
  assertEquals(outcomes(db), ["internal_error"]);
  assertEquals(fetched, []);
});

Deno.test("an image past the size cap is 413 once the body is read", async () => {
  const { db, deps, fetched } = setup();
  const reply = await handleLabelOcr(post({ imageBase64: "A".repeat(MAX_IMAGE_CHARS + 1) }), deps);
  assertEquals(reply.status, 413);
  assertEquals(outcomes(db), ["image_too_large"]);
  assertEquals(fetched, []);
});

Deno.test("text that isn't base64 is 400, and never reaches Vision", async () => {
  const { db, deps, fetched } = setup();
  const reply = await handleLabelOcr(post({ imageBase64: "not base64!" }), deps);
  assertEquals(reply.status, 400);
  assertEquals(outcomes(db), ["unsupported_image"]);
  assertEquals(fetched, []);
});

Deno.test("base64 that isn't an image is 415, and never reaches Vision", async () => {
  const { db, deps, fetched } = setup();
  const reply = await handleLabelOcr(post({ imageBase64: btoa("just some text, not a picture") }), deps);
  assertEquals(reply.status, 415);
  assertEquals(outcomes(db), ["unsupported_image"]);
  assertEquals(fetched, []);
});

Deno.test("Vision failing is 502, a network problem rather than the photo's", async () => {
  for (const vision of [
    () => jsonResponse({}, 500),
    () => { throw new TypeError("dns"); },
    () => jsonResponse({ responses: [{ error: { message: "bad image" } }] }),
  ] as Vision[]) {
    const { db, deps } = setup(() => undefined, vision);
    const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
    assertEquals(reply.status, 502);
    assertEquals(outcomes(db), ["upstream_failure"]);
  }
});

Deno.test("a photo with no text is 422 not_enough_text", async () => {
  const { db, deps } = setup(() => undefined, visionReads(null));
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 422);
  assertEquals((await reply.json()).error, "not_enough_text");
  assertEquals(outcomes(db), ["not_enough_text"]);
});

Deno.test("too few ingredients is 422 not_enough_text", async () => {
  const { db, deps } = setup(allKnown, visionReads("Water, Glycerin"));
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 422);
  assertEquals((await reply.json()).found, 2);
  assertEquals(outcomes(db), ["not_enough_text"]);
});

Deno.test("a list the dictionary mostly doesn't know is 422 low_confidence", async () => {
  const { db, deps } = setup(() => undefined, visionReads("Qzx, Wvb, Plk, Mnr, Ytr"));
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 422);
  assertEquals((await reply.json()).error, "low_confidence");
  assertEquals(outcomes(db), ["quality_gate"]);
});

Deno.test("a dictionary that can't be read is 502, logged as ours", async () => {
  const { db, deps } = setup((call) =>
    call.kind === "select" && call.table === "ingredient_synonyms" ? { data: null, error: { message: "down" } } : undefined
  );
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 502);
  assertEquals(outcomes(db), ["internal_error"]);
});

Deno.test("a good read returns the list and a token signed for exactly it, and writes nothing", async () => {
  const { db, deps, fetched } = setup(allKnown);
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 200);
  const body = await reply.json();
  const names = body.ingredients.map((i: { inci_name: string }) => i.inci_name);
  assertEquals(names, NAMES);
  assertEquals(body.recognised, 5);
  assert(await verifyReadToken(body.readToken, names, SECRET));
  assert(!(await verifyReadToken(body.readToken, names.slice(1), SECRET)));
  assertEquals(outcomes(db), ["read_ok"]);
  assertEquals(db.rpcCalls("replace_product_with_ingredients"), []);
  assertEquals(fetched.length, 1);
});

// ── Saving a read list ──────────────────────────────────────────────────────

async function saveBody(overrides: Record<string, unknown> = {}) {
  return {
    barcode: BARCODE,
    name: "Calming Toner",
    brand: "Brand",
    ingredients: NAMES,
    readToken: await signReadToken(NAMES, SECRET),
    ...overrides,
  };
}

/** A save that goes through: every name known, the token unspent, the write read back. */
function savesCleanly(extra: DbAnswer = () => undefined): DbAnswer {
  let written: Record<string, unknown> | undefined;
  return either(extra, allKnown, (call) => {
    if (call.kind === "rpc" && call.fn === "consume_read_token") return { data: true, error: null };
    if (call.kind === "rpc" && call.fn === "replace_product_with_ingredients") {
      written = call.args.p_product as Record<string, unknown>;
    }
    if (call.kind === "select" && call.table === "products" && filterValue(call, "eq", "barcode") === BARCODE) {
      return { data: written ? { ...written, product_ingredients: NAMES } : null, error: null };
    }
    return undefined;
  });
}

Deno.test("a save needs a barcode, a name, a list and a token, checked before the limiter", async () => {
  for (const overrides of [
    { barcode: undefined },
    { name: "  " },
    { ingredients: "water, glycerin" },
    { ingredients: [1, 2, 3, 4] },
    { readToken: undefined },
  ]) {
    const { db, deps } = setup(savesCleanly());
    const reply = await handleLabelOcr(post(await saveBody(overrides)), deps);
    assertEquals(reply.status, 400, JSON.stringify(overrides));
    assertEquals(limiterBuckets(db), []);
  }
});

Deno.test("a name that can't be stored is 422 before the limiter or the token (#200)", async () => {
  const { db, deps } = setup(savesCleanly());
  const reply = await handleLabelOcr(post(await saveBody({ name: "visit https://spam.example" })), deps);
  assertEquals(reply.status, 422);
  assertEquals((await reply.json()).field, "name");
  assertEquals(db.calls, []);
});

Deno.test("a save over its own limit gets 429 without spending the token", async () => {
  const { db, deps } = setup(either(overTheLimit, savesCleanly()));
  const reply = await handleLabelOcr(post(await saveBody()), deps);
  assertEquals(reply.status, 429);
  assertEquals(limiterBuckets(db), ["label-ocr-save"]);
  assertEquals(db.rpcCalls("consume_read_token"), []);
});

Deno.test("a clean save writes the product insert-only, spends the token, and returns it", async () => {
  const { db, deps } = setup(savesCleanly());
  const reply = await handleLabelOcr(post(await saveBody()), deps);
  assertEquals(reply.status, 200);
  const body = await reply.json();
  assertEquals(body.product.id, `ocr-${BARCODE}`);
  assertEquals(body.total, 5);
  assertEquals(db.rpcCalls("consume_read_token").length, 1);
  const [write] = db.rpcCalls("replace_product_with_ingredients");
  assertEquals(write.p_insert_only, true);
  assertEquals((write.p_product as Record<string, unknown>).source, "ocr");
  // A photo read doesn't touch Vision again when saved.
  assertEquals(limiterBuckets(db), ["label-ocr-save"]);
});

Deno.test("an expired token is 403 and is never recorded as spent", async () => {
  const { db, deps } = setup(savesCleanly());
  const stale = await signReadToken(NAMES, SECRET, Date.now() - READ_TOKEN_TTL_MS - 1000);
  const reply = await handleLabelOcr(post(await saveBody({ readToken: stale })), deps);
  assertEquals(reply.status, 403);
  assertEquals((await reply.json()).error, "read_expired");
  assertEquals(db.rpcCalls("consume_read_token"), []);
});

Deno.test("a token for a different list, or signed with another secret, is 403", async () => {
  for (const readToken of [await signReadToken(NAMES.slice(1), SECRET), await signReadToken(NAMES, "other-secret")]) {
    const { db, deps } = setup(savesCleanly());
    const reply = await handleLabelOcr(post(await saveBody({ readToken })), deps);
    assertEquals(reply.status, 403);
    assertEquals(db.rpcCalls("replace_product_with_ingredients"), []);
  }
});

Deno.test("a token already spent is 403, and nothing is written", async () => {
  const { db, deps } = setup(
    savesCleanly((call) =>
      call.kind === "rpc" && call.fn === "consume_read_token" ? { data: false, error: null } : undefined
    ),
  );
  const reply = await handleLabelOcr(post(await saveBody()), deps);
  assertEquals(reply.status, 403);
  assertEquals(db.rpcCalls("replace_product_with_ingredients"), []);
});

Deno.test("a failed write gives the token back and is 502", async () => {
  const { db, deps } = setup(
    savesCleanly((call) =>
      call.kind === "rpc" && call.fn === "replace_product_with_ingredients"
        ? { data: null, error: { message: "boom" } }
        : undefined
    ),
  );
  const token = (await saveBody()).readToken;
  const reply = await handleLabelOcr(post(await saveBody({ readToken: token })), deps);
  assertEquals(reply.status, 502);
  assertEquals(db.rpcCalls("release_read_token"), [{ p_token: token }]);
});

Deno.test("a barcode someone already saved keeps their product, and the token isn't spent", async () => {
  const theirs = { id: "ocr-theirs", barcode: BARCODE, name: "Their Toner", product_ingredients: NAMES };
  const { db, deps } = setup(
    savesCleanly((call) =>
      call.kind === "select" && call.table === "products" && filterValue(call, "eq", "barcode") === BARCODE
        ? { data: theirs, error: null }
        : undefined
    ),
  );
  const reply = await handleLabelOcr(post(await saveBody()), deps);
  assertEquals(reply.status, 200);
  assertEquals((await reply.json()).product.id, "ocr-theirs");
  assertEquals(db.rpcCalls("consume_read_token"), []);
  assertEquals(db.rpcCalls("replace_product_with_ingredients"), []);
});

Deno.test("two saves racing: the one the database kept is returned, and no author is claimed for it", async () => {
  // The first check sees no product; by the write, another save has landed. The
  // insert-only write leaves theirs, and the read-back by barcode finds it.
  const theirs = { id: "ocr-theirs-race", barcode: BARCODE, name: "Their Toner", product_ingredients: NAMES };
  let lookups = 0;
  const racing = savesCleanly((call) => {
    if (call.kind === "select" && call.table === "products" && filterValue(call, "eq", "barcode") === BARCODE) {
      lookups += 1;
      return { data: lookups === 1 ? null : theirs, error: null };
    }
    return undefined;
  });
  const { db, deps } = setup(racing);
  const reply = await handleLabelOcr(post(await saveBody()), deps);
  assertEquals(reply.status, 200);
  assertEquals((await reply.json()).product.id, "ocr-theirs-race");
  assertEquals(db.rpcCalls("replace_product_with_ingredients")[0].p_insert_only, true);
  assertEquals(db.inserts("product_authors"), []);
});

Deno.test("a save with too many names the dictionary lacks is 422, and the token isn't spent", async () => {
  const names = Array.from({ length: 200 }, (_, i) => `made up ingredient ${String.fromCharCode(97 + (i % 26))}${i}`);
  const { db, deps } = setup(
    either((call) => {
      if (call.kind === "select" && call.table === "ingredients" && filterValue(call, "eq", "verified") === true) {
        // Enough of the list recognised to pass the gate; the rest are new.
        const asked = filterValue(call, "in", "inci_name") as string[];
        return { data: asked.slice(0, Math.ceil(asked.length * 0.65)).map((inci_name) => ({ inci_name })), error: null };
      }
      return undefined;
    }, savesCleanly()),
  );
  const list = NAMES.concat(names);
  const reply = await handleLabelOcr(post(await saveBody({ ingredients: list, readToken: await signReadToken(list, SECRET) })), deps);
  assertEquals(reply.status, 422);
  assertEquals((await reply.json()).error, "too_many_new_ingredients");
  assertEquals(db.rpcCalls("consume_read_token"), []);
});
