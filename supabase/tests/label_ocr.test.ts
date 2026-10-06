// `label-ocr`'s request-to-response path (#203), with a fake database and a
// fake Vision: the status for each outcome, the order of the checks, the read
// token, and a save racing another save of the same barcode. The deployed
// function is checked with curl.
import { assert, assertEquals } from "jsr:@std/assert@1";

import { handleLabelOcr, type LabelOcrDeps, VISION_ATTEMPTS, VISION_TIMEOUT_MS } from "../functions/label-ocr/handler.ts";
import { MAX_IMAGE_CHARS } from "../functions/_shared/image-limits.ts";
import { resetRateLimits, resetVerifiedTokens } from "../functions/_shared/rate-limit.ts";
import {
  allKnown,
  type DbAnswer,
  type FakeAuth,
  FakeDb,
  fakeFetch,
  filterValue,
  jsonResponse,
  signedIn,
} from "./fakes.ts";

// The limiter fingerprints callers with this; without it every request throws.
Deno.env.set("RATE_LIMIT_SALT", "test-salt");

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

function setup(
  answer: DbAnswer = () => undefined,
  vision: Vision = visionReads(LABEL),
  visionApiKey = "vision-key",
  visionDailyCeiling = 1000,
  auth?: FakeAuth,
) {
  resetRateLimits();
  resetVerifiedTokens();
  const db = new FakeDb(answer, auth);
  const { fetch, calls: fetched } = fakeFetch(vision);
  const deps: LabelOcrDeps = { db, fetch, visionApiKey, visionDailyCeiling };
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

Deno.test("a read Vision refuses once and then takes is a good read, on one deadline", async () => {
  for (const refusal of [
    () => jsonResponse({}, 503),
    () => { throw new TypeError("dns"); },
    () => jsonResponse({ responses: [{ error: { code: 14, message: "unavailable" } }] }),
  ] as Vision[]) {
    let asked = 0;
    const { db, deps, fetched } = setup(allKnown, (url, init) => (++asked === 1 ? refusal(url, init) : visionReads(LABEL)(url, init)));
    const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
    assertEquals(reply.status, 200);
    assertEquals(outcomes(db), ["read_ok"]);
    assertEquals(fetched.length, VISION_ATTEMPTS);
    assert(fetched[0].init?.signal === fetched[1].init?.signal, "the second try gets what is left of the first one's time");
  }
});

Deno.test("Vision is asked no more than VISION_ATTEMPTS times, and once when it calls the request wrong", async () => {
  const down = setup(() => undefined, () => jsonResponse({}, 500));
  assertEquals((await handleLabelOcr(post({ imageBase64: tinyJpeg() }), down.deps)).status, 502);
  assertEquals(down.fetched.length, VISION_ATTEMPTS);

  const refused = setup(() => undefined, () => jsonResponse({ error: { status: "PERMISSION_DENIED" } }, 403));
  assertEquals((await handleLabelOcr(post({ imageBase64: tinyJpeg() }), refused.deps)).status, 502);
  assertEquals(refused.fetched.length, 1);
  assertEquals(outcomes(refused.db), ["upstream_failure"]);
});

Deno.test("a busy or slow Vision (429, 408) is asked again; any other 4xx is not", async () => {
  for (const [status, asks] of [[429, VISION_ATTEMPTS], [408, VISION_ATTEMPTS], [400, 1], [401, 1], [404, 1]]) {
    const { deps, fetched } = setup(() => undefined, () => jsonResponse({}, status));
    assertEquals((await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps)).status, 502);
    assertEquals(fetched.length, asks, `HTTP ${status}`);
  }
});

Deno.test("once the deadline has passed, Vision isn't asked again", async () => {
  const timeout = AbortSignal.timeout;
  AbortSignal.timeout = () => AbortSignal.abort(new DOMException("timed out", "TimeoutError"));
  try {
    const { db, deps, fetched } = setup(() => undefined, () => jsonResponse({}, 503));
    assertEquals((await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps)).status, 502);
    assertEquals(fetched.length, 1);
    assertEquals(outcomes(db), ["upstream_failure"]);
  } finally {
    AbortSignal.timeout = timeout;
  }
});

