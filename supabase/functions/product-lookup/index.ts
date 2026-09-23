// Barcode → product, with the cascade and the third-party key kept server-side.
//
// This runs on Deno, not React Native. It exists for three reasons:
//
//   1. The INCI API key must never reach the client. Anything prefixed
//      EXPO_PUBLIC_ is substituted into the JS bundle at build time and can be
//      read out of a shipped app.
//   2. The free tier is 2,000 requests/month. Without a rate limit in front of
//      it, one loop drains the quota for everybody.
//   3. Each source comes with different licence terms, and the row has to be
//      written back carrying its own. Doing that in the client would put a
//      legal obligation in the least trustworthy place in the system.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { guessTypeFromIngredients } from "../_shared/guess-type-from-ingredients.ts";
import { isParserOnlyChange } from "../_shared/parser-refresh.ts";
import { guessType } from "../_shared/product-type-classifier.mjs";
import {
  json,
  preflight,
  enforceRateLimit,
  callerSalt,
  type RateLimit,
} from "../_shared/http.ts";
import { logScanBounded } from "../_shared/scan-log.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INCI_API_KEY = Deno.env.get("INCI_API_KEY") ?? "";

const OBF_BASE = "https://world.openbeautyfacts.org/api/v2";
const INCI_BASE = "https://inciapi.com/v1";

/** Open Beauty Facts asks that clients identify themselves. */
const USER_AGENT = "for.me/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";

/**
 * Fallback cache lifetime for INCI API rows when the response carries no
 * usable Cache-Control. Their terms allow caching "in accordance with returned
 * cache headers", so we honour the header when there is one and stay
 * deliberately short when there isn't.
 */
const DEFAULT_TTL_SECONDS = 60 * 60 * 24;

/** Per-caller budget. Generous for a human in a shop, useless for a scraper. */
const RATE_LIMIT: RateLimit = { windowSeconds: 60, maxRequests: 20 };

const ATTRIBUTION = {
  obf: "Product data from Open Beauty Facts, used under ODbL.",
  inci_api: "Product data from INCI API.",
} as const;

/**
 * See scripts/import-obf.mjs. Every OBF image is a user upload with no way to
 * tell a pack shot from a review snapshot, so a freshly scanned product gets
 * the illustration too — otherwise scanning would reintroduce exactly the
 * photos the catalogue import excludes.
 */
const USE_SOURCE_PHOTOS = false;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SELECT = `
  id, barcode, brand, name, type, area, description, image_url, volume,
  price_krw, in_stock, suitable_for, targets, attribution, fetched_at,
  formula_changed_at,
  product_ingredients ( position, ingredients ( inci_name, comedogenic, safety, note, verified, functions ) )
`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  let body: { barcode?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Body must be JSON" }, 400);
  }

  const barcode = body.barcode;

  // EAN-13/8 and UPC-A/E are all digits. Rejecting anything else here keeps
  // arbitrary strings out of both the upstream APIs and the database.
  if (typeof barcode !== "string" || !/^\d{8,14}$/.test(barcode)) {
    return json(req, { error: "barcode must be 8-14 digits" }, 400);
  }

  const refusal = await enforceRateLimit(req, db, "product-lookup", RATE_LIMIT);
  if (refusal) return refusal;

  const logScan = (outcome: "resolved" | "not_found" | "upstream_failure" | "internal_error") =>
    logScanBounded(req, db, callerSalt(), { path: "barcode", outcome });

  // 1 ── our own catalogue, which already excludes anything past its deadline
  const existing = await db
    .from("products")
    .select(SELECT)
    .eq("barcode", barcode)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();
  if (existing.data) {
    // A row with no ingredients is a leftover half-product (a barcode and a name
    // from the retired barcode database), not something that can be scored. Say
    // "not found" so the app asks for the ingredient list; `label-ocr` then fills
    // this same row in. The other sources are not asked: they would try to write a
    // second row under this barcode, which is unique.
    if (!existing.data.product_ingredients?.length) {
      await logScan("not_found");
      return json(req, { error: "Not found in any source" }, 404);
    }
    await logScan("resolved");
    return json(req, existing.data, 200);
  }

  // Each remaining source is a third-party call over the network, so a DNS
  // failure, timeout or outage in one must fall through to the next rather
  // than crash the whole lookup — a barcode that is genuinely nowhere is an
  // ordinary 404, not a 500.
  //
  // `upstreamFailed`, checked at the final `logScan` call below, separates
  // that outage from a genuine miss: without it, every source throwing looked
  // exactly like a barcode nobody has ever heard of, which is the opposite of
  // what #236 exists to measure.
  let upstreamFailed = false;
  const safely = async (fn: () => Promise<Fetched | null>): Promise<Fetched | null> => {
    try {
      return await fn();
    } catch (err) {
      console.error("lookup source failed:", err);
      upstreamFailed = true;
      return null;
    }
  };

  // A write failure here must not read as "not found" (wrong — the product IS
  // in the source that was just consulted) or as success with a body the
  // client then can't render. Per the security guidance the client gets a
  // generic message; the detail goes to the server log only.
  const persistOrFail = async (fetched: Fetched): Promise<Response> => {
    try {
      const data = await persist(fetched);
      await logScan("resolved");
      return json(req, data, 200);
    } catch (err) {
      console.error("persist failed:", err);
      await logScan("internal_error");
      return json(req, { error: "Could not save the product" }, 502);
    }
  };

  // 2 ── Open Beauty Facts: the only source we may keep permanently
  const fromObf = await safely(() => lookupOpenBeautyFacts(barcode));
  if (fromObf) return persistOrFail(fromObf);

  // 3 ── INCI API: better data, but cached under their terms, not owned. Kept
  // behind the OBF short-circuit above so a hit there never spends metered
  // quota on the 2,000-request/month tier.
  if (INCI_API_KEY) {
    const fromInci = await safely(() => lookupInciApi(barcode));
    if (fromInci) return persistOrFail(fromInci);
  }

  // Nothing else is consulted. A product is stored only when it has a name, a
  // barcode and an ingredient list, so a source that knows a barcode but not
  // its formula is no source at all: the client is told "not found" and asks
  // the user for the ingredient list instead.
  await logScan(upstreamFailed ? "upstream_failure" : "not_found");
  return json(req, { error: "Not found in any source" }, 404);
});

