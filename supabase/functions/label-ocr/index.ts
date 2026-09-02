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
// Google Cloud Vision rather than on-device ML Kit: ML Kit is free and works
// offline, but needs a custom dev build, and SDK 54 was chosen to keep Expo Go
// working. The key stays here, never in the bundle.

import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  callerKey,
  json,
  preflight,
  withinRateLimit,
  type RateLimit,
} from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

/** Generous for a person in a shop, useless for anyone burning the free tier. */
const RATE_LIMIT: RateLimit = { windowSeconds: 300, maxRequests: 10 };

/** Roughly 4 MB of base64 — well past what a legible label photo needs. */
const MAX_IMAGE_CHARS = 5_500_000;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);
  if (!VISION_API_KEY) return json(req, { error: "OCR is not configured" }, 503);

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
  if (barcode !== undefined && !/^\d{8,14}$/.test(barcode)) {
    return json(req, { error: "barcode must be 8-14 digits" }, 400);
  }

  if (!withinRateLimit(callerKey(req), RATE_LIMIT)) {
    return json(req, { error: "Too many requests" }, 429);
  }

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
  const aliases = await fetchAliases();
  let parsed = parseIngredientBlock(text, undefined, aliases);

  if (parsed.length < 4) {
    const dictionary = await fetchDictionary();
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
  const known = await knownIngredients(parsed.map((p) => p.inci_name));

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
    // better than this function's fallbacks — it only read the formula.
    type: existing?.type ?? "serum",
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
    expires_at: null,
  };

  const { error: ingredientsError } = await db.from("ingredients").upsert(
    parsed
      .filter((p) => !known.has(p.inci_name))
      .map((p) => ({
        inci_name: p.inci_name,
        // Not "curated" — nothing has reviewed this, it's a stub so
        // `product_ingredients` has a name to point at. See migration 0007.
        source: "unmatched",
        safety: "safe",
        verified: false,
        note: "Read from a label, not matched to the ingredient dictionary.",
      })),
    { onConflict: "inci_name", ignoreDuplicates: true }
  );
  if (ingredientsError) {
    console.error("ingredients upsert failed:", ingredientsError);
    return json(req, { error: "Could not save the scan" }, 502);
  }

  const { error: productError } = await db.from("products").upsert(product, { onConflict: "id" });
  if (productError) {
    console.error("products upsert failed:", productError);
    return json(req, { error: "Could not save the scan" }, 502);
  }

  // Delete-then-insert: both checked, because an unchecked failure on either
  // leg would leave the row silently short a formula while this handler still
  // reports success.
  const { error: deleteError } = await db
    .from("product_ingredients")
    .delete()
    .eq("product_id", product.id);
  if (deleteError) {
    console.error("product_ingredients delete failed:", deleteError);
    return json(req, { error: "Could not save the scan" }, 502);
  }

  const { error: insertError } = await db.from("product_ingredients").insert(
    parsed.map((p) => ({
      product_id: product.id,
      inci_name: p.inci_name,
      position: p.position,
    }))
  );
  if (insertError) {
    console.error("product_ingredients insert failed:", insertError);
    return json(req, { error: "Could not save the scan" }, 502);
  }

  const { data } = await db
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", product.id)
    .maybeSingle();

  return json(req, { product: data, recognised: known.size, total: parsed.length }, 200);
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
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ");

  const heading = /(?:ingredients?|전성분|성분)\s*[:：]?\s*/i.exec(flat);
  let block = heading ? flat.slice(heading.index + heading[0].length) : flat;

  // Stop at the next sentence-like section, which is usually directions or a
  // marketing claim rather than more formula. Also stop at the net-quantity
  // mark (EU packaging's "e" symbol beside a volume) and distributor/legal
  // boilerplate, both of which reliably sit right after the formula and,
  // left in, degrade to junk fragments that dilute the recognised ratio.
  const stop =
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법|\b(?:e\s*)?\d{2,4}\s*(?:ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b)/i.exec(
      block
    );
  if (stop) block = block.slice(0, stop.index);

  // Aliases resolve on the delimited path too: a bilingual label lists its
  // French names comma-separated like any other, so `glycérine` arrives here
  // well-formed and merely under the wrong name.
  const canonical = (name: string) => aliases?.get(name) ?? name;

  const delimited = splitOnSeparators(block)
    .map(normalise)
    .filter((n) => n.length > 1 && n.length < 120 && /[a-z]/.test(n))
    .map((name, position) => ({ inci_name: canonical(name), position }));

  if (delimited.length >= MIN_DELIMITED_TOKENS || !dictionary) return dedupe(delimited);

  const words = block.split(/\s+/).filter(Boolean).slice(0, MAX_RECONSTRUCTED_WORDS);
  return dedupe(
    reconstructFromDictionary(words, dictionary).map((p) => ({
      ...p,
      inci_name: canonical(p.inci_name),
    }))
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
function fuzzyLookup(candidate: string, byLength: Map<number, string[]>): string | null {
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
  fuzzy: boolean
): string | null {
  const lookup = (value: string): string | null => {
    if (value.length <= 1) return null;
    if (dictionary.has(value)) return value;
    return fuzzy ? fuzzyLookup(value, byLength) : null;
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
  let i = 0;

  while (i < words.length) {
    let matched: { name: string; consumed: number } | null = null;
    const maxSpan = Math.min(MAX_WINDOW_WORDS, words.length - i);

    for (const fuzzy of [false, true]) {
      for (let span = maxSpan; span >= 1 && !matched; span--) {
        const name = matchWindow(words.slice(i, i + span), dictionary, byLength, fuzzy);
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
   price_krw, in_stock, suitable_for, targets, source, attribution,
   product_ingredients ( position, ingredients ( inci_name, comedogenic, safety, note, verified ) )`;

type ExistingProduct = {
  id: string;
  brand: string;
  name: string;
  type: string;
  area: string;
  volume: string | null;
  source: string;
  attribution: string | null;
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
  const names = new Set<string>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    // Postgres gives no cross-page ordering guarantee for an unordered
    // `.range()` — without `.order()`, later pages can repeat or skip rows.
    const { data, error } = await db
      .from("ingredients")
      .select("inci_name")
      .eq("verified", true)
      .order("inci_name", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`fetchDictionary: ${error.message}`);
    for (const row of data ?? []) names.add(row.inci_name as string);
    if (!data || data.length < PAGE) break;
  }
  return names;
}

/**
 * Other names for ingredients we already hold, mapped to the canonical one —
 * the French half of a bilingual label, or a trivial name like "mineral oil"
 * where INCI says "paraffinum liquidum". Matched exactly like a real name,
 * then rewritten to what the dictionary is keyed on.
 */
async function fetchAliases(): Promise<Map<string, string>> {
  const aliases = new Map<string, string>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    // Same reasoning as fetchDictionary: `.order()` is required for a stable
    // `.range()` page sequence, and a failed page must not be treated as "no
    // more rows".
    const { data, error } = await db
      .from("ingredient_synonyms")
      .select("synonym, inci_name")
      .order("synonym", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`fetchAliases: ${error.message}`);
    for (const row of data ?? []) {
      aliases.set(row.synonym as string, row.inci_name as string);
    }
    if (!data || data.length < PAGE) break;
  }
  return aliases;
}

async function knownIngredients(names: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < names.length; i += 200) {
    const { data } = await db
      .from("ingredients")
      .select("inci_name")
      .eq("verified", true)
      .in("inci_name", names.slice(i, i + 200));
    for (const row of data ?? []) found.add(row.inci_name as string);
  }
  return found;
}