Deno.test("a reply cut short by the deadline is logged as a timeout, whatever its status", async () => {
  const timeout = AbortSignal.timeout;
  const error = console.error;
  AbortSignal.timeout = () => AbortSignal.abort(new DOMException("timed out", "TimeoutError"));
  try {
    for (const status of [200, 503]) {
      const logged: string[] = [];
      console.error = (...line: unknown[]) => void logged.push(line.join(" "));
      const { deps } = setup(() => undefined, () => new Response("{\"responses\": [", { status }));
      assertEquals((await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps)).status, 502);
      assert(logged.some((line) => line.includes("the deadline passed") && line.includes(`HTTP ${status}`)), logged.join("\n"));
    }
    // With time left, a broken body is still called what it is.
    AbortSignal.timeout = timeout;
    const logged: string[] = [];
    console.error = (...line: unknown[]) => void logged.push(line.join(" "));
    const { deps } = setup(() => undefined, () => new Response("{\"responses\": [", { status: 200 }));
    await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
    assert(logged.some((line) => line.includes("isn't JSON")), logged.join("\n"));
    assert(!logged.some((line) => line.includes("the deadline passed")), logged.join("\n"));
  } finally {
    AbortSignal.timeout = timeout;
    console.error = error;
  }
});

Deno.test("a photo with no text is 422 not_enough_text", async () => {
  const { db, deps } = setup(() => undefined, visionReads(null));
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 422);
  assertEquals((await reply.json()).error, "not_enough_text");
  assertEquals(outcomes(db), ["not_enough_text"]);
});

Deno.test("Vision gets the key in a header, never the URL, and a deadline (#198)", async () => {
  const { deps, fetched } = setup(allKnown);
  await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  const [call] = fetched;
  assert(!call.url.includes("key="), call.url);
  assertEquals((call.init?.headers as Record<string, string>)["X-Goog-Api-Key"], "vision-key");
  assert(call.init?.signal instanceof AbortSignal);
  assert(VISION_TIMEOUT_MS < 45_000, "inside the app's own wait");
});

Deno.test("a failed read never sends back the text Vision found (#198)", async () => {
  for (const text of ["Water, Glycerin", "Qzx, Wvb, Plk, Mnr, Ytr"]) {
    const { deps } = setup(allKnown, visionReads(text));
    const body = await (await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps)).json();
    assertEquals("rawText" in body, false, JSON.stringify(body));
  }
});

// ── The daily Vision ceiling (#198) ─────────────────────────────────────────

const VISION_DAY = "label-ocr-vision-daily";

function visionDayAt(count: number | null, error: unknown = null): DbAnswer {
  return (call) =>
    call.kind === "rpc" && call.fn === "consume_rate_limit" && call.args.p_bucket === VISION_DAY
      ? { data: count, error }
      : undefined;
}

Deno.test("past the day's ceiling a read is 503 daily_limit, with Retry-After, and Vision isn't called", async () => {
  const { db, deps, fetched } = setup(visionDayAt(11), visionReads(LABEL), "vision-key", 10);
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 503);
  assertEquals((await reply.json()).error, "daily_limit");
  const retry = Number(reply.headers.get("retry-after"));
  assert(retry >= 1 && retry <= 86_400);
  assertEquals(fetched, []);
  // A day of refused reads still shows in the scan metric.
  assertEquals(outcomes(db), ["internal_error"]);
  const [counted] = db.rpcCalls("consume_rate_limit").filter((args) => args.p_bucket === VISION_DAY);
  assertEquals(counted.p_window_seconds, 86_400);
  assertEquals(counted.p_max_requests, 10);
});

Deno.test("at the ceiling exactly, the read still goes ahead", async () => {
  const { deps, fetched } = setup((call) => visionDayAt(10)(call) ?? allKnown(call), visionReads(LABEL), "vision-key", 10);
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 200);
  assertEquals(fetched.length, 1);
});

Deno.test("a second try counts toward the day, and isn't made once the day is spent", async () => {
  const counted = (db: FakeDb) => db.rpcCalls("consume_rate_limit").filter((args) => args.p_bucket === VISION_DAY).length;

  const room = setup(() => undefined, () => jsonResponse({}, 503));
  await handleLabelOcr(post({ imageBase64: tinyJpeg() }), room.deps);
  assertEquals(room.fetched.length, VISION_ATTEMPTS);
  assertEquals(counted(room.db), VISION_ATTEMPTS);

  // The first read takes the day's last place; the retry finds it spent.
  let spent = 9;
  const full = setup(
    (call) => (call.kind === "rpc" && call.fn === "consume_rate_limit" && call.args.p_bucket === VISION_DAY ? { data: ++spent, error: null } : undefined),
    () => jsonResponse({}, 503),
    "vision-key",
    10,
  );
  assertEquals((await handleLabelOcr(post({ imageBase64: tinyJpeg() }), full.deps)).status, 502);
  assertEquals(full.fetched.length, 1);
  assertEquals(outcomes(full.db), ["upstream_failure"]);
});

