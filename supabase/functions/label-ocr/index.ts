// Read an ingredient list off a photographed label, and write it back so the
// next person who scans that barcode gets it instantly.
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
  type RateLimit,
} from "../_shared/http.ts";
import { paginateOrdered } from "../_shared/paginate.ts";
import { stripBase64ImageMetadata } from "../_shared/strip-metadata.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

/** Generous for a person in a shop, useless for anyone burning the free tier. */
const RATE_LIMIT: RateLimit = { windowSeconds: 300, maxRequests: 10 };

/** Roughly 4 MB of base64 — well past what a legible label photo needs. */
const MAX_IMAGE_CHARS = 5_500_000;

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
 * below), a bad first photo didn't just create one bad row: it made every
 * later, better photo of the same bottle return the bad formula forever,
 * since Vision was never called again for that barcode.
 */
const MIN_KNOWN_INGREDIENT_RATIO = 0.6;

/**
 * Grace period before a barcode-less scan self-evicts, via the same hourly
 * `evict-expired-products` job that already runs unconditionally against
 * anything carrying a deadline (0002_eviction_schedule.sql). Step 5b's
 * row-accrual answer: nobody but the scanner can ever find an `ocr-<uuid>`
 * row with no barcode, so it is offered a barcode afterward
 * (`resolve-scan`'s `attach-barcode`, which clears this back to permanent)
 * and discarded — immediately on an explicit decline, or automatically here
 * if nobody ever answers. 24h, the same window this app's disk cache
 * already uses elsewhere — long enough to get home from the shop and
 * decide, short enough that an unanswered scan does not linger.
 */
