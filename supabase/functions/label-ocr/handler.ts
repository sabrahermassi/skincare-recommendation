// Read an ingredient list off a photographed label and hand it back; nothing
// is stored. It used to have a second call that saved the list under a barcode
// and a name, so the catalogue grew from use; that is switched off (#374), since
// the app no longer adds products, and what only it used goes in #377.
//
// This is the tier that makes a scan-first app viable. Open Beauty Facts holds
// 37 products tagged South Korea; Olive Young alone lists over 10,000 SKUs. No
// barcode database will close that gap — but the formula is printed on the box
// in the user's hand, and reading it works on any product, any brand, any
// country.
//
// The decisions live here, kept free of `Deno.env` and of a real database
// client so they can be tested with fakes (supabase/tests/label_ocr.test.ts,
// #203); `index.ts` supplies the real dependencies.
//
// Google Cloud Vision rather than on-device ML Kit: every on-device OCR
// option is a native module, and a native module needs a development build,
// which this project does not use. That trade-off — a third-party trust
// boundary in exchange for staying on Expo Go — is recorded, with its
// revisit trigger, in docs/threat-model.md's "Backend <-> Google Vision"
// section. Do not re-derive it here; that doc is the one to update if the
// calculus changes. The key stays here, never in the bundle.

import {
  json,
  preflight,
  enforceRateLimit,
  callerSalt,
  type RateLimit,
} from "../_shared/http.ts";
import { fetchAliases, fetchDictionary, knownIngredients } from "../_shared/dictionary.ts";
import { MIN_KNOWN_INGREDIENT_RATIO, gateRatio } from "../_shared/gate-ratio.ts";
import { parseIngredientBlock } from "../_shared/inci-parse.ts";
import { MAX_IMAGE_CHARS } from "../_shared/image-limits.ts";
import { spendVisionRead } from "../_shared/vision-ceiling.ts";
import { signReadToken } from "../_shared/read-token.ts";
import { logScanBounded, type ScanOutcome } from "../_shared/scan-log.ts";
import { stripBase64ImageMetadata } from "../_shared/strip-metadata.ts";

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

/**
 * How long a photo read waits on Vision (#198). Well inside the app's own
 * 45 s (`OCR_TIMEOUT_MS`), so the function answers before the app gives up
 * rather than carrying on after nobody is waiting.
 */
export const VISION_TIMEOUT_MS = 25_000;

/**
 * How many times one photo is put to Vision. Vision refuses the odd read and
 * then takes the same photo a minute later (seen on staging, 1 October 2026),
 * and without a second try each of those was a failed scan for the person
 * holding the bottle. The second try is a Vision call like any other, so it
 * counts toward the daily ceiling too, and isn't made once the day is spent.
 */
export const VISION_ATTEMPTS = 2;
const VISION_RETRY_PAUSE_MS = 250;

/** Generous for a person in a shop, useless for anyone burning the free tier. */
const RATE_LIMIT: RateLimit = { windowSeconds: 300, maxRequests: 10 };



/** Four is the floor the verdict engine itself needs before it will produce a number. */
const MIN_INGREDIENTS = 4;

/**
 * Ceiling on the raw request body, checked against Content-Length before the
 * body is read at all. Sized as `MAX_IMAGE_CHARS` plus room for the JSON
 * envelope and the optional barcode/name/brand fields, so it never rejects a
 * request the image check would have accepted.
 */
const MAX_BODY_BYTES = MAX_IMAGE_CHARS + 64 * 1024;

/**
 * The service-role client, typed loosely for the same reason as `DictionaryDb`:
 * the real one is supabase-js, and the tests pass a fake with the same shape.
 */
// deno-lint-ignore no-explicit-any
export type LabelOcrDb = any;

export type LabelOcrDeps = {
  db: LabelOcrDb;
  /** Reaches Google Cloud Vision. */
  fetch: typeof fetch;
  /** Empty when Vision is not configured: a read is then refused with 503, and logged. */
  visionApiKey: string;
  /** Signs and verifies read tokens (`_shared/read-token.ts`). */
  readTokenSecret: string;
  /** Vision reads allowed per UTC day across every caller (#198); see `vision-ceiling.ts`. */
  visionDailyCeiling: number;
};