Deno.test("a day counter that can't be reached lets the read through", async () => {
  const { deps } = setup((call) => visionDayAt(null, { message: "down" })(call) ?? allKnown(call));
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 200);
});

Deno.test("only a photo about to reach Vision counts toward the day", async () => {
  for (const imageBase64 of ["not base64!", btoa("just some text, not a picture")]) {
    const { db, deps } = setup();
    await handleLabelOcr(post({ imageBase64 }), deps);
    assertEquals(limiterBuckets(db).includes(VISION_DAY), false);
  }
  const { db, deps } = setup(overTheLimit);
  await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(limiterBuckets(db), ["label-ocr"]);
});

// ── The dictionary, kept between reads (#198) ───────────────────────────────

Deno.test("a second read reuses the synonyms the first one paged through", async () => {
  const { db, deps } = setup(allKnown);
  await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(db.selects("ingredient_synonyms").length, 1);
});

Deno.test("a synonyms read that failed is asked again on the next photo", async () => {
  let failing = true;
  const { db, deps } = setup((call) => {
    if (call.kind === "select" && call.table === "ingredient_synonyms" && failing) {
      return { data: null, error: { message: "down" } };
    }
    return allKnown(call);
  });
  assertEquals((await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps)).status, 502);
  failing = false;
  assertEquals((await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps)).status, 200);
  assertEquals(db.selects("ingredient_synonyms").length, 2);
});

/** A verified dictionary holding exactly `entries`, paged the way `paginateOrdered` asks for it. */
function dictionaryOf(entries: string[]): DbAnswer {
  const sorted = [...entries].sort();
  return (call) => {
    if (call.kind !== "select" || call.table !== "ingredients" || filterValue(call, "eq", "verified") !== true) return undefined;
    const asked = filterValue(call, "in", "inci_name") as string[] | undefined;
    if (asked) return { data: asked.filter((n) => sorted.includes(n)).map((inci_name) => ({ inci_name })), error: null };
    const after = filterValue(call, "gt", "inci_name") as string | undefined;
    const rows = sorted.filter((n) => after === undefined || n > after).map((inci_name) => ({ inci_name }));
    return { data: rows, error: null };
  };
}

/** Whether the read paged through the whole dictionary, rather than only asking about its own names. */
function readWholeDictionary(db: FakeDb): boolean {
  return db.selects("ingredients").some((call) => filterValue(call, "in", "inci_name") === undefined);
}

Deno.test("a name the label broke across two lines is read whole, even when the rest clears the gate", async () => {
  const { db, deps } = setup(
    dictionaryOf(NAMES),
    visionReads("Ingredients: Water, Glycerin, Niacin-\namide, Butylene Glycol, Panthenol"),
  );
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 200);
  const body = await reply.json();
  assertEquals(body.ingredients.map((i: { inci_name: string }) => i.inci_name), NAMES);
  assertEquals(body.recognised, 5);
  assert(readWholeDictionary(db));
});

Deno.test("an unknown name on one line doesn't cost a label that clears the gate the dictionary", async () => {
  const { db, deps } = setup(
    dictionaryOf(NAMES),
    visionReads("Ingredients: Water, Glycerin, Qzxw Plk,\nButylene Glycol, Panthenol"),
  );
  assertEquals((await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps)).status, 200);
  assert(!readWholeDictionary(db));
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

Deno.test("a good read returns the list and no token, and writes nothing", async () => {
  const { db, deps, fetched } = setup(allKnown);
  const reply = await handleLabelOcr(post({ imageBase64: tinyJpeg() }), deps);
  assertEquals(reply.status, 200);
  const body = await reply.json();
  const names = body.ingredients.map((i: { inci_name: string }) => i.inci_name);
  assertEquals(names, NAMES);
  assertEquals(body.recognised, 5);
  assertEquals("readToken" in body, false);
  assertEquals(outcomes(db), ["read_ok"]);
  assertEquals(db.rpcCalls("replace_product_with_ingredients"), []);
  assertEquals(fetched.length, 1);
});

// ── Saving, switched off (#374) ─────────────────────────────────────────────

Deno.test("a save is 410 saving_disabled, before the limiter, and nothing is written", async () => {
  const { db, deps } = setup(allKnown);
  const reply = await handleLabelOcr(
    post({ barcode: BARCODE, name: "Calming Toner", brand: "Brand", ingredients: NAMES }),
    deps,
  );
  assertEquals(reply.status, 410);
  assertEquals((await reply.json()).error, "saving_disabled");
  assertEquals(limiterBuckets(db), []);
  assertEquals(db.rpcCalls("replace_product_with_ingredients"), []);
});
