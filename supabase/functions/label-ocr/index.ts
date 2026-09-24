// Read an ingredient list off a photographed label, and — once the user has
// named the product — write it back against its barcode so the next person who
// scans that barcode gets it instantly.
//
// Two calls: a photo is read and the list handed back (nothing is stored); the
// list, the barcode and a name are then saved together. A product exists only
// with all three.
//
// This is the tier that makes a scan-first app viable. Open Beauty Facts holds
// 37 products tagged South Korea; Olive Young alone lists over 10,000 SKUs. No
// barcode database will close that gap — but the formula is printed on the box
// in the user's hand, and reading it works on any product, any brand, any
// country. Every result is stored against the barcode, so the catalogue grows
// from real use instead of from a bulk import that does not exist.
//
// Google Cloud Vision rather than on-device ML Kit: every on-device OCR
// option is a native module, and a native module needs a development build,
// which this project does not use. That trade-off — a third-party trust
// boundary in exchange for staying on Expo Go — is recorded, with its
// revisit trigger, in docs/threat-model.md's "Backend <-> Google Vision"
// section. Do not re-derive it here; that doc is the one to update if the
// calculus changes. The key stays here, never in the bundle.

import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  json,
  preflight,
  enforceRateLimit,
  callerSalt,
  type RateLimit,
} from "../_shared/http.ts";
import { fetchAliases, fetchDictionary, knownIngredients } from "../_shared/dictionary.ts";
import { MIN_KNOWN_INGREDIENT_RATIO, gateRatio } from "../_shared/gate-ratio.ts";
import { dedupe, normalise, parseIngredientBlock } from "../_shared/inci-parse.ts";
import { MAX_IMAGE_CHARS } from "../_shared/image-limits.ts";
import { paginateOrdered } from "../_shared/paginate.ts";
import {
  MAX_NEW_STUBS_PER_SAVE,
  acceptedProductType,
  exactIlikePattern,
  mostCommonSpelling,
  savedTextProblem,
  storedText,
} from "../_shared/product-text.ts";
import { signedInAccount } from "../_shared/rate-limit.ts";
import { readTokenDeadline, signReadToken, verifyReadToken } from "../_shared/read-token.ts";
import { logScanBounded, type ScanOutcome } from "../_shared/scan-log.ts";
import { stripBase64ImageMetadata } from "../_shared/strip-metadata.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

/** Generous for a person in a shop, useless for anyone burning the free tier. */
const RATE_LIMIT: RateLimit = { windowSeconds: 300, maxRequests: 10 };

/**
 * Saving a read list is a cheap database write, unlike a photo read (a paid Vision
 * call), so it has its own bucket: one add is a read plus a save, and sharing the
 * read bucket would cap a person at five adds per window, fewer with retries.
 */
const SAVE_RATE_LIMIT: RateLimit = { windowSeconds: 300, maxRequests: 20 };


/** Four is the floor the verdict engine itself needs before it will produce a number. */
const MIN_INGREDIENTS = 4;

/** No ingredient list runs anywhere near this long; it only bounds what a client can send to be saved. */
const MAX_SAVED_INGREDIENTS = 400;

/**
 * Ceiling on the raw request body, checked against Content-Length before the
 * body is read at all. Sized as `MAX_IMAGE_CHARS` plus room for the JSON
 * envelope and the optional barcode/name/brand fields, so it never rejects a
 * request the image check would have accepted.
 */