const OCR_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

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
  if (!VISION_API_KEY) return json(req, { error: "OCR is not configured" }, 503);

  // Refuse an oversized body BEFORE reading it. `req.json()` buffers the whole
  // request into memory first, so the `MAX_IMAGE_CHARS` check further down —
  // correct as far as it goes — only ever runs once the bytes are already
  // held. Supabase does not document a request body limit for Edge Functions,
  // so there is nothing to delegate this to.
  //
  // A body with no Content-Length (chunked) cannot be pre-checked; that case
  // falls through to the existing check, which still holds.
  const declaredLength = Number(req.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(req, { error: "Image too large — retake it closer in" }, 413);
  }

  let barcode: string | undefined;
  let imageBase64: string;
  let name: string | undefined;
  let brand: string | undefined;
  try {
    ({ barcode, imageBase64, name, brand } = await req.json());
  } catch {
    return json(req, { error: "Body must be JSON" }, 400);
  }

  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return json(req, { error: "imageBase64 is required" }, 400);
  }
  if (imageBase64.length > MAX_IMAGE_CHARS) {
    return json(req, { error: "Image too large — retake it closer in" }, 413);
  }
  // Cheap rejection of garbage before it reaches Vision: a non-base64 payload
  // would otherwise spend a network round trip only to be rejected there.
  if (!/^[A-Za-z0-9+/=\s]+$/.test(imageBase64)) {
    return json(req, { error: "imageBase64 is not valid base64" }, 400);
  }
  // `typeof` first, deliberately. `/regex/.test(x)` coerces its argument, so
  // a JSON *number* barcode passes the digit check and is then written to
  // `products.barcode` as a number rather than the string the column expects.
  if (barcode !== undefined && (typeof barcode !== "string" || !/^\d{8,14}$/.test(barcode))) {
    return json(req, { error: "barcode must be 8-14 digits" }, 400);
  }
  // These are optional and only used to name a brand-new row, but they reach
  // `.trim()` unchecked further down — so `{"name": 123}` threw a TypeError
  // out of the handler and surfaced as a bare 500 rather than a 400.
  if (name !== undefined && typeof name !== "string") {
    return json(req, { error: "name must be a string" }, 400);
  }
  if (brand !== undefined && typeof brand !== "string") {
    return json(req, { error: "brand must be a string" }, 400);
  }

  const refusal = await enforceRateLimit(req, db, "label-ocr", RATE_LIMIT);
  if (refusal) return refusal;

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
  // spend anything, and before the short-circuit below so the format check
  // runs on every request rather than only the ones that reach Vision.
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
      return json(req, { error: "Image too large — retake it closer in" }, 413);
    }
    return json(req, { error: "Unsupported image format" }, 415);
  }
  imageBase64 = cleaned.base64;

  // A formula we already hold for this barcode came from a source that had
  // the list in machine-readable form — commas intact, every name canonical.
  // A photograph cannot beat that, so don't spend a Vision call trying, and
  // above all don't overwrite it with a worse read.
  const existing = barcode ? await productForBarcode(barcode) : null;
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

  const text = await runOcr(imageBase64);
  if (text === null) return json(req, { error: "Could not read the image" }, 502);

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
    return json(req, { error: "Could not read the ingredient dictionary" }, 502);
  }
  let parsed = parseIngredientBlock(text, undefined, aliases);

  if (parsed.length < 4) {
    let dictionary: Set<string>;
    try {
      dictionary = await fetchDictionary();
    } catch (err) {
      console.error("fetchDictionary failed:", err);
      return json(req, { error: "Could not read the ingredient dictionary" }, 502);
    }
    // A synonym is matchable in its own right, then resolved to the canonical
    // name on the way out.
    for (const synonym of aliases.keys()) dictionary.add(synonym);
    parsed = parseIngredientBlock(text, dictionary, aliases);
  }

  if (parsed.length < 4) {
    // Better to say so than to score a fragment. Four is the same floor the
    // verdict engine uses before it will produce a number at all.
    return json(
      req,
      { error: "not_enough_text", found: parsed.length, rawText: text.slice(0, 400) },
      422
    );
  }

  // Only names our dictionary already knows are trusted. The rest are stored
  // unverified, so the UI shows them as unrecognised rather than pretending we
  // assessed them — OCR on a curved bottle produces plenty of nonsense.
  let known: Set<string>;
  try {
    known = await knownIngredients(parsed.map((p) => p.inci_name));
  } catch (err) {
    console.error("knownIngredients failed:", err);
    return json(req, { error: "Could not read the ingredient dictionary" }, 502);
  }

  // The gate, run before anything is written — not after, which is what let
  // a photo of a wall or a receipt clear the four-fragment floor above and
  // get persisted as a real row before the client had any say. Same ratio,
  // same reasoning as MIN_KNOWN_INGREDIENT_RATIO's own comment: a parsed
  // formula that mostly misses the dictionary is not a rare formula, it is
  // a bad read, and nothing downstream — the plausibility gate, the barcode
  // short-circuit, `formulaKey`-equivalent identity — can tell the
  // difference once it is sitting in the table as a normal row.
  if (known.size / parsed.length < MIN_KNOWN_INGREDIENT_RATIO) {
    return json(
      req,
      { error: "low_confidence", found: parsed.length, recognised: known.size, rawText: text.slice(0, 400) },
      422
    );
  }

  // `products.barcode` is UNIQUE. When a row already exists for this barcode —
  // an identity-only hit from the barcode database, which knows the name but
  // carries no formula — the ingredients belong on THAT row. Writing
  // `ocr-<barcode>` alongside it would violate the constraint, and the user
  // would end up with the same product twice.
  //
  // Identity fields prefer `existing` over the client-supplied `name`/`brand`
  // when reusing that row: this endpoint is unauthenticated, so an existing
  // catalogue entry — sourced from OBF, the INCI API, or a prior scan — must
  // not be silently renamed or re-attributed by whoever next photographs its
  // label. The client's values only fill a genuinely blank row.
  const product = {
    id: existing?.id ?? (barcode ? `ocr-${barcode}` : `ocr-${crypto.randomUUID()}`),
    barcode: barcode ?? null,
    brand: (existing?.brand ?? brand ?? "Unknown").trim().slice(0, 120) || "Unknown",
    name:
      (existing?.name ?? name ?? "Scanned product").trim().slice(0, 200) || "Scanned product",
    // Whatever the barcode source already established about the product is
    // better than this function's fallbacks — it only read the formula. A
    // fresh OCR-only scan has no basis to guess a category from a photographed
    // ingredient list, so it says "unknown" rather than defaulting to
    // "serum" — the bug that had a photographed foot cream displayed as one.
    type: existing?.type ?? "unknown",
    area: existing?.area ?? "face",
    description: null,
    image_url: null,
    volume: existing?.volume ?? null,
    in_stock: true,
    suitable_for: [],
    targets: [],
    // Reusing an identity-only row keeps its own source/attribution — it was
    // never ours to relicense just because this scan added the formula. Only
    // a brand-new row is attributed to the label photo itself.
    source: existing ? existing.source : "ocr",
    attribution: existing
      ? existing.attribution
      : "Ingredients read from the product label.",
    // Permanent whenever a barcode is in hand — `existing`, when set, only
    // ever came from a barcode lookup, so this covers both a brand-new
    // barcode-tagged row and one reusing an identity-only hit. Only a
    // genuinely orphaned, barcode-less `ocr-<uuid>` row gets the grace
    // period: see OCR_GRACE_PERIOD_MS above.
    expires_at: barcode ? null : new Date(Date.now() + OCR_GRACE_PERIOD_MS).toISOString(),
  };

  // One RPC, one transaction: the stub ingredient rows, the product, and the
  // replacement of its formula either all commit or none do (migration 0008).
  // The three separate PostgREST calls this replaces each committed on their
  // own, so a failed insert after a successful delete left the product holding
  // zero ingredients while still reading as a complete row. See issue #40.
  //
  // Every parsed name is sent, not just the ones missing from `known`: the RPC
  // inserts stubs ON CONFLICT DO NOTHING, so a name already in the dictionary
  // is left exactly as it was, and the full list is what has to drive
  // `product_ingredients` regardless.
  const { error: persistError } = await db.rpc("replace_product_with_ingredients", {
    p_product: product,
    p_ingredients: parsed,
    p_stub_note: "Read from a label, not matched to the ingredient dictionary.",
  });
  if (persistError) {
    console.error("replace_product_with_ingredients failed:", persistError);
    return json(req, { error: "Could not save the scan" }, 502);
  }

  const { data, error: readbackError } = await db
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", product.id)
    .maybeSingle();
  if (readbackError || !data) {
    console.error("post-write readback failed:", readbackError);
    return json(req, { error: "Could not save the scan" }, 502);
  }

  // The capability that lets this scan be resolved later — see migration
  // 0015. Minted for exactly the rows that got the grace period above: a
  // barcode-having write (fresh or reusing `existing`) has nothing to
  // resolve, since it is already permanent and findable. `products` is
  // publicly readable, so without this any caller could enumerate every
  // barcode-less scan on its grace timer and hijack or delete someone
  // else's — see resolve-scan's own header comment for what that would
  // have allowed.
  //
  // Best-effort, not part of the write's own success: the product itself
  // is already saved and correct at this point, and a token that failed to
  // insert just means this particular scan cannot be resolved through the
  // UI before it self-evicts — a safe, fail-closed degradation, not a
  // reason to fail a scan that otherwise worked.
  let scanToken: string | undefined;
  if (!barcode) {
    scanToken = crypto.randomUUID();
    const { error: tokenError } = await db
      .from("scan_tokens")
      .insert({ product_id: product.id, token: scanToken });
    if (tokenError) {
      console.error("scan_tokens insert failed:", tokenError);
      scanToken = undefined;
    }
  }

  return json(
    req,
    { product: data, recognised: known.size, total: parsed.length, scanToken },
    200
  );
});