export async function handleLabelOcr(req: Request, deps: LabelOcrDeps): Promise<Response> {
  const { db } = deps;
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

  // A request carrying a list rather than a photo is the old save call (#374).
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

  // Saving a product from a read is switched off (#374). The app no longer
  // adds products, so nothing legitimate calls it, and left open it let anyone
  // with the public key write to the catalogue. What only it used on the
  // server (the read token and its tables) goes in #377.
  if (saving) return json(req, { error: "saving_disabled" }, 410);

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
  if (!deps.visionApiKey) {
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

  // Last, just before the paid call, so only a photo that will really reach
  // Vision counts toward the day. Per-caller limits run above; this is the
  // ceiling for everyone together, so rotating addresses can't run up the
  // bill (#198). 503, like a missing key: the app says to try again later.
  // Logged like the missing key too, as ours: a day of refused reads must
  // show in `scan_log`, not vanish from it.
  if (!(await spendVisionRead(db, deps.visionDailyCeiling))) {
    await logRead("internal_error");
    return json(req, { error: "daily_limit" }, 503, { "Retry-After": String(secondsUntilUtcMidnight()) });
  }

  const ocr = await runOcr(deps, imageBase64, () => spendVisionRead(db, deps.visionDailyCeiling));
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

  // Aliases (~25k synonyms) are needed on every path, so they are fetched
  // unconditionally; the function instance keeps them for a few minutes
  // (`_shared/dictionary.ts`). The dictionary is tens of thousands of rows and
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
    // The text Vision read is not sent back: nothing in the app uses it, and
    // it is text from someone's photo (#198).
    return json(req, { error: "not_enough_text", found: parsed.length }, 422);
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
  //
  // A name the label broke across two lines is the other moment: "niacin-" at
  // the end of one line and "amide" at the start of the next come back as
  // "niacin- amide", and the rest of the list can clear the gate without it.
  // Only the dictionary can tell that one from "beta-" / "glucan".
  const brokenName = parsed.some((p) => !known.has(p.inci_name) && brokenAcrossLines(text, p.inci_name));
  if (!readWithDictionary && (brokenName || gateRatio(parsed, known) < MIN_KNOWN_INGREDIENT_RATIO)) {
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
    return json(req, { error: "low_confidence", found: parsed.length, recognised: known.size }, 422);
  }

  const readNames = parsed.map((p) => p.inci_name);
  await logRead("read_ok", { namesParsed: parsed.length, namesResolved: known.size });
  return json(
    req,
    {
      ingredients: parsed,
      recognised: known.size,
      total: parsed.length,
      readToken: await signReadToken(readNames, deps.readTokenSecret),
    },
    200
  );
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

/** Vision's reply as parsed JSON; null when the body wasn't JSON at all. */
// deno-lint-ignore no-explicit-any
type VisionBody = any;

type VisionAnswer =
  | { ok: true; body: VisionBody }
  // `retry`: worth asking again, because the same photo can pass a moment
  // later. Not for a request Vision calls wrong (a 4xx: a bad key, billing
  // off), where a second try only repeats the refusal.
  | { ok: false; retry: boolean; why: string };

/** One request to Vision, and whether its answer is usable. */
async function askVision(deps: LabelOcrDeps, imageBase64: string, signal: AbortSignal): Promise<VisionAnswer> {
  // Wrapped, where it wasn't before: an unreachable Vision (DNS, TLS, a
  // dropped connection) threw out of a bare `await fetch`, past every
  // failure this function otherwise returns for a *reachable-but-unhelpful*
  // Vision, and became an uncaught 500 with no `scan_log` row at all —
  // invisible to the very metric #236 exists to produce.
  let res: Response;
  try {
    // The key goes in a header, not the URL, so it can't end up in an error
    // message or a proxy's request log (#198).
    res = await deps.fetch(VISION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": deps.visionApiKey },
      signal,
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
    return { ok: false, retry: true, why: `request failed: ${err}` };
  }
  const body: VisionBody = await res.json().catch(() => null);
  if (!res.ok) {
    const retry = res.status >= 500 || res.status === 429 || res.status === 408;
    return { ok: false, retry, why: `HTTP ${res.status} ${body?.error?.status ?? ""} ${body?.error?.message ?? ""}`.trim() };
  }
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
  if (body === null) {
    // A deadline that lands mid-reply looks like a broken body from here; say
    // which it was, since this line is all there is to go on afterwards.
    const why = signal.aborted ? "the deadline passed while Vision was still answering" : "HTTP 200 with a body that isn't JSON";
    return { ok: false, retry: true, why };
  }
  const imageError = body.responses?.[0]?.error;
  if (imageError) {
    return { ok: false, retry: true, why: `image error ${imageError.code ?? ""} ${imageError.message ?? ""}`.trim() };
  }
  return { ok: true, body };
}

/**
 * `spendRetry` counts a second try against the daily ceiling and says whether
 * the day still has room for it: the ceiling is a top on calls to Vision, so
 * a retry that skipped it would let the bill reach twice what it promises.
 */
async function runOcr(deps: LabelOcrDeps, imageBase64: string, spendRetry: () => Promise<boolean>): Promise<OcrResult> {
  // One deadline for every attempt together, so a second try can't carry the
  // function past the app's own wait.
  const signal = AbortSignal.timeout(VISION_TIMEOUT_MS);
  let body: VisionBody = null;
  for (let attempt = 1; attempt <= VISION_ATTEMPTS; attempt++) {
    const answer = await askVision(deps, imageBase64, signal);
    if (answer.ok) {
      body = answer.body;
      break;
    }
    // Why Vision refused, in the function log: `scan_log` only says
    // `upstream_failure`, which can't tell a bad key from a busy minute. The
    // status and Vision's own message only, never anything from the photo.
    console.error(`[vision] attempt ${attempt} of ${VISION_ATTEMPTS} failed:`, answer.why);
    if (!answer.retry || signal.aborted || attempt === VISION_ATTEMPTS) return { ok: false, noText: false };
    await new Promise((resolve) => setTimeout(resolve, VISION_RETRY_PAUSE_MS));
    if (signal.aborted || !(await spendRetry())) return { ok: false, noText: false };
  }
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

/**
 * Whether the label printed `name` across a line break, at one of its spaces.
 * The parser joins lines with a space before it splits, so a wrapped name
 * ("알란\n토인", "niacin-\namide") reaches here with that space inside it.
 */
function brokenAcrossLines(text: string, name: string): boolean {
  const lines = text.normalize("NFKC").toLowerCase().replace(/\r/g, "").replace(/[ \t]*\n\s*/g, "\n").replace(/[ \t]+/g, " ");
  const words = name.split(" ");
  for (let i = 1; i < words.length; i++) {
    if (lines.includes(`${words.slice(0, i).join(" ")}\n${words.slice(i).join(" ")}`)) return true;
  }
  return false;
}

/** Until the daily Vision ceiling's window (a UTC day) resets. At least 1. */
function secondsUntilUtcMidnight(now = Date.now()): number {
  const day = 86_400_000;
  return Math.max(1, Math.ceil((day - (now % day)) / 1000));
}