const MAX_BODY_BYTES = MAX_IMAGE_CHARS + 64 * 1024;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  // Refuse an oversized body BEFORE reading it. `req.json()` buffers the whole
  // request into memory first, so the `MAX_IMAGE_CHARS` check further down —
  // correct as far as it goes — only ever runs once the bytes are already
  // held. Supabase does not document a request body limit for Edge Functions,
  // so there is nothing to delegate this to.
  //
  // A body with no Content-Length (chunked) cannot be pre-checked; that case
  // falls through to the existing check, which still holds.
  //
  // Sized for an image (`MAX_BODY_BYTES` = `MAX_IMAGE_CHARS` plus a small
  // envelope), so a body this large is, in practice, always an oversized
  // label photo rather than a save request — a save's body is a name, a
  // barcode and a list of short ingredient names, nowhere near this ceiling.
  // Rate-limited and logged against the read bucket on that basis: the rare
  // save request big enough to trip this is already the shape of abuse,
  // whichever bucket it debits. Found in review on #246 — this is the
  // ordinary path for an oversized photo (a normal `fetch` sends
  // `Content-Length`), not the edge case the chunked-request fallback below
  // covers, so it needs the limiter and a log row of its own rather than
  // sharing the read path's later call, which does not run until well after
  // the body — and therefore `saving` — is known.
  const declaredLength = Number(req.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    const refusal = await enforceRateLimit(req, db, "label-ocr", RATE_LIMIT);
    if (refusal) return refusal;
    // `image_bytes` is left unset here, matching migration 0024's own note on
    // that column: only the declared length is known at this point, and that
    // is not the same measurement `image_bytes` means everywhere else it's
    // recorded (the actual base64 payload size).
    await logScanBounded(req, db, callerSalt(), { path: "label", outcome: "image_too_large" });
    return json(req, { error: "Image too large — retake it closer in" }, 413);
  }

  let barcode: string | undefined;
  let imageBase64: string | undefined;
  let name: string | undefined;
  let brand: string | undefined;
  let ingredients: unknown;
  let readToken: unknown;
  let type: unknown;
  try {
    ({ barcode, imageBase64, name, brand, ingredients, readToken, type } = await req.json());
  } catch {
    return json(req, { error: "Body must be JSON" }, 400);
  }

  // Two steps, one endpoint. Reading a photo writes nothing: the user has not
  // yet said what the product is called, and a product is stored only once it
  // has a name, a barcode and an ingredient list. Saving takes the list that the
  // read returned (no image) along with the barcode and the name.
  const saving = ingredients !== undefined;

  // `typeof` first, deliberately. `/regex/.test(x)` coerces its argument, so
  // a JSON *number* barcode passes the digit check and is then written to
  // `products.barcode` as a number rather than the string the column expects.
  if (barcode !== undefined && (typeof barcode !== "string" || !/^\d{8,14}$/.test(barcode))) {
    return json(req, { error: "barcode must be 8-14 digits" }, 400);
  }
  if (name !== undefined && typeof name !== "string") {
    return json(req, { error: "name must be a string" }, 400);
  }
  if (brand !== undefined && typeof brand !== "string") {
    return json(req, { error: "brand must be a string" }, 400);
  }

  if (saving) {
    if (!barcode) return json(req, { error: "barcode is required" }, 400);
    if (!name || name.trim().length === 0) return json(req, { error: "name is required" }, 400);
    // Before the rate limiter and the token, so a refused name spends neither:
    // the person fixes the name and saves the same read again (#200).
    for (const [field, value] of [["name", name], ["brand", brand]] as const) {
      if (value === undefined || value.trim() === "") continue;
      const problem = savedTextProblem(field, value);
      if (problem) return json(req, { error: "bad_product_text", field, problem }, 422);
    }
    if (
      !Array.isArray(ingredients) ||
      ingredients.length > MAX_SAVED_INGREDIENTS ||
      !ingredients.every((entry) => typeof entry === "string")
    ) {
      return json(req, { error: "ingredients must be a list of names" }, 400);
    }
    if (typeof readToken !== "string") return json(req, { error: "readToken is required" }, 400);
    const refusal = await enforceRateLimit(req, db, "label-ocr-save", SAVE_RATE_LIMIT);
    if (refusal) return refusal;
    // The list has to be one a read returned, unedited and recent: this
    // endpoint is unauthenticated, and without the proof anyone could save a
    // made-up list of real ingredient names under any unclaimed barcode.
    if (!(await verifyReadToken(readToken, ingredients as string[], SERVICE_ROLE_KEY))) {
      return json(req, { error: "read_expired" }, 403);
    }
    return saveProduct(req, barcode, name, brand, acceptedProductType(type), ingredients as string[], readToken);
  }

  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return json(req, { error: "imageBase64 is required" }, 400);
  }

  // The rate limiter sits above the size check below, not below it as it did
  // before this file logged anything: a request with no `Content-Length`
  // header (chunked) skips the earlier pre-body-read check entirely and
  // reaches this one instead, so the oversize rejection at line ~185 needs
  // `logRead` — and therefore the limiter — already in scope. Logging a
  // pre-limit rejection would itself be the write amplification the limiter
  // exists to prevent, so the two move together. Found in review on #246.
  const refusal = await enforceRateLimit(req, db, "label-ocr", RATE_LIMIT);
  if (refusal) return refusal;

  // #205's 48MP evidence, and the raw-scan-log's own `image_bytes` column
  // (migration 0024): base64 to bytes is 3/4, and this is measured before
  // `imageBase64` is reassigned to the stripped copy below.
  const rawImageBytes = Math.round((imageBase64.length * 3) / 4);
  const logRead = (outcome: ScanOutcome, extra: { namesParsed?: number; namesResolved?: number } = {}) =>
    logScanBounded(req, db, callerSalt(), { path: "label", outcome, imageBytes: rawImageBytes, ...extra });

  // Moved here from the top of the handler (was checked before `saving` was
  // even known, blocking a save too — the save path never touches Vision).
  // The real reason it lives here, though: `logRead` needs the body parsed
  // and `rawImageBytes` measured to exist at all, and without this check
  // running through it, a missing key returned 503 with no row — every read
  // attempt during a misconfiguration vanished from the metric this PR
  // exists to produce. Found live on staging (#246 review).
  if (!VISION_API_KEY) {
    await logRead("internal_error");
    return json(req, { error: "OCR is not configured" }, 503);
  }

  if (imageBase64.length > MAX_IMAGE_CHARS) {
    await logRead("image_too_large");
    return json(req, { error: "Image too large — retake it closer in" }, 413);
  }
  // Cheap rejection of garbage before it reaches Vision: a non-base64 payload
  // would otherwise spend a network round trip only to be rejected there.
  if (!/^[A-Za-z0-9+/=\s]+$/.test(imageBase64)) {
    // Same bucket as `unsupported_image` below — both mean "not decodable
    // image data" — rather than a new outcome value for one more shape of
    // the same failure. Found in review on #246.
    await logRead("unsupported_image");
    return json(req, { error: "imageBase64 is not valid base64" }, 400);
  }

  // Strip EXIF/XMP/IPTC before this image goes anywhere. A phone photo carries
  // GPS coordinates, and the next thing that happens to it is a POST to Google
  // Cloud Vision — so without this a user's home address crosses a third-party
  // boundary attached to a photo of a shampoo bottle. Nothing is stored here,
  // which is exactly why the leak is in transit rather than at rest, and why
  // the no-photo-storage non-goal in `docs/threat-model.md` does not cover it.
  //
  // The client strips too, but that is a convenience: this endpoint is
  // unauthenticated, so a hostile or simply outdated client will not cooperate
  // and the server pass is the control.
  //
  // Placed after the rate limit so an attacker meets the limiter before we
  // spend anything.
  //
  // Reassigning `imageBase64` itself rather than binding a second name is
  // deliberate: nothing in scope then holds the original bytes, so a later
  // edit cannot route the unstripped image to Vision by accident.
  // The same pass also proves the payload is genuinely a well-formed image
  // and reads its declared dimensions, so a decompression bomb is refused on
  // its header rather than on what it would cost to decode. Magic bytes alone
  // would not do: FFD8FF prefixed to an archive is trivial, so the walk
  // requires a real frame header and real pixel data before it accepts
  // anything. Nothing here decodes — see the note on `stripImageMetadata`
  // for why re-encoding would move risk onto us rather than away.
  const cleaned = stripBase64ImageMetadata(imageBase64);
  if (!cleaned.ok) {
    // Reachable from our own client only in the "too_large" case, and then
    // only on a phone whose camera outdoes the size cap; the rest need a
    // hand-rolled caller. `data/api.ts` maps 415 to "unreadable" and already
    // has copy for 413.
    if (cleaned.reason === "too_large") {
      await logRead("image_too_large");
      return json(req, { error: "Image too large — retake it closer in" }, 413);
    }
    await logRead("unsupported_image");
    return json(req, { error: "Unsupported image format" }, 415);
  }
  imageBase64 = cleaned.base64;

  const ocr = await runOcr(imageBase64);
  if (!ocr.ok) {
    // A blank, blurred or text-free photo is an ordinary read failure, not
    // Vision having a bad day — logged as `not_enough_text` with zero parsed
    // names, the same outcome the too-few-fragments check below uses for the
    // same underlying fact ("nothing usable came out of this photo").
    await logRead(ocr.noText ? "not_enough_text" : "upstream_failure", { namesParsed: 0 });
    return json(req, { error: "Could not read the image" }, 502);
  }
  const text = ocr.text;

  // Aliases are cheap (one small table) and needed on every path, so they are
  // fetched unconditionally. The dictionary is tens of thousands of rows and
  // only needed when the label's own delimiters didn't produce enough tokens
  // on their own; fetching it up front cost every well-punctuated label a full
  // table scan for nothing. This probe is not a second parser to keep in
  // sync with the real one below — it is the exact same `parseIngredientBlock`
  // invoked once first with no dictionary, so it can only take the delimited
  // path, whose token count does not depend on the dictionary being present.
  let aliases: Map<string, string>;
  try {
    aliases = await fetchAliases(db);
  } catch (err) {
    console.error("fetchAliases failed:", err);
    await logRead("internal_error");
    return json(req, { error: "Could not read the ingredient dictionary" }, 502);
  }
  let parsed = parseIngredientBlock(text, undefined, aliases);

  // Reads the label again with the dictionary, at most once. Returns the error
  // response when the dictionary cannot be read, and null otherwise.
  let readWithDictionary = false;
  const parseWithDictionary = async (): Promise<Response | null> => {
    let dictionary: Set<string>;
    try {
      dictionary = await fetchDictionary(db);
    } catch (err) {
      console.error("fetchDictionary failed:", err);
      await logRead("internal_error");
      return json(req, { error: "Could not read the ingredient dictionary" }, 502);
    }
    // A synonym is matchable in its own right, then resolved to the canonical
    // name on the way out.
    for (const synonym of aliases.keys()) dictionary.add(synonym);
    parsed = parseIngredientBlock(text, dictionary, aliases);
    readWithDictionary = true;
    return null;
  };

  if (parsed.length < 4) {
    const failed = await parseWithDictionary();
    if (failed) return failed;
  }

  if (parsed.length < MIN_INGREDIENTS) {
    // Better to say so than to score a fragment. Four is the same floor the
    // verdict engine uses before it will produce a number at all.
    await logRead("not_enough_text", { namesParsed: parsed.length });
    return json(
      req,
      { error: "not_enough_text", found: parsed.length, rawText: text.slice(0, 400) },
      422
    );
  }

  let known: Set<string>;
  try {
    known = await knownIngredients(db, parsed.map((p) => p.inci_name));
  } catch (err) {
    console.error("knownIngredients failed:", err);
    await logRead("internal_error", { namesParsed: parsed.length });
    return json(req, { error: "Could not read the ingredient dictionary" }, 502);
  }

  // A well-punctuated label skips the dictionary above, so none of the repairs
  // that need it (common names, spacing, slash lists, typos) have run: "Purified
  // Water, Glycerol, Shea Butter, Vitamin E" comes back as four unknown names.
  // When too few of the probe's names are recognised, that is the moment to load
  // the dictionary and read the label again; a label that is already recognised
  // never pays for the table scan. The second read is kept only if it recognises
  // at least as much of the label as the first.
  if (!readWithDictionary && gateRatio(parsed, known) < MIN_KNOWN_INGREDIENT_RATIO) {
    const probeParsed = parsed;
    const probeKnown = known;
    const failed = await parseWithDictionary();
    if (failed) return failed;
    let rereadKnown: Set<string> | null = null;
    if (parsed.length >= 4) {
      try {
        rereadKnown = await knownIngredients(db, parsed.map((p) => p.inci_name));
      } catch (err) {
        console.error("knownIngredients failed:", err);
        await logRead("internal_error", { namesParsed: parsed.length });
        return json(req, { error: "Could not read the ingredient dictionary" }, 502);
      }
    }
    if (rereadKnown !== null && gateRatio(parsed, rereadKnown) >= gateRatio(probeParsed, probeKnown)) {
      known = rereadKnown;
    } else {
      parsed = probeParsed;
    }
  }

  // The gate, run before the list goes back to be saved: a photo of a wall or
  // a receipt can clear the four-fragment floor above, and a parsed formula
  // that mostly misses the dictionary is not a rare formula, it is a bad read.
  // Same ratio, same reasoning as MIN_KNOWN_INGREDIENT_RATIO's own comment.
  if (gateRatio(parsed, known) < MIN_KNOWN_INGREDIENT_RATIO) {
    await logRead("quality_gate", { namesParsed: parsed.length, namesResolved: known.size });
    return json(
      req,
      { error: "low_confidence", found: parsed.length, recognised: known.size, rawText: text.slice(0, 400) },
      422
    );
  }

  const readNames = parsed.map((p) => p.inci_name);
  await logRead("read_ok", { namesParsed: parsed.length, namesResolved: known.size });
  return json(
    req,
    {
      ingredients: parsed,
      recognised: known.size,
      total: parsed.length,
      readToken: await signReadToken(readNames, SERVICE_ROLE_KEY),
    },
    200
  );
});

