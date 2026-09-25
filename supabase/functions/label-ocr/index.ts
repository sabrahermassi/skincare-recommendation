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
import { gateRatio } from "../_shared/gate-ratio.ts";
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


/**
 * The same plausibility floor the import scripts use before they'll write a
 * formula — `MIN_KNOWN_INGREDIENT_RATIO` in `scripts/import-obf.mjs` and
 * `scripts/import-dailymed.mjs`. Step 5's gates apply to what we import;
 * this is what applies the same bar to what our own OCR writes.
 *
 * Without it, this function committed a formula to the shared catalogue as
 * soon as OCR produced four comma-separated fragments — regardless of
 * whether any of them looked like a real ingredient. And because a barcode
 * with *any* stored formula short-circuits straight to it (see `existing`
 * in `saveProduct`), a bad first read didn't just create one bad row: it made
 * every later, better read of the same bottle return the bad formula forever.
 */
const MIN_KNOWN_INGREDIENT_RATIO = 0.6;

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
    if (ocr.noText) {
      // A blank, blurred or text-free photo is an ordinary read failure, not
      // Vision having a bad day — the same "not enough text" bucket the
      // too-few-fragments check below uses, and the same 422 shape, so the
      // client's existing handling classifies it as a photo problem rather
      // than folding it into the generic 5xx "network_error" case (#188
      // review: a 502 here was indistinguishable from a genuine upstream
      // failure, so a blank photo told the user to check their connection).
      await logRead("not_enough_text", { namesParsed: 0 });
      return json(req, { error: "not_enough_text", found: 0 }, 422);
    }
    // Vision itself failed to answer — a genuine upstream/reachability
    // problem, not the photo's fault.
    await logRead("upstream_failure", { namesParsed: 0 });
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
    aliases = await fetchAliases();
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
      dictionary = await fetchDictionary();
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
    known = await knownIngredients(parsed.map((p) => p.inci_name));
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
        rereadKnown = await knownIngredients(parsed.map((p) => p.inci_name));
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
    known = await knownIngredients(parsed.map((p) => p.inci_name));
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

// ── Parsing ─────────────────────────────────────────────────────────────────

type ParsedIngredient = { inci_name: string; position: number };

const MIN_DELIMITED_TOKENS = 4;
const MAX_WINDOW_WORDS = 6;

/**
 * Split a printed list on its separators.
 *
 * A full stop followed by a space also separates: some labels print
 * "Benzoic Acid. Caprylyl Glycol. Glycerin." with no commas at all, and read as
 * one token that was long enough to be thrown away as a sentence.
 *
 * A comma sitting directly between two digits belongs to the name, not to the
 * list: "1,2-Hexanediol" is one ingredient, and splitting there produced a bare
 * "1" and a "2-hexanediol" that matches nothing — the most common bad name in
 * the catalogue. A comma with a letter or nothing on either side is a real
 * separator, so both sides have to be checked, not just the one after — a
 * lookahead alone let "Water,4-Terpineol" fuse into one token. The check is
 * done via the match offset against the original text rather than a
 * lookbehind, which not every runtime this parser has to run on supports.
 */