// ── OCR ─────────────────────────────────────────────────────────────────────

async function runOcr(imageBase64: string): Promise<string | null> {
  const res = await fetch(`${VISION_URL}?key=${VISION_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          // DOCUMENT_TEXT_DETECTION beats TEXT_DETECTION on dense small print
          // set in a block, which is exactly what an INCI panel is.
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: ["en", "ko"] },
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const annotation = body?.responses?.[0]?.fullTextAnnotation;
  if (!annotation) return null;

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
  return annotation.text ?? null;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

type ParsedIngredient = { inci_name: string; position: number };

const MIN_DELIMITED_TOKENS = 4;
const MAX_WINDOW_WORDS = 6;

/**
 * Split a printed list on its separators. A comma directly between two digits
 * belongs to the name — "1,2-Hexanediol" is one ingredient, and splitting there
 * yields a bare "1" and a "2-hexanediol" that matches nothing. Both sides of
 * the comma are checked, not just the one after — a lookahead alone let
 * "Water,4-Terpineol" fuse into one token. Kept in step with `lib/inci.ts`.
 */
function splitOnSeparators(text: string): string[] {
  const PLACEHOLDER = "";
  const protectedText = text.replace(/,(?=\d)/g, (match, offset: number) =>
    offset > 0 && /\d/.test(text[offset - 1]) ? PLACEHOLDER : match
  );
  return protectedText.split(/[;•·]|,/).map((s) => s.replace(new RegExp(PLACEHOLDER, "g"), ","));
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
 * name. Eight words is above every real INCI name in the dictionary and below
 * every sentence found in it.
 */
export function isPlausibleIngredientName(name: string): boolean {
  if (/[:：]/.test(name.replace(/\d[:：]\d/g, ""))) return false;
  if (/\.(?:jpe?g|png|gif|webp|pdf)\b/i.test(name)) return false;
  return name.split(/\s+/).length <= 8;
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
 * Map a delimited name the dictionary does not hold to the one it does.
 *
 * `matchWindow` already knows two printed-label habits, but only runs when the
 * list had no delimiters at all. A list split cleanly on commas skipped both,
 * so "aqua/water/eau" and "gly cerin" reached the dictionary as-is and missed —
 * about a fifth of every unmatched name in a live sample, for ingredients the
 * dictionary holds under a plain name.
 *
 *  - OCR splits one printed word: "gly cerin", "be henyl alcohol".
 *  - "/" separates names for ONE ingredient: "aqua/water/eau" is aqua. Strict,
 *    as in `matchWindow`: every later part must be a known name or a single
 *    word, so "hydroxyethyl acrylate/sodium acryloyldimethyl taurate
 *    copolymer" — one real name that merely contains a slash — is left alone.
 *
 * A name already in the dictionary, or matching neither shape, comes back
 * unchanged.
 */
export function resolveKnownName(name: string, dictionary: ReadonlySet<string>): string {
  if (dictionary.has(name)) return name;
  const words = name.split(" ");
  for (let i = 0; i + 1 < words.length; i++) {
    const joined = [...words.slice(0, i), words[i] + words[i + 1], ...words.slice(i + 2)].join(" ");
    if (dictionary.has(joined)) return joined;
  }
  if (name.includes("/")) {
    const parts = name.split("/").map(normalise);
    const restIsPlausible = parts.slice(1).every((p) => p.length > 1 && (dictionary.has(p) || !p.includes(" ")));
    if (parts.length > 1 && dictionary.has(parts[0]) && restIsPlausible) return parts[0];
  }
  return name;
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
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ").replace(/\b(?:inactive ingredients?|may contain|peut contenir)\s*[:：]?\s*/gi, ", ");

  const heading = /(?:ingr[eé]dient(?:s|es|e|i)?|sastojci|composition|composição|zutaten|inhaltsstoffe)\s*[:：]\s*|(?:ingredients?|전성분|성분)\s*[:：]?\s*/i.exec(flat);
  let block = heading ? flat.slice(heading.index + heading[0].length) : flat;

  // With a dictionary the heading's language stops mattering: the list is
  // wherever the known ingredients are. The heading pattern above stays as the
  // fallback for when nothing clears the bar, or no dictionary was supplied.
  const listed = dictionary ? findListByDictionary(flat, dictionary, aliases) : null;
  if (listed) block = listed;

  // Stop at the next sentence-like section, which is usually directions or a
  // marketing claim rather than more formula. Also stop at the net-quantity
  // mark (EU packaging's "e" symbol beside a volume) and distributor/legal
  // boilerplate, both of which reliably sit right after the formula and,
  // left in, degrade to junk fragments that dilute the recognised ratio.
  const stop =
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법|\b(?:e\s*)?\d{2,4}\s*(?:ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b|\bstorage\b)/i.exec(
      block
    );
  if (stop) block = block.slice(0, stop.index);

  // Aliases resolve on the delimited path too: a bilingual label lists its
  // French names comma-separated like any other, so `glycérine` arrives here
  // well-formed and merely under the wrong name.
  const canonical = (name: string) => aliases?.get(name) ?? name;

  const delimited = splitOnSeparators(block)
    .map(normalise)
    .filter((n) => n.length > 1 && n.length < 120 && /[a-z]/.test(n) && isPlausibleIngredientName(n))
    .map((name, position) => ({
      inci_name: dictionary ? resolveKnownName(canonical(name), dictionary) : canonical(name),
      position,
    }));

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
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/g, "");
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