// ── Sources ─────────────────────────────────────────────────────────────────

type Fetched = {
  product: Record<string, unknown>;
  ingredients: { inci_name: string; position: number }[];
};

async function lookupOpenBeautyFacts(barcode: string): Promise<Fetched | null> {
  const res = await fetch(
    `${OBF_BASE}/product/${barcode}.json?fields=code,product_name,brands,image_url,ingredients_text,quantity,categories_tags`,
    { headers: { "User-Agent": USER_AGENT } }
  );
  // A 404 is OBF's genuine answer for a barcode it has never heard of — a
  // real miss. Anything else non-OK (429, 5xx) is OBF itself being
  // unavailable or rate-limiting us, not an answer about the barcode, and
  // `safely()`'s caller needs to tell the two apart (`scan_log`'s
  // `upstream_failure` vs `not_found` — found in review on #246, since both
  // used to collapse into the same `return null`).
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Open Beauty Facts: ${res.status}`);
  }

  const body = await res.json();
  if (body.status !== 1 || !body.product) return null;

  const p = body.product;
  const name = (p.product_name ?? "").trim();
  const inci = (p.ingredients_text ?? "").trim();
  // A record with no name or no formula is worse than nothing: it would occupy
  // the barcode permanently and stop the better source ever being consulted.
  if (!name || !inci) return null;

  // Parsed before the type is decided, not after, so the ingredient fallback
  // below has something to read. A live scan that skipped it stored "unknown"
  // for a product the importer would have typed from the same formula — the
  // same barcode ending up with two different types depending on how it
  // arrived.
  const ingredients = parseInci(inci);
  // Text that parses to no ingredient at all is no formula.
  if (ingredients.length === 0) return null;
  const byName = guessType(p.categories_tags ?? [], name);

  return {
    product: {
      id: `obf-${barcode}`,
      barcode,
      brand: (p.brands ?? "Unknown").split(",")[0].trim(),
      name,
      type: byName !== "unknown" ? byName : guessTypeFromIngredients(name, ingredients),
      // Required by the `products` table's NOT NULL CHECK constraint, but no
      // longer computed: the client dropped `area` entirely (nothing reads
      // it back — see store/useAppStore.ts's v5 -> v6 migration note), so
      // guessing a real value for it was wasted work.
      area: "face",
      description: null,
      image_url: USE_SOURCE_PHOTOS ? (p.image_url ?? null) : null,
      volume: p.quantity ?? null,
      in_stock: true,
      suitable_for: [],
      targets: [],
      source: "obf",
      attribution: ATTRIBUTION.obf,
      expires_at: null, // ODbL — ours to keep
    },
    ingredients,
  };
}

/**
 * `GET /v1/products/:barcode` — category is an array, images live under
 * `imageUrls`, and `ingredients` is a raw comma-separated string (same shape
 * as Open Beauty Facts'), not a pre-parsed array — verified against the
 * published docs at https://inciapi.com/docs/, since the previous shape here
 * (`api.inciapi.com`, `Authorization: Bearer`, an `ingredients[]` of objects)
 * didn't match anything the service actually serves.
 */
async function lookupInciApi(barcode: string): Promise<Fetched | null> {
  const res = await fetch(`${INCI_BASE}/products/${barcode}`, {
    headers: { "X-API-Key": INCI_API_KEY, Accept: "application/json" },
  });
  // Same split as the OBF branch above: 404 (product_not_found /
  // invalid_barcode) is a real answer, anything else non-OK is INCI API
  // being unavailable or rate-limiting us.
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`INCI API: ${res.status}`);
  }

  const p = await res.json();
  if (!p?.name) return null;

  const category: string[] = Array.isArray(p.category) ? p.category : [];
  // Same ordering as the OBF branch above, and for the same reason.
  const ingredients = parseInci(typeof p.ingredients === "string" ? p.ingredients : "");
  // A product with no ingredient list is not one we can judge or store.
  if (ingredients.length === 0) return null;
  const byName = guessType(category, p.name);

  return {
    product: {
      id: `inci-${barcode}`,
      barcode,
      brand: p.brand ?? "Unknown",
      name: p.name,
      type: byName !== "unknown" ? byName : guessTypeFromIngredients(p.name, ingredients),
      // See the note on the other `area: "face"` above.
      area: "face",
      description: null,
      // Their terms don't address re-hosting, so we don't: the URL is
      // referenced, never copied into our own storage.
      image_url: Array.isArray(p.imageUrls) ? (p.imageUrls[0] ?? null) : null,
      volume: p.volume ?? null,
      in_stock: true,
      suitable_for: [],
      targets: [],
      source: "inci_api",
      attribution: ATTRIBUTION.inci_api,
      expires_at: new Date(Date.now() + ttlFrom(res) * 1000).toISOString(),
    },
    ingredients,
  };
}

/** Honours Cache-Control max-age when present; short default when it isn't. */
function ttlFrom(res: Response): number {
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1];
  const parsed = maxAge ? Number(maxAge) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
}

// ── Persistence ─────────────────────────────────────────────────────────────

/**
 * Thrown to short-circuit `persist` on a write failure. Never sent to the
 * client verbatim — the guidance forbids returning raw database errors — the
 * handler catches this, logs the detail server-side, and replies with a
 * generic 502.
 */
class PersistError extends Error {}

async function persist(fetched: Fetched) {
  const { product, ingredients } = fetched;
  const id = product.id as string;

  // One RPC, one transaction: the stub ingredient rows, the product, and the
  // replacement of its formula either all commit or none do (migration 0008).
  // Three separate PostgREST calls could not give that — and the delete leg in
  // particular committed on its own, so a failed insert left the product
  // holding zero ingredients while still looking like a complete row to every
  // later read. See issue #40.
  //
  // Ingredients we've never seen are stored unrated rather than guessed at. A
  // fabricated comedogenic rating would be indistinguishable from a measured
  // one, which is the one mistake this table must not make.
  //
  // A third-party row that expired is written again under the same id, and its
  // formula can differ from the stored one only because the parser improved. That
  // is not a reformulation, so it must not stamp `formula_changed_at` (migration
  // 0021). Only sent when true, so a write that never needs it works before 0021
  // is applied. If the stored formula cannot be read, fall back to no flag.
  const { data: stored } = await db
    .from("product_ingredients")
    .select("inci_name, position")
    .eq("product_id", id);
  const parserRefresh = isParserOnlyChange(stored ?? [], ingredients, parseInci);
  const { error } = await db.rpc("replace_product_with_ingredients", {
    p_product: product,
    p_ingredients: ingredients,
    p_stub_note: "No published rating for this ingredient yet.",
    ...(parserRefresh ? { p_parser_refresh: true } : {}),
  });
  if (error) throw new PersistError(`replace_product_with_ingredients: ${error.message}`);

  const { data, error: readbackError } = await db
    .from("products")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (readbackError) throw new PersistError(`post-write readback: ${readbackError.message}`);
  if (!data) throw new PersistError("post-write readback: row not found after write");
  return data;
}

// ── Parsing helpers ─────────────────────────────────────────────────────────

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
 * INCI lists are comma-separated, but real labels are messy: bracketed
 * qualifiers, asterisks for organic, trailing percentages. This keeps the
 * order (which is regulated information) and drops the decoration.
 */
function parseInci(text: string): { inci_name: string; position: number }[] {
  // Open Beauty Facts' ingredient text sometimes carries the label's own
  // heading. Without this the heading fuses onto the first name and the most
  // basic ingredient in the formula stops resolving — Torriden's DIVE-In pad
  // was stored with "ingredients water" as its first entry, so the app could
  // not say what water was. `lib/inci.ts` has always stripped this; the two
  // parsers simply disagreed.
  const withoutHeading = text.replace(/^\s*(?:full\s+|all\s+)?(?:ingr[eé]dient(?:s|es|e|i)?|sastojci|composition|composição|zutaten|inhaltsstoffe)\s*[:：]\s*/i, "")
    .replace(/\b(?:inactive ingredients?|may contain|peu(?:t|vent) contenir|puede contener|kann enthalten)\s*[:：]?\s*/gi, ", ");

  // ...and truncate at whatever shares the back of the label. Legal
  // boilerplate and net-quantity marks reliably follow the formula, and
  // without this the last ingredient is stored as "glycerin. made in
  // nigeria" — a junk name that reaches the shared `ingredients` dictionary
  // as a stub, and that no exact-name lookup (the UV-filter and acid lists
  // in the ingredient fallback, for two) can match. `lib/inci.ts` and
  // `import-obf.mjs` have always done this; this parser simply never did.
  const stop =
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법|\b(?:e\s*)?\d{2,4}\s*(?:ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b|\bstorage\b)/i
      .exec(withoutHeading);
  const block = stop ? withoutHeading.slice(0, stop.index) : withoutHeading;

  // A full stop inside brackets ("(Vit. E)") is part of the qualifier, not the
  // end of a name: without this, "Tocopheryl Acetate (Vit. E)" split into
  // "tocopheryl acetate (vit" and "e)". Same guard as `lib/inci.ts`; the
  // stand-in is written as an escape so it survives editors that hide
  // private-use characters.
  const bracketGuarded = block.replace(/\([^)]*\)/g, (group) => group.replace(/\./g, "\uE001"));
  // An abbreviation's own full stop is not a separator either: "Vit. E", or a genus
  // abbreviated at the start of an item ("C. Sinensis Leaf Extract"). Same rule as
  // `lib/inci.ts`.
  const guarded = bracketGuarded.replace(
    /(^|[;,.]\s*)[A-Za-z]\.(?=\s)|\b(?:vit|spp|sp|var|ssp|subsp)\.(?=\s)/gi,
    (stop) => stop.replace(/\.$/, "\uE001")
  );

  const parsed = guarded
    // A comma directly between two digits belongs to the name —
    // "1,2-Hexanediol" is one ingredient, and splitting there yields a bare
    // "1" and an orphaned "2-hexanediol". Kept in step with `lib/inci.ts`.
    .split(/[;]|,(?!\d)|\.(?=\s)/)
    .map((part) => normalise(part.replace(/\uE001/g, ".")))
    // No dictionary here, so a long real name (a fermented extract naming a dozen
    // species) cannot be recognised as known: it is exempt from the word limit only,
    // and every other check still reads the whole name.
    .filter((part) => part.length > 1 && part.length < 120 && isPlausibleIngredientName(part, true));

  return dedupe(parsed);
}

/**
 * `product_ingredients` is keyed on (product_id, position), not inci_name —
 * nothing stops two rows naming the same ingredient, and a real label does
 * repeat one: `ci 77491` in a tinted product, `parfum` a second time under a
 * fragrance-allergen disclosure. The client keys rows by inci_name (its `id`
 * is the ingredient name, not the position), so a genuine duplicate crashes
 * into a React key collision there. First occurrence wins. Kept in step with
 * the identical function in `supabase/functions/label-ocr/index.ts` and
 * `lib/inci.ts`.
 */
function dedupe(names: string[]): { inci_name: string; position: number }[] {
  const seen = new Set<string>();
  const out: { inci_name: string; position: number }[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ inci_name: name, position: out.length });
  }
  return out;
}

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