export function splitOnSeparators(text: string): string[] {
  // U+E000, the first Private Use Area codepoint — never appears in printed
  // ingredient text, so it is safe as a one-character sentinel standing in
  // for a protected comma while the real separators are split on.
  const PLACEHOLDER = "";
  // A full stop inside brackets ("(Vit. E)") is part of the qualifier, not the
  // end of a name; the same length-preserving stand-in keeps the offsets below
  // valid.
  const bracketGuarded = text.replace(/\([^)]*\)/g, (group) => group.replace(/\./g, "\uE001"));
  // An abbreviation's own full stop is not a separator either: "Vit. E", or a genus
  // abbreviated at the start of an item ("C. Sinensis Leaf Extract"). A lone letter
  // after other words ("Vitamin E. Glycerin") does end a name, so only an
  // item-initial letter is protected.
  const guarded = bracketGuarded.replace(
    /(^|[;•·,.]\s*)[A-Za-z]\.(?=\s)|\b(?:vit|spp|sp|var|ssp|subsp)\.(?=\s)/gi,
    (stop: string) => stop.replace(/\.$/, "\uE001")
  );
  const protectedText = guarded.replace(/,(?=\d)/g, (match, offset: number) =>
    offset > 0 && /\d/.test(text[offset - 1]) ? PLACEHOLDER : match
  );
  return protectedText
    // U+3001, the ideographic (full-width) comma, is the separator standard
    // Japanese ingredient lists actually print ("水、グリセリン") -- the ASCII
    // comma never appears in one at all, so without this every such label
    // produced a single unsplittable block instead of real tokens.
    .split(/[;•·、]|,|\.(?=\s)/)
    .map((s) => s.replace(new RegExp(PLACEHOLDER, "g"), ",").replace(//g, "."));
}

/**
 * Ceiling on the words reconstruction will consider. Reconstruction checks
 * every window against a dictionary of tens of thousands of names with a fuzzy
 * pass behind it, so if the block boundary is ever missed and the "block"
 * becomes the whole label, the work grows with it — a real request died on this
 * function's compute limit exactly that way. No ingredient list runs this long.
 */
const MAX_RECONSTRUCTED_WORDS = 400;

/**
 * Ceiling on fuzzy-match attempts across one `reconstructFromDictionary`
 * call — bounds the same unmatched-run cost `MAX_RECONSTRUCTED_WORDS` bounds
 * for word count, since a long unmatched run can still call `fuzzyLookup`
 * many times per word without it. Kept in step with `lib/inci.ts`.
 */
const MAX_FUZZY_ATTEMPTS_PER_BLOCK = 800;

/**
 * Whether a parsed fragment can be an ingredient name at all.
 *
 * The last line of defence for text that reached the name filter without a
 * heading to strip: a label section ("package labeling: label.jpg"), a file
 * name from a mis-scanned photo, or a paragraph of marketing copy. None of
 * those is a name, and a stub written for one sits in the shared dictionary
 * until somebody deletes it by hand.
 *
 * A colon between two digits is kept — "ci 77268:1" and "pigment red 57:1" are
 * real colour-index names. Any other colon is a heading that leaked into the
 * name. Eight words clears every name a label is likely to print and stays
 * below the sentences found in the dictionary; a few dictionary entries run
 * longer (fermented extracts naming dozens of species), but a caller that
 * holds the dictionary checks it first, so a known long name never reaches this,
 * and one that does not passes `allowLong`, which skips the word limit and nothing else. An HTML entity ("&lt;") or a run of seven digits
 * (a barcode, a batch number) is packaging text that OCR or a paste carried in,
 * as is a web address or e-mail, and a fragment that opens with the word
 * "ingredients" is a footnote about the list, not a member of it.
 */
export function isPlausibleIngredientName(name: string, allowLong = false): boolean {
  if (/[:：]/.test(name.replace(/\d[:：]\d/g, ""))) return false;
  if (/\.(?:jpe?g|png|gif|webp|pdf)\b/i.test(name)) return false;
  if (/&(?:lt|gt|amp|quot|nbsp|#\d+)\b|[<>]/i.test(name)) return false;
  if (/\d{7,}/.test(name)) return false;
  if (/\bwww\.|https?:|@|\.(?:com|net|org)\b/i.test(name)) return false;
  if (/^ingr[eé]dients?\b/i.test(name)) return false;
  return allowLong || name.split(/\s+/).length <= 8;
}

/**
 * Find where the ingredient list starts without knowing the heading's language.
 *
 * Ingredient names are international — Aqua, Glycerin, Sodium Chloride read the
 * same on a French, Croatian or Romanian label — so the list can be recognised
 * by what it contains rather than by the word printed above it. Walks the text
 * one colon-delimited piece at a time and returns everything from the first
 * piece that is mostly known ingredients. `null` means there was nothing to
 * find: no colon, no piece that clears the bar, or the list already opens the
 * text, and the caller's heading pattern stays in charge. A piece that holds
 * some known ingredients but not enough is part of the list, cut by a stray
 * colon in a garbled scan, not a heading — skipping it would drop the start of
 * the formula, so the search stops there instead.
 *
 * Everything after the chosen piece is kept, so a colon inside the list itself
 * ("Parfum (Fragrance: Linalool, Limonene)") cannot cut it short. A colon
 * directly before a digit is part of a name ("ci 77268:1"), not a heading.
 */
export function findListByDictionary(flat: string, dictionary: ReadonlySet<string>, aliases?: ReadonlyMap<string, string>): string | null {
  const colon = /[:：](?!\d)/g;
  let start = 0;
  for (;;) {
    const match = colon.exec(flat);
    const names = flat.slice(start, match ? match.index : flat.length).split(/[;•·,]/)
      .map(normalise)
      .filter((n) => n.length > 1);
    const known = names.filter((n) => dictionary.has(n) || aliases?.has(n)).length;
    if (known >= 3 && known / names.length >= 0.5) return start === 0 ? null : flat.slice(start);
    if (known > 0 || !match) return null;
    start = match.index + match[0].length;
  }
}

/**
 * Dictionary names indexed two ways for the delimited path, built once per
 * dictionary. A `WeakMap` keyed on the set itself: an importer reads the
 * dictionary once and parses hundreds of products against it, and an Edge
 * Function request builds its own set, so neither pays twice.
 */
const squashIndexCache = new WeakMap<ReadonlySet<string>, Map<string, string[]>>();
const lengthIndexCache = new WeakMap<ReadonlySet<string>, Map<number, string[]>>();

/**
 * A name reduced to its letters and digits: "methyl styrene", "methylstyrene"
 * and "methyl-styrene" are one key. Labels and the dictionary disagree about
 * spaces and punctuation far more often than about spelling, and digits stay
 * in the key so "peg-4" and "peg-40" can never meet.
 *
 * CJK characters are kept alongside `[a-z0-9]` rather than stripped with
 * everything else (#185; found in review on #247): stripping them collapsed
 * every pure-Hangul/kana/Han string to the same empty key, so once real
 * Korean/Japanese synonyms exist in the dictionary (the point of #185),
 * `squashIndex`'s `""` bucket would hold all of them together regardless of
 * content, and `resolveKnownName`'s fuzzy tie-break would pick the nearest
 * one across that whole undifferentiated bucket instead of narrowing to
 * same-content candidates the way a Latin name already does.
 */
export function squashKey(name: string): string {
  return name.replace(/[^a-z0-9\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu, "");
}

export function squashIndex(dictionary: ReadonlySet<string>): Map<string, string[]> {
  const cached = squashIndexCache.get(dictionary);
  if (cached) return cached;
  const index = new Map();
  for (const entry of dictionary) {
    const key = squashKey(entry);
    const bucket = index.get(key);
    if (bucket) bucket.push(entry);
    else index.set(key, [entry]);
  }
  squashIndexCache.set(dictionary, index);
  return index;
}

export function lengthIndex(dictionary: ReadonlySet<string>): Map<number, string[]> {
  const cached = lengthIndexCache.get(dictionary);
  if (cached) return cached;
  const index = new Map();
  for (const entry of dictionary) {
    const bucket = index.get(entry.length);
    if (bucket) bucket.push(entry);
    else index.set(entry.length, [entry]);
  }
  lengthIndexCache.set(dictionary, index);
  return index;
}

const COMMON_NAMES = new Map([
  ["flavor", "aroma"],
  ["flavour", "aroma"],
  ["perfume", "parfum"],
  ["fragrance", "parfum"],
  ["purified water", "aqua"],
  ["deionized water", "aqua"],
  ["demineralized water", "aqua"],
  ["distilled water", "aqua"],
  ["glycerine", "glycerin"],
  ["glycerol", "glycerin"],
  ["petroleum jelly", "petrolatum"],
  ["mineral oil", "paraffinum liquidum"],
  ["jojoba oil", "simmondsia chinensis seed oil"],
  ["jojoba seed oil", "simmondsia chinensis seed oil"],
  ["apricot kernel oil", "prunus armeniaca kernel oil"],
  ["evening primrose oil", "oenothera biennis oil"],
  ["argan oil", "argania spinosa kernel oil"],
  ["argan kernel oil", "argania spinosa kernel oil"],
  ["olive oil", "olea europaea fruit oil"],
  ["olive fruit oil", "olea europaea fruit oil"],
  ["rosehip oil", "rosa canina fruit oil"],
  ["rosehip fruit extract", "rosa canina fruit extract"],
  ["mango fruit extract", "mangifera indica fruit extract"],
  ["mango butter", "mangifera indica seed butter"],
  ["shea butter", "butyrospermum parkii butter"],
  ["coconut oil", "cocos nucifera oil"],
  ["sweet almond oil", "prunus amygdalus dulcis oil"],
  ["almond oil", "prunus amygdalus dulcis oil"],
  ["avocado oil", "persea gratissima oil"],
  ["castor oil", "ricinus communis seed oil"],
  ["grapeseed oil", "vitis vinifera seed oil"],
  ["grape seed oil", "vitis vinifera seed oil"],
  ["sunflower oil", "helianthus annuus seed oil"],
  ["sunflower seed oil", "helianthus annuus seed oil"],
  ["tea tree oil", "melaleuca alternifolia leaf oil"],
  ["lavender oil", "lavandula angustifolia oil"],
  ["candelilla wax", "euphorbia cerifera cera"],
  ["euphorbia cerifera wax", "euphorbia cerifera cera"],
  ["carnauba wax", "copernicia cerifera cera"],
  ["kojic acid dipalmitate", "kojic dipalmitate"],
  ["octyl salicylate", "ethylhexyl salicylate"],
  ["octyl methoxycinnamate", "ethylhexyl methoxycinnamate"],
  ["vitamin e", "tocopherol"],
  ["vitamin e acetate", "tocopheryl acetate"],
  ["vitamin c", "ascorbic acid"],
  ["vitamin b5", "panthenol"],
]);

const SYNONYM_GROUPS = [
  ["aqua", "water", "eau", "ater", "agua"],
  ["parfum", "fragrance"],
  ["ci 77891", "titanium dioxide"],
];

/**
 * What labels print in place of the INCI name, for the ordinary ingredients
 * people name by their common name: "jojoba seed oil" is
 * `simmondsia chinensis seed oil`, "flavor" is `aroma`. The dictionary is keyed
 * on INCI, so none of these matches as written, and they are the largest group
 * of misses that are not spelling.
 *
 * Only unambiguous ones. "Iron oxides" is three different colour indexes and
 * "citrus aurantium peel oil" is two different oranges, so neither is here — a
 * wrong mapping attaches another ingredient's safety note, which is worse than
 * a miss. The caller checks the target is in the dictionary, so an entry whose
 * target is absent does nothing.
 */
export function commonNameFor(name: string): string | undefined {
  return COMMON_NAMES.get(name);
}

/**
 * Map a delimited name the dictionary does not hold to the one it does.
 *
 * `matchWindow` already knows two printed-label habits, but only runs when the
 * list had no delimiters at all. A list split cleanly on commas skipped both,
 * so "aqua/water/eau" and "gly cerin" reached the dictionary as-is and missed.
 * In order, and each only when the one before found nothing:
 *
 *  - a British spelling: "sulphate" is `sulfate`;
 *  - a common name from `commonNameFor`;
 *  - the same letters and digits under different spacing or punctuation
 *    ("gly cerin", "methylstyrene" for `methyl styrene`, "acryloyldimethyl
 *    taurate" for `acryloyldimethyltaurate`) — through `squashIndex`, so it is
 *    one lookup, and when the dictionary holds the name more than once the one
 *    fewest edits from what was printed wins;
 *  - a unit annotation ("homosalate w/w") or an unclosed bracket ("aqua
 *    (water"): both are dropped from the end of the name;
 *  - "/" separating names for ONE ingredient: "aqua/water/eau" is aqua, and
 *    "iron oxides/ci 77491" is ci 77491. One part must be a known name or an
 *    alias, and each other part a known name, an alias, or a single word. A
 *    last part ending in polymer, resin or esters is held to that bar strictly,
 *    because those are the single real names that merely contain a
 *    slash ("hydroxyethyl acrylate/sodium acryloyldimethyl taurate
 *    copolymer"); anywhere else an unfamiliar translated part ("huile
 *    minerale") is fine, since the list was already split on commas and there is
 *    nothing after the slash to swallow.
 *
 * A name already in the dictionary, or matching none of these, comes back
 * unchanged.
 */
export function resolveKnownName(name: string, dictionary: ReadonlySet<string>, aliases?: ReadonlyMap<string, string>): string {
  if (dictionary.has(name)) return name;
  // A unit the label printed after the name ("homosalate w/w"), then a bracket
  // it never closed ("aqua (water"): normalise only removes a matched pair, so
  // the open half is still on the end of the name.
  const base = name
    .replace(/\s+w\/[wv]$/, "")
    .replace(/\s*\d+(?:[.,]\d+)?\s*(?:mg|g|ml|%)(?:\s*\/\s*(?:\d+\s*)?(?:mg|g|ml))?$/, "")
    .replace(/\s*\(.*$/, "")
    .replace(/\)+$/, "");
  if (base !== name && dictionary.has(base)) return base;
  const spelled = base.replace(/sulph/g, "sulf");
  if (dictionary.has(spelled)) return spelled;
  const common = commonNameFor(spelled);
  if (common && dictionary.has(common)) return common;
  const squashed = squashIndex(dictionary).get(squashKey(spelled));
  if (squashed) {
    let best = squashed[0];
    for (const candidate of squashed) {
      if (levenshtein(candidate, name, 99) < levenshtein(best, name, 99)) best = candidate;
    }
    return best;
  }
  if (base.includes("/")) {
    const parts = base.split("/").map(normalise);
    // A common name whose target the dictionary holds counts as known too, or
    // "aqua / petroleum jelly" would fold into aqua and lose the petrolatum.
    const isKnown = (part: string) => dictionary.has(part) || (aliases?.has(part) ?? false) || dictionary.has(commonNameFor(part) ?? "");
    const anchor = parts.find(isKnown);
    const strict = /(?:polymer|resin|esters?)$/.test(parts[parts.length - 1]);
    // A known part folds into the anchor only when it names the same ingredient
    // ("aqua/water"); "aqua / glycerin" is two ingredients and stays as it is.
    const canonical = (part: string) => aliases?.get(part) ?? commonNameFor(part) ?? part;
    const anchorName = canonical(anchor ?? "");
    const sameIngredient = (part: string) =>
      canonical(part) === anchorName || SYNONYM_GROUPS.some((group) => group.includes(canonical(part)) && group.includes(anchorName));
    const restIsPlausible = parts.every(
      (part) => part === anchor || (part.length > 1 && (isKnown(part) ? sameIngredient(part) : !part.includes(" ") || !strict))
    );
    if (parts.length > 1 && anchor && restIsPlausible) return dictionary.has(anchor) ? anchor : canonical(anchor);
  }
  return name;
}

/**
 * A token that lists several ingredients with a slash where a comma belongs:
 * "aqua / glycerin". Returned as its separate names when every part is a known
 * name or an alias of one, and the token as it was otherwise. It runs only after
 * `resolveKnownName` has left the token alone, so parts that name one ingredient
 * ("aqua/water") were already folded into it and never get here.
 */
export function splitSlashList(name: string, dictionary: ReadonlySet<string>, aliases?: ReadonlyMap<string, string>): string[] {
  if (!name.includes("/")) return [name];
  const parts = name.split("/").map(normalise).filter((part: string) => part.length > 1);
  if (parts.length < 2) return [name];
  const resolved: string[] = [];
  for (const part of parts) {
    const target = dictionary.has(part) ? part : (aliases?.get(part) ?? commonNameFor(part));
    if (target === undefined || !dictionary.has(target)) return [name];
    resolved.push(target);
  }
  return resolved;
}

/**
 * Split a token that is really two or more ingredients with the comma missing.
 *
 * "caprylyl glycol isohexadecane" and "camellia sinensis leaf extract arnica
 * montana flower extract" are printed with a gap where a comma belongs, and
 * each was being stored as one long junk name — 'caprylyl glycol
 * isohexadecane' is in the live dictionary as an unverified stub. Greedy,
 * longest known name first, and only when every word lands in a known name: one
 * leftover word means the token is not a run-together list, so it is returned
 * whole rather than guessed at.
 */
export function splitRunTogether(name: string, dictionary: ReadonlySet<string>): string[] {
  const words = name.split(" ");
  if (words.length < 2 || words.length > 12) return [name];
  const pieces = [];
  let i = 0;
  while (i < words.length) {
    let span = Math.min(6, words.length - i);
    while (span > 0 && !dictionary.has(words.slice(i, i + span).join(" "))) span--;
    if (span === 0) return [name];
    pieces.push(words.slice(i, i + span).join(" "));
    i += span;
  }
  return pieces.length > 1 ? pieces : [name];
}

/**
 * Correct a one-letter typo in a long name: "helianthus annus seed oil" for
 * `helianthus annuus seed oil`, "potassium cetyl phospate".
 *
 * Deliberately much tighter than the fuzzy match the no-delimiter path uses,
 * because that one is repairing OCR noise and this one is reading typed text. A
 * name must be at least 16 characters, sit exactly one edit from a single
 * unambiguous dictionary name, and carry the same digits — methylparaben and
 * ethylparaben are one edit apart, and so are polyquaternium-10 and -11, and
 * each is a different ingredient with a different safety note.
 */
export function fuzzyKnownName(name: string, dictionary: ReadonlySet<string>, attempts: { remaining: number }): string {
  if (name.length < 16) return name;
  const found = fuzzyLookup(name, lengthIndex(dictionary), attempts);
  if (!found || levenshtein(name, found, 1) > 1) return name;
  return name.replace(/\D/g, "") === found.replace(/\D/g, "") ? found : name;
}

/**
 * Recover the real ingredient from a fragment that is not a name on its own.
 *
 * The name check rejects "sodium sulfate: ci 12490" and "preservatives: benzyl
 * alcohol" because of the colon, but each holds a genuine ingredient that used
 * to be thrown away with the junk around it. Two shapes, and only these two:
 *
 *  - a colon-separated piece that is a known name in its own right, so both
 *    halves of "sodium sulfate: ci 12490" are kept;
 *  - a known name behind leading junk — a batch number ("2050519 10 -
 *    aqua/water") or heading text in other scripts ("ingrédients/ingredientes/
 *    sastojci helianthus annuus seed oil"). A word is skipped only if it has no
 *    letters, is non-ASCII, or is a slash-joined stack of heading words
 *    ("ingredientes/sastojci"); ordinary words never are, so "free from alcohol"
 *    does not become "alcohol", and a real slash name that the dictionary lacks
 *    ("peg/ppg-18/18 dimethicone") is not reduced to its last word.
 *
 * Nothing found returns an empty list. It is tried on every name the
 * dictionary does not hold, not only the ones the name check refuses, because
 * a fragment can pass that check and still carry junk in front of a real name.
 */
export function salvageKnownNames(name: string, dictionary: ReadonlySet<string>, aliases?: ReadonlyMap<string, string>): string[] {
  const found = [];
  for (const piece of name.split(/[:：]/)) {
    const words = normalise(piece).split(" ");
    for (let start = 0; start < words.length; start++) {
      const resolved = resolveKnownName(words.slice(start).join(" "), dictionary, aliases);
      if (dictionary.has(resolved)) {
        found.push(resolved);
        break;
      }
      if (!/^[^a-z]*$|[^\x00-\x7f]|(?=.*\/)(?:ingr[eé]dient|sastojci|sestavine|composition|zutaten|inhaltsstoffe)/.test(words[start])) break;
    }
  }
  return found;
}

/**
 * Pull the INCI list out of whatever else the OCR picked up.
 *
 * Real label photos capture claims, directions and barcodes alongside the
 * formula, so this first tries to isolate the block after an "Ingredients:"
 * heading, and only falls back to the whole text when there isn't one.
 *
 * `dictionary`, when supplied, backstops the delimiter split for labels
 * whose bullet separators (•) are small or low-contrast enough that Vision
 * doesn't detect them as characters at all — confirmed against a real photo,
 * not a hypothetical: the ingredients came back as one undifferentiated run
 * of words with no punctuation whatsoever to split on. Kept in step with
 * `lib/inci.ts`, the version under test — see that file for the same logic
 * annotated in more detail.
 */
export function parseIngredientBlock(
  text: string,
  dictionary?: ReadonlySet<string>,
  aliases?: ReadonlyMap<string, string>
): ParsedIngredient[] {
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ").replace(/\b(?:inactive ingredients?|may contain|peu(?:t|vent) contenir|puede contener|kann enthalten)\s*[:：]?\s*/gi, ", ");

  const heading = /(?:ingr[eé]dient(?:s|es|e|i)?|sastojci|composition|composição|zutaten|inhaltsstoffe)\s*[:：]\s*|(?:\bingredients?\b|전성분|성분|全成分)\s*[:：]?\s*/i.exec(flat);
  let block = heading ? flat.slice(heading.index + heading[0].length) : flat;

  // With a dictionary the heading's language stops mattering: the list is
  // wherever the known ingredients are. The heading pattern above stays as the
  // fallback for when nothing clears the bar, or no dictionary was supplied.
  const listed = dictionary ? findListByDictionary(flat, dictionary, aliases) : null;
  if (listed) block = listed;

  // Directions/cautions are the common case, but a photo also catches
  // whatever else shares the back of the label — the net-quantity mark (the
  // "e" symbol EU packaging prints beside a volume) and distributor/legal
  // boilerplate reliably sit right after the formula, and left in, both
  // degrade to junk fragments that dilute the recognised-ingredient ratio
  // enough to sink the verdict below "unknown" even when the OCR read was
  // otherwise clean.
  const stop =
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법|\b(?:e\s*)?\d{2,4}\s*(?:ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b|\bstorage\b)/i.exec(
      block
    );
  if (stop) block = block.slice(0, stop.index);

  // Aliases resolve on the delimited path too, not only in reconstruction:
  // a bilingual label lists its French names comma-separated like any other,
  // so `glycérine` arrives here already well-formed and merely under the
  // wrong name.
  const canonical = (name: string) => aliases?.get(name) ?? name;

  const fuzzyAttempts = { remaining: MAX_FUZZY_ATTEMPTS_PER_BLOCK };
  const delimited = splitOnSeparators(block)
    .map(normalise)
    .filter((n) => n.length > 1 && n.length < 120 && /[a-z]|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/u.test(n))
    .flatMap((name) => {
      const resolved = canonical(name);
      // Without a dictionary a long real name cannot be recognised as known, so it is
      // exempt from the word limit only; every other check still reads the whole name.
      if (!dictionary) return isPlausibleIngredientName(resolved, true) ? [resolved] : [];
      const known = resolveKnownName(resolved, dictionary, aliases);
      if (dictionary.has(known)) return [known];
      const listed = splitSlashList(known, dictionary, aliases);
      if (listed.length > 1) return listed;
      const salvaged = salvageKnownNames(known, dictionary, aliases);
      if (salvaged.length > 0) return salvaged;
      if (!isPlausibleIngredientName(known)) return [];
      const pieces = splitRunTogether(known, dictionary);
      return pieces.length > 1 ? pieces : [fuzzyKnownName(known, dictionary, fuzzyAttempts)];
    })
    .map((inci_name, position) => ({ inci_name, position }));

  if (delimited.length >= MIN_DELIMITED_TOKENS || !dictionary) return dedupe(delimited);

  const words = block.split(/\s+/).filter(Boolean).slice(0, MAX_RECONSTRUCTED_WORDS);
  return dedupe(
    reconstructFromDictionary(words, dictionary)
      .filter((p) => isPlausibleIngredientName(p.inci_name))
      .map((p) => ({ ...p, inci_name: canonical(p.inci_name) }))
  );
}

/**
 * `product_ingredients` is keyed on (product_id, position), not inci_name —
 * nothing stops two rows naming the same ingredient. Two different
 * multi-word ingredients that both fail to match the dictionary can degrade
 * to the same bare leftover word (two different oils both landing on
 * "oil"), and the client keys rows by inci_name, so a genuine duplicate
 * crashes into a React key collision there. First occurrence wins.
 */
function dedupe(parsed: ParsedIngredient[]): ParsedIngredient[] {
  const seen = new Set<string>();
  const out: ParsedIngredient[] = [];
  for (const p of parsed) {
    if (seen.has(p.inci_name)) continue;
    seen.add(p.inci_name);
    out.push({ inci_name: p.inci_name, position: out.length });
  }
  return out;
}

/** Same normalisation as the import scripts, or the dictionary cannot match. */
function normalise(raw: string): string {
  return raw
    // Full-width Latin/digits/punctuation (a common OCR read on a Japanese
    // label, e.g. "ＰＥＧ－４０") are Script=Common, not Latin or one of the
    // CJK scripts below, so the trim at the end stripped them as decoration
    // rather than keeping them as the name they are. NFKC folds them to
    // their standard-width equivalents first, matching how the dictionary
    // itself is spelled.
    .normalize("NFKC")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    // U+30FC, the katakana-hiragana prolongation mark ("ー" in "ポリマー"),
    // is Script=Common rather than Katakana, so it needs to be named
    // explicitly to survive the trim below the same way the four CJK
    // scripts do.
    .replace(/^[^a-z0-9\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]+|[^a-z0-9)\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]+$/gu, "");
}

/** Bounded edit distance — returns early once the result is certain to exceed `max`. */
function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Zero below `MIN_FUZZY_LENGTH`: within one edit of a short fragment sits half
 * the dictionary, so "oil", "code" and "fll" would each resolve to some real
 * ingredient. A fabricated match is worse than an unrecognised one.
 */
const MIN_FUZZY_LENGTH = 8;

function fuzzyBudget(length: number): number {
  if (length < MIN_FUZZY_LENGTH) return 0;
  return length <= 15 ? 1 : 2;
}

/**
 * Closest dictionary entry within the edit budget, or null.
 *
 * A tie is refused rather than broken: two different names equally close means
 * nothing in the text says which was printed, and picking either invents an
 * ingredient. Kept in step with `lib/inci.ts`.
 */
function fuzzyLookup(
  candidate: string,
  byLength: Map<number, string[]>,
  attempts: { remaining: number }
): string | null {
  if (attempts.remaining <= 0) return null;
  attempts.remaining -= 1;

  const budget = fuzzyBudget(candidate.length);
  if (budget === 0) return null;

  let best: string | null = null;
  let bestDist = budget + 1;
  let ambiguous = false;
  for (let len = candidate.length - budget; len <= candidate.length + budget; len++) {
    for (const entry of byLength.get(len) ?? []) {
      const dist = levenshtein(candidate, entry, budget);
      if (dist === 0) return entry;
      if (dist < bestDist) {
        best = entry;
        bestDist = dist;
        ambiguous = false;
      } else if (dist === bestDist && entry !== best) {
        ambiguous = true;
      }
    }
  }
  return ambiguous ? null : best;
}

/**
 * Resolve one window of words to a dictionary name, or null. Tries the words
 * as written, the words with spaces removed (OCR splits a printed word across
 * a line-wrap), and either side of a slash — on a label "/" separates two
 * names for ONE ingredient ("Aqua/Water"), so the canonical first name wins.
 * The slash case is strict: every later part must itself be a known name or a
 * single word, or a long window would swallow whatever followed the slash.
 * Kept in step with `lib/inci.ts`, the version under test.
 */
function matchWindow(
  window: string[],
  dictionary: ReadonlySet<string>,
  byLength: Map<number, string[]>,
  fuzzy: boolean,
  attempts: { remaining: number }
): string | null {
  const lookup = (value: string): string | null => {
    if (value.length <= 1) return null;
    if (dictionary.has(value)) return value;
    return fuzzy ? fuzzyLookup(value, byLength, attempts) : null;
  };

  const spaced = normalise(window.join(" "));
  const direct = lookup(spaced);
  if (direct) return direct;

  if (window.length > 1) {
    const joined = lookup(normalise(window.join("")));
    if (joined) return joined;
  }

  if (spaced.includes("/")) {
    const parts = spaced.split("/").map((part) => normalise(part));
    const head = parts[0] ? lookup(parts[0]) : null;
    // Exact-only for the trailing annotation, deliberately: allowing it to
    // match approximately let "…butter/shea butter glycerin" through as one
    // ingredient, eating the glycerin that followed it.
    const restIsPlausible = parts
      .slice(1)
      .every((part) => part.length > 1 && (dictionary.has(part) || !part.includes(" ")));
    if (head && parts.length > 1 && restIsPlausible) return head;
  }

  return null;
}

/**
 * Reconstruct ingredient boundaries from a run of words with no delimiters at
 * all, greedily matching the longest known dictionary name at each position.
 * Exact matches are exhausted at every window length before any fuzzy match is
 * considered at any length.
 */
function reconstructFromDictionary(
  words: string[],
  dictionary: ReadonlySet<string>
): ParsedIngredient[] {
  const byLength = new Map<number, string[]>();
  for (const entry of dictionary) {
    const bucket = byLength.get(entry.length);
    if (bucket) bucket.push(entry);
    else byLength.set(entry.length, [entry]);
  }

  const out: ParsedIngredient[] = [];
  const fuzzyAttempts = { remaining: MAX_FUZZY_ATTEMPTS_PER_BLOCK };
  let i = 0;

  while (i < words.length) {
    let matched: { name: string; consumed: number } | null = null;
    const maxSpan = Math.min(MAX_WINDOW_WORDS, words.length - i);

    for (const fuzzy of [false, true]) {
      for (let span = maxSpan; span >= 1 && !matched; span--) {
        const name = matchWindow(words.slice(i, i + span), dictionary, byLength, fuzzy, fuzzyAttempts);
        if (name) matched = { name, consumed: span };
      }
      if (matched) break;
    }

    if (!matched) matched = { name: normalise(words[i]), consumed: 1 };

    if (matched.name.length > 1) {
      out.push({ inci_name: matched.name, position: out.length });
    }
    i += matched.consumed;
  }

  return out;
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
 * Known ingredient names, for reconstructing an undelimited OCR block.
 *
 * `verified` only, and that restriction is load-bearing. Every fragment this
 * function fails to match is written back as an unverified row so that
 * `product_ingredients` has a foreign key to point at — "code", "fll", "8az",
 * "aqua/water". Reading those back in would let one bad read teach the next
 * one: run two matches "aqua/water" against the junk row run one created, and
 * the wrong segmentation becomes permanent. Only the imported taxonomy
 * (`source = 'obf'`) is trusted to define what an ingredient is.
 */
async function fetchDictionary(): Promise<Set<string>> {
  const rows = await paginateOrdered<{ inci_name: string }>(db, "ingredients", {
    select: "inci_name",
    cursorColumn: "inci_name",
    filter: (q) => q.eq("verified", true),
  });
  return new Set(rows.map((row) => row.inci_name));
}

/**
 * Other names for ingredients we already hold, mapped to the canonical one —
 * the French half of a bilingual label, or a trivial name like "mineral oil"
 * where INCI says "paraffinum liquidum". Matched exactly like a real name,
 * then rewritten to what the dictionary is keyed on.
 */
async function fetchAliases(): Promise<Map<string, string>> {
  const rows = await paginateOrdered<{ synonym: string; inci_name: string }>(
    db,
    "ingredient_synonyms",
    { select: "synonym, inci_name", cursorColumn: "synonym" }
  );
  return new Map(rows.map((row) => [row.synonym, row.inci_name]));
}

/**
 * Which of `names` already have an `ingredients` row, verified or not — the
 * ones a save would not add as new stubs. Thrown on error for the same reason
 * as `knownIngredients` below.
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

async function knownIngredients(names: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < names.length; i += 200) {
    const { data, error } = await db
      .from("ingredients")
      .select("inci_name")
      .eq("verified", true)
      .in("inci_name", names.slice(i, i + 200));
    // Thrown, not swallowed: the plausibility gate below reads `found.size`
    // as "how much of this photo did we recognise", and a query that failed
    // partway through is indistinguishable from one that recognised nothing
    // — a transient DB error would otherwise read as a bad photo and tell
    // the user to retake it, which is the wrong failure entirely.
    if (error) throw new Error(`knownIngredients: ${error.message}`);
    for (const row of data ?? []) found.add(row.inci_name as string);
  }
  return found;
}

