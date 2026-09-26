// Barcode → product, with the cascade and the third-party key kept server-side.
// The decisions live here, kept free of `Deno.env` and of a real database
// client so they can be tested with fakes (supabase/tests/product_lookup.test.ts,
// #203); `index.ts` supplies the real dependencies.
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

import { fetchAliases, fetchDictionary, knownIngredients } from "../_shared/dictionary.ts";
import { readFormula, type FormulaSources } from "../_shared/formula-gate.ts";
import { guessTypeFromIngredients } from "../_shared/guess-type-from-ingredients.ts";
import type { ParsedIngredient } from "../_shared/inci-parse.ts";
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

/**
 * The service-role client, typed loosely for the same reason as `DictionaryDb`:
 * the real one is supabase-js, and the tests pass a fake with the same shape.
 */
// deno-lint-ignore no-explicit-any
export type ProductLookupDb = any;

export type ProductLookupDeps = {
  db: ProductLookupDb;
  /** Reaches Open Beauty Facts and INCI API. */
  fetch: typeof fetch;
  /** Empty when the INCI API is not configured; that source is then skipped. */
  inciApiKey: string;
};

const SELECT = `
  id, barcode, brand, name, type, area, description, image_url, volume,
  price_krw, in_stock, suitable_for, targets, attribution, fetched_at,
  formula_changed_at,
  product_ingredients ( position, ingredients ( inci_name, comedogenic, safety, note, verified, functions ) )
`;