/**
 * Store a product the user has just read and named. Runs only once there is a
 * barcode, a name and an ingredient list — the three a product needs to exist.
 *
 * The list comes from the client, so it is checked again here rather than
 * trusted: normalised the same way, held to the same floor, and held to the same
 * recognised-in-the-dictionary ratio as a read.
 */
async function saveProduct(
  req: Request,
  barcode: string,
  name: string,
  brand: string | undefined,
  type: string,
  names: string[],
  readToken: string
): Promise<Response> {
  const parsed = dedupe(
    names
      .map(normalise)
      .filter((n) => n.length > 1 && n.length < 120 && /[a-z]|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/u.test(n))
      .map((inci_name, position) => ({ inci_name, position }))
  );
  if (parsed.length < MIN_INGREDIENTS) {
    return json(req, { error: "not_enough_text", found: parsed.length }, 422);
  }

  // Someone may have saved this barcode between this user's failed lookup and
  // now. Theirs stays: it is the same product, and this endpoint is
  // unauthenticated, so an existing entry must not be replaced by whoever
  // arrives next.
  const existing = await productForBarcode(barcode);
  if (existing && existing.product_ingredients.length > 0) {
    return json(
      req,
      {
        product: existing,
        recognised: existing.product_ingredients.length,
        total: existing.product_ingredients.length,
      },
      200
    );
  }

  let known: Set<string>;
  try {
    known = await knownIngredients(db, parsed.map((p) => p.inci_name));
  } catch (err) {
    console.error("knownIngredients failed:", err);
    return json(req, { error: "Could not read the ingredient dictionary" }, 502);
  }
  if (gateRatio(parsed, known) < MIN_KNOWN_INGREDIENT_RATIO) {
    return json(
      req,
      { error: "low_confidence", found: parsed.length, recognised: known.size },
      422
    );
  }

  // Every name the dictionary lacks becomes a permanent stub row, so one save
  // may only add so many (#200). `known` is verified names only; a name that
  // is already an unverified stub costs nothing new, so it isn't counted.
  let newStubs: number;
  let canonicalBrand: string;
  try {
    const unmatched = parsed.map((p) => p.inci_name).filter((n) => !known.has(n));
    const existing = await existingIngredientNames(unmatched);
    newStubs = unmatched.filter((n) => !existing.has(n)).length;
    canonicalBrand = await brandAsStored(brand);
  } catch (err) {
    console.error("save pre-checks failed:", err);
    return json(req, { error: "Could not save the product" }, 502);
  }
  if (newStubs > MAX_NEW_STUBS_PER_SAVE) {
    return json(req, { error: "too_many_new_ingredients", found: parsed.length, newIngredients: newStubs }, 422);
  }

  const product = {
    id: existing?.id ?? `ocr-${barcode}`,
    barcode,
    brand: canonicalBrand,
    name: storedText("name", name),
    // The person's own pick, when they made one (#200). A photographed
    // ingredient list gives no basis for guessing a category, so without a
    // pick it says "unknown" rather than defaulting to "serum" — the bug that
    // had a photographed foot cream displayed as one.
    type,
    area: "face",
    description: null,
    image_url: null,
    volume: null,
    in_stock: true,
    suitable_for: [],
    targets: [],
    source: "ocr",
    attribution: "Ingredients read from the product label.",
    expires_at: null,
  };

  // A read can be saved once. The signature says the list came from a read, not
  // that it is unused, so the token is recorded here, atomically: the first save
  // with it wins and any later one (a replay under another barcode, or two saves
  // racing) is refused. Just before the write, not earlier, so a save refused above
  // for its list or its barcode does not spend the token.
  const { data: consumed, error: consumeError } = await db.rpc("consume_read_token", {
    p_token: readToken,
    p_expires_at: new Date(readTokenDeadline(readToken)).toISOString(),
  });
  if (consumeError) {
    console.error("consume_read_token failed:", consumeError);
    return json(req, { error: "Could not save the product" }, 502);
  }
  if (consumed !== true) return json(req, { error: "read_expired" }, 403);

  // One RPC, one transaction: the stub ingredient rows, the product, and the
  // replacement of its formula either all commit or none do (migration 0008).
  // Every parsed name is sent, not just the ones missing from `known`: the RPC
  // inserts stubs ON CONFLICT DO NOTHING, so a name already in the dictionary
  // is left exactly as it was, and the full list is what has to drive
  // `product_ingredients` regardless.
  const { error: persistError } = await db.rpc("replace_product_with_ingredients", {
    p_product: product,
    p_ingredients: parsed,
    p_stub_note: "Read from a label, not matched to the ingredient dictionary.",
    // Leave a product that already has ingredients as it is: another person may have
    // saved this barcode since the check above, and the database serialises that race.
    p_insert_only: true,
  });
  if (persistError) {
    console.error("replace_product_with_ingredients failed:", persistError);
    // Nothing was saved, so the read is still good: give the token back so the
    // person can try again without photographing the list a second time.
    await db.rpc("release_read_token", { p_token: readToken });
    return json(req, { error: "Could not save the product" }, 502);
  }

  const { data, error: readbackError } = await db
    .from("products")
    .select(PRODUCT_SELECT)
    // By barcode, not id: when a save was refused because the barcode already had a
    // product, that product may not carry this id.
    .eq("barcode", barcode)
    .maybeSingle();
  if (readbackError || !data) {
    console.error("post-write readback failed:", readbackError);
    return json(req, { error: "Could not save the product" }, 502);
  }

  // Who added it (#241), when a signed-in person did — confirmed with Auth,
  // never read off the token on trust. Kept out of `products` itself, which
  // is public (migration 0026). First author wins: if another save of this
  // barcode landed between the check above and the write, theirs is the row
  // read back, and a guest's leaves no author row for this one to take over
  // — a narrow race, and the wrong attribution it could cause is ours to
  // see, never shown to anyone. A failed write costs the record, not the
  // save the person just made.
  const author = await signedInAccount(req, db.auth);
  if (author && data.id === product.id) {
    const { error: authorError } = await db
      .from("product_authors")
      .upsert({ product_id: data.id, user_id: author }, { onConflict: "product_id", ignoreDuplicates: true });
    if (authorError) console.error("product_authors write failed:", authorError);
  }

  return json(req, { product: data, recognised: known.size, total: parsed.length }, 200);
}

