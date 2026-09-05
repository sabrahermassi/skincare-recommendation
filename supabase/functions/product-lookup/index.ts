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

import {
  callerKey,
  json,
  preflight,
  withinRateLimit,
  type RateLimit,
} from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INCI_API_KEY = Deno.env.get("INCI_API_KEY") ?? "";

const OBF_BASE = "https://world.openbeautyfacts.org/api/v2";
const INCI_BASE = "https://inciapi.com/v1";
/** Identity-only fallback. Free trial tier, no key. */
const UPCITEMDB_BASE = "https://api.upcitemdb.com/prod/trial/lookup";

/** Open Beauty Facts asks that clients identify themselves. */
const USER_AGENT = "Skintel/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";

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
  barcode_db: "Product identified via UPCitemdb. Ingredients not available from this source.",
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
  price_krw, in_stock, suitable_for, targets, attribution,
  product_ingredients ( position, ingredients ( inci_name, comedogenic, safety, note, verified ) )
`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  let barcode: string;
  try {
    ({ barcode } = await req.json());
  } catch {
    return json(req, { error: "Body must be JSON" }, 400);
  }

  // EAN-13/8 and UPC-A/E are all digits. Rejecting anything else here keeps
  // arbitrary strings out of both the upstream APIs and the database.
  if (typeof barcode !== "string" || !/^\d{8,14}$/.test(barcode)) {
    return json(req, { error: "barcode must be 8-14 digits" }, 400);
  }

  if (!withinRateLimit(callerKey(req), RATE_LIMIT)) {
    return json(req, { error: "Too many requests" }, 429);
  }

  // 1 ── our own catalogue, which already excludes anything past its deadline
  const existing = await db
    .from("products")
    .select(SELECT)
    .eq("barcode", barcode)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();
  if (existing.data) return json(req, existing.data, 200);

  // Each remaining source is a third-party call over the network, so a DNS
  // failure, timeout or outage in one must fall through to the next rather
  // than crash the whole lookup — a barcode that is genuinely nowhere is an
  // ordinary 404, not a 500.
  const safely = async (fn: () => Promise<Fetched | null>): Promise<Fetched | null> => {
    try {
      return await fn();
    } catch (err) {
      console.error("lookup source failed:", err);
      return null;
    }
  };

  // A write failure here must not read as "not found" (wrong — the product IS
  // in the source that was just consulted) or as success with a body the
  // client then can't render. Per the security guidance the client gets a
  // generic message; the detail goes to the server log only.
  const persistOrFail = async (fetched: Fetched): Promise<Response> => {
    try {
      return json(req, await persist(fetched), 200);
    } catch (err) {
      console.error("persist failed:", err);
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

  // 4 ── identity-only. Cannot produce a verdict, but turns a blank failure
  //      into a named product plus an invitation to photograph the label.
  const identity = await safely(() => lookupBarcodeDb(barcode));
  if (identity) return persistOrFail(identity);

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
  if (!res.ok) return null;

  const body = await res.json();
  if (body.status !== 1 || !body.product) return null;

  const p = body.product;
  const name = (p.product_name ?? "").trim();
  const inci = (p.ingredients_text ?? "").trim();
  // A record with no name or no formula is worse than nothing: it would occupy
  // the barcode permanently and stop the better source ever being consulted.
  if (!name || !inci) return null;

  return {
    product: {
      id: `obf-${barcode}`,
      barcode,
      brand: (p.brands ?? "Unknown").split(",")[0].trim(),
      name,
      type: guessType(p.categories_tags ?? [], name),
      area: guessArea(p.categories_tags ?? [], name),
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
    ingredients: parseInci(inci),
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
  if (!res.ok) return null; // 404 product_not_found / invalid_barcode

  const p = await res.json();
  if (!p?.name) return null;

  const category: string[] = Array.isArray(p.category) ? p.category : [];

  return {
    product: {
      id: `inci-${barcode}`,
      barcode,
      brand: p.brand ?? "Unknown",
      name: p.name,
      type: guessType(category, p.name),
      area: guessArea(category, p.name),
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
    ingredients: parseInci(typeof p.ingredients === "string" ? p.ingredients : ""),
  };
}

/**
 * Generic barcode database. Deliberately last: it resolves *what* a product is
 * but carries no ingredient list, and the ingredient list is the entire point.
 * Verified against 8809416470511 — returned "COSRX Low pH Good Morning Gel
 * Cleanser", brand, nine retailer images, and no ingredients field at all.
 *
 * Images are not stored. Those nine URLs point at Target, Walmart and Macy's
 * CDNs: real pack shots, but hotlinking another company's CDN is both legally
 * grey and operationally fragile.
 */
async function lookupBarcodeDb(barcode: string): Promise<Fetched | null> {
  const res = await fetch(`${UPCITEMDB_BASE}?upc=${encodeURIComponent(barcode)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;

  const body = await res.json().catch(() => null);
  const item = body?.items?.[0];
  if (!item?.title) return null;

  return {
    product: {
      id: `upc-${barcode}`,
      barcode,
      brand: (item.brand ?? "Unknown").trim(),
      name: String(item.title).trim().slice(0, 200),
      type: guessType([], `${item.category ?? ""} ${item.title}`),
      area: guessArea([], `${item.category ?? ""} ${item.title}`),
      description: null,
      image_url: null,
      volume: null,
      in_stock: true,
      suitable_for: [],
      targets: [],
      source: "barcode_db",
      attribution: ATTRIBUTION.barcode_db,
      expires_at: null,
    },
    ingredients: [], // the whole point: this source has none
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
  const { error } = await db.rpc("replace_product_with_ingredients", {
    p_product: product,
    p_ingredients: ingredients,
    p_stub_note: "No published rating for this ingredient yet.",
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
  const withoutHeading = text.replace(/^\s*(?:full\s+|all\s+)?ingredients?\s*[:：]\s*/i, "");

  const parsed = withoutHeading
    // A comma directly between two digits belongs to the name —
    // "1,2-Hexanediol" is one ingredient, and splitting there yields a bare
    // "1" and an orphaned "2-hexanediol". Kept in step with `lib/inci.ts`.
    .split(/[;]|,(?!\d)/)
    .map((part) => normalise(part))
    .filter((part) => part.length > 1 && part.length < 120);

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

/**
 * Best-effort mapping onto our product types. Deliberately falls back to
 * "serum" rather than inventing a new type, because the browse filter bar is
 * driven by this closed set.
 */
function guessType(tags: string[], text: string): string {
  const haystack = `${tags.join(" ")} ${text}`.toLowerCase();
  const table: [RegExp, string][] = [
    [/hand.?cream/, "hand-cream"],
    [/body.?(wash|gel)|shower/, "body-wash"],
    [/body.?(lotion|milk|butter)/, "body-lotion"],
    [/cleanser|foam|cleansing|micellar/, "cleanser"],
    [/sun|spf|uv/, "sunscreen"],
    [/toner|tonic/, "toner"],
    [/essence/, "essence"],
    [/ampoule/, "ampoule"],
    [/serum/, "serum"],
    [/cream|moisturi[sz]er|lotion|emulsion/, "moisturizer"],
  ];
  for (const [pattern, type] of table) if (pattern.test(haystack)) return type;
  return "serum";
}

function guessArea(tags: string[], text: string): string {
  return /body|hand|foot|shower/.test(`${tags.join(" ")} ${text}`.toLowerCase())
    ? "body"
    : "face";
}