export async function handleProductLookup(req: Request, deps: ProductLookupDeps): Promise<Response> {
  const { db } = deps;
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

  const logScan = (outcome: "resolved" | "not_found" | "quality_gate" | "upstream_failure" | "internal_error") =>
    logScanBounded(req, db, callerSalt(), { path: "barcode", outcome });

  // 1 ── our own catalogue, which already excludes anything past its deadline
  const existing = await db
    .from("products")
    .select(SELECT)
    .eq("barcode", barcode)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();
  // A failed query behaves exactly like "not in our catalogue" below --
  // `existing.data` is falsy either way, so this still falls through to OBF/
  // INCI rather than failing loudly (unchanged from before). `catalogueFailed`
  // only matters for the final classification: without it, a database outage
  // that also comes up empty on every external source logged as an ordinary
  // `not_found`, indistinguishable from a barcode nobody has ever heard of --
  // the same miscount `upstreamFailed` exists to prevent for the sources
  // below. Found in review on #246.
  let catalogueFailed = false;
  if (existing.error) {
    console.error("catalogue lookup failed:", existing.error);
    catalogueFailed = true;
  } else if (existing.data) {
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
  //
  // A failure reading our own dictionary during the gate is ours, not the
  // source's, and is counted as `internal_error` rather than blamed on it.
  let upstreamFailed = false;
  let dictionaryFailed = false;
  const safely = async (fn: () => Promise<Lookup>): Promise<Lookup> => {
    try {
      return await fn();
    } catch (err) {
      console.error("lookup source failed:", err);
      if (err instanceof DictionaryError) dictionaryFailed = true;
      else upstreamFailed = true;
      return null;
    }
  };

  // A source whose text fails the quality gate (#184) is not a hit: nothing
  // is written — the write is the point, since a stored row answers every
  // later scan from the cache above — and the next source is asked instead.
  let gated = false;

  // A write failure here must not read as "not found" (wrong — the product IS
  // in the source that was just consulted) or as success with a body the
  // client then can't render. Per the security guidance the client gets a
  // generic message; the detail goes to the server log only.
  const persistOrFail = async (fetched: Fetched): Promise<Response> => {
    try {
      const data = await persist(db, fetched);
      await logScan("resolved");
      return json(req, data, 200);
    } catch (err) {
      console.error("persist failed:", err);
      await logScan("internal_error");
      return json(req, { error: "Could not save the product" }, 502);
    }
  };

  // 2 ── Open Beauty Facts: the only source we may keep permanently
  const sources = formulaSources(db);
  const fromObf = await safely(() => lookupOpenBeautyFacts(deps, sources, barcode));
  if (fromObf === GATED) gated = true;
  else if (fromObf) return persistOrFail(fromObf);

  // 3 ── INCI API: better data, but cached under their terms, not owned. Kept
  // behind the OBF short-circuit above so a hit there never spends metered
  // quota on the 2,000-request/month tier. An OBF formula the gate refused is
  // not a hit, and this is exactly when their better data is worth the call.
  if (deps.inciApiKey) {
    const fromInci = await safely(() => lookupInciApi(deps, sources, barcode));
    if (fromInci === GATED) gated = true;
    else if (fromInci) return persistOrFail(fromInci);
  }

  // Nothing else is consulted. A product is stored only when it has a name, a
  // barcode and an ingredient list, so a source that knows a barcode but not
  // its formula is no source at all: the client is told "not found" and asks
  // the user for the ingredient list instead — the photo path, which reads
  // the real label rather than someone's edit of it.
  await logScan(
    catalogueFailed || dictionaryFailed
      ? "internal_error"
      : upstreamFailed
        ? "upstream_failure"
        : gated
          ? "quality_gate"
          : "not_found"
  );
  return json(req, { error: "Not found in any source" }, 404);
}

// ── Sources ─────────────────────────────────────────────────────────────────

type Fetched = {
  product: Record<string, unknown>;
  ingredients: ParsedIngredient[];
  /** The parser the formula was read with — see `FormulaRead`. */
  reparse: (text: string) => ParsedIngredient[];
};

/** A source had the barcode, but its formula failed the quality gate. */
const GATED = "gated";

/** A hit, a formula the gate refused, or nothing usable. */
type Lookup = Fetched | typeof GATED | null;

/** Our own dictionary could not be read — ours to report, not the source's. */
class DictionaryError extends Error {}

/**
 * The gate's view of the dictionary. Only ever consulted on a cache miss — a
 * barcode already in the catalogue returns before any of this runs.
 */
function formulaSources(db: ProductLookupDb): FormulaSources {
  return {
    known: (names) =>
      knownIngredients(db, names).catch((err) => {
        throw new DictionaryError(String(err));
      }),
    dictionary: async () => {
      try {
        const [dictionary, aliases] = await Promise.all([fetchDictionary(db), fetchAliases(db)]);
        return { dictionary, aliases };
      } catch (err) {
        throw new DictionaryError(String(err));
      }
    },
  };
}

async function lookupOpenBeautyFacts(
  deps: ProductLookupDeps,
  sources: FormulaSources,
  barcode: string
): Promise<Lookup> {
  const res = await deps.fetch(
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
  const read = await readFormula(inci, sources);
  // Text that parses to no ingredient at all is no formula; text that parses
  // mostly into names nobody recognises is not one we keep.
  if (!read.ok) return read.reason === "gated" ? GATED : null;
  const { ingredients, reparse } = read;
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
    reparse,
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
async function lookupInciApi(
  deps: ProductLookupDeps,
  sources: FormulaSources,
  barcode: string
): Promise<Lookup> {
  const res = await deps.fetch(`${INCI_BASE}/products/${barcode}`, {
    headers: { "X-API-Key": deps.inciApiKey, Accept: "application/json" },
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
  // Same ordering and the same gate as the OBF branch above, for the same
  // reasons. A product with no ingredient list is not one we can judge or store.
  const read = await readFormula(typeof p.ingredients === "string" ? p.ingredients : "", sources);
  if (!read.ok) return read.reason === "gated" ? GATED : null;
  const { ingredients, reparse } = read;
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
    reparse,
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

async function persist(db: ProductLookupDb, fetched: Fetched) {
  const { product, ingredients, reparse } = fetched;
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
  const parserRefresh = isParserOnlyChange(stored ?? [], ingredients, reparse);
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