// ── OCR ─────────────────────────────────────────────────────────────────────

type OcrResult =
  | { ok: true; text: string }
  // `noText` distinguishes Vision genuinely answering "nothing here" (a
  // blank, blurred or text-free photo — an ordinary read failure, not an
  // outage) from Vision being unreachable or refusing the request. Both used
  // to collapse into the same `null`, which logged every blank photo as
  // `upstream_failure` and inflated the one bucket meant to mean "Vision
  // itself is having a bad day". Found in review on #246.
  | { ok: false; noText: boolean };

async function runOcr(imageBase64: string): Promise<OcrResult> {
  // Wrapped, where it wasn't before: an unreachable Vision (DNS, TLS, a
  // dropped connection) threw out of a bare `await fetch`, past every
  // failure this function otherwise returns for a *reachable-but-unhelpful*
  // Vision, and became an uncaught 500 with no `scan_log` row at all —
  // invisible to the very metric #236 exists to produce.
  let res: Response;
  try {
    res = await fetch(`${VISION_URL}?key=${VISION_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBase64 },
            // DOCUMENT_TEXT_DETECTION beats TEXT_DETECTION on dense small print
            // set in a block, which is exactly what an INCI panel is.
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["en", "ko", "ja"] },
          },
        ],
      }),
    });
  } catch (err) {
    console.error("Vision request failed:", err);
    return { ok: false, noText: false };
  }
  if (!res.ok) return { ok: false, noText: false };
  const body = await res.json().catch(() => null);
  // A malformed/truncated HTTP body (`body === null`) and a per-image
  // `responses[0].error` — Vision's own HTTP-200 shape for "couldn't process
  // this image" (bad or corrupted image data) — both mean Vision failed to
  // do its job, not that it looked and found nothing. Reachable from an
  // ordinary flaky upload, not just a hostile caller:
  // `stripBase64ImageMetadata` (`_shared/strip-metadata.ts`) doesn't decode
  // the entropy-coded image data, and explicitly accepts a JPEG truncated
  // with no EOI marker ("real cameras do produce truncated files"). Found in
  // review on #246 — without this, both collapsed into the same `noText`
  // outcome as a genuinely blank photo.
  if (body === null || body?.responses?.[0]?.error) return { ok: false, noText: false };
  const annotation = body.responses?.[0]?.fullTextAnnotation;
  if (!annotation) return { ok: false, noText: true };

  // Vision's own reading order, which interleaves words across line wraps on a
  // label photographed sideways: "ophiopogon" lands ten fragments from
  // "japonicus root extract", so no dictionary can rejoin them.
  //
  // Rebuilding the order from the per-word bounding boxes was tried and
  // measured, and is NOT a straight win — the note is here so it isn't retried
  // blind. Two parts worked: the direction of the text can be read reliably
  // from the vertex order Vision returns (v0 -> v1 runs along the text), and
  // following a line word-by-word rather than assuming it is straight handles
  // the curve of a round bottle. Against the ground truth for
  // obf-3337875696548 it did recover `ophiopogon japonicus root extract`,
  // `ammonium polyacryloyldimethyl taurate` and `vitreoscilla ferment`.
  //
  // But it lost more than it gained — 24 of 27 correct names fell to 20 —
  // because line ends bleed: the next line's first word sits within the
  // corridor and gets pulled in, splitting `sodium chloride`, `citric acid`
  // and `capryloyl glycine`. Fixing that needs real line segmentation, not a
  // tolerance tweak. Until then the flat text scores better.
  if (!annotation.text) return { ok: false, noText: true };
  return { ok: true, text: annotation.text };
}

const PRODUCT_SELECT = `id, barcode, brand, name, type, area, description, image_url, volume,
   price_krw, in_stock, suitable_for, targets, source, attribution, fetched_at,
   formula_changed_at,
   product_ingredients ( position, ingredients ( inci_name, comedogenic, safety, note, verified, functions ) )`;

type ExistingProduct = {
  id: string;
  brand: string;
  name: string;
  type: string;
  area: string;
  volume: string | null;
  source: string;
  attribution: string | null;
  fetched_at: string | null;
  formula_changed_at: string | null;
  product_ingredients: unknown[];
};

/** The catalogue row already holding this barcode, if any. `barcode` is UNIQUE, so at most one. */
async function productForBarcode(barcode: string): Promise<ExistingProduct | null> {
  const { data } = await db
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("barcode", barcode)
    .maybeSingle();
  return (data as ExistingProduct | null) ?? null;
}

/**
 * Which of `names` already have an `ingredients` row, verified or not — the
 * ones a save would not add as new stubs. Thrown on error for the same reason
 * as `knownIngredients` in `_shared/dictionary.ts`.
 */
async function existingIngredientNames(names: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < names.length; i += 200) {
    const { data, error } = await db.from("ingredients").select("inci_name").in("inci_name", names.slice(i, i + 200));
    if (error) throw new Error(`existingIngredientNames: ${error.message}`);
    for (const row of data ?? []) found.add(row.inci_name as string);
  }
  return found;
}

/**
 * The brand as the catalogue already spells it, so "cerave" and "CeraVe"
 * don't split one brand across Browse and search (#200). Spacing is tidied
 * first; then, among existing products whose brand matches ignoring case, the
 * most common spelling wins (imports themselves carry both "Cerave" and
 * "CeraVe"). A brand nobody has used yet is stored as typed.
 */
async function brandAsStored(brand: string | undefined): Promise<string> {
  const tidied = storedText("brand", brand ?? "");
  if (!tidied) return "Unknown";
  // Every matching row, not the first page: once a brand runs past one page,
  // an unordered subset could crown a minority spelling (#266 review).
  const rows = await paginateOrdered<{ id: string; brand: string }>(db, "products", {
    select: "id, brand",
    cursorColumn: "id",
    filter: (q) => q.ilike("brand", exactIlikePattern(tidied)),
  });
  return mostCommonSpelling(rows.map((row) => row.brand)) ?? tidied;
}

