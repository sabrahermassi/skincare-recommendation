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

/** Per-device budget. Generous for a human in a shop, useless for a scraper. */
const RATE_LIMIT = { windowSeconds: 60, maxRequests: 20 };

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
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let barcode: string;
  try {
    ({ barcode } = await req.json());
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  // EAN-13/8 and UPC-A/E are all digits. Rejecting anything else here keeps
  // arbitrary strings out of both the upstream APIs and the database.
  if (typeof barcode !== "string" || !/^\d{8,14}$/.test(barcode)) {
    return json({ error: "barcode must be 8-14 digits" }, 400);
  }

  const caller = deviceKey(req);
  if (!(await withinRateLimit(caller))) {
    return json({ error: "Too many requests" }, 429);
  }

  // 1 ── our own catalogue, which already excludes anything past its deadline
  const existing = await db
    .from("products")
    .select(SELECT)
    .eq("barcode", barcode)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();
  if (existing.data) return json(existing.data, 200);

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

  // 2 ── Open Beauty Facts: the only source we may keep permanently
  const fromObf = await safely(() => lookupOpenBeautyFacts(barcode));
  if (fromObf) return json(await persist(fromObf), 200);

  // 3 ── INCI API: better data, but cached under their terms, not owned
  if (INCI_API_KEY) {
    const fromInci = await safely(() => lookupInciApi(barcode));
    if (fromInci) return json(await persist(fromInci), 200);
  }

  // 4 ── identity-only. Cannot produce a verdict, but turns a blank failure
  //      into a named product plus an invitation to photograph the label.
  const identity = await safely(() => lookupBarcodeDb(barcode));
  if (identity) return json(await persist(identity), 200);

  return json({ error: "Not found in any source" }, 404);
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

async function persist(fetched: Fetched) {
  const { product, ingredients } = fetched;

  // Ingredients we've never seen are inserted unrated rather than guessed at.
  // A fabricated comedogenic rating would be indistinguishable from a measured
  // one, which is the one mistake this table must not make.
  if (ingredients.length > 0) {
    await db.from("ingredients").upsert(
      ingredients.map((i) => ({
        inci_name: i.inci_name,
        source: "curated",
        safety: "safe",
        // Parsed off a label, not matched to CosIng. The UI says so.
        verified: false,
        note: "No published rating for this ingredient yet.",
      })),
      { onConflict: "inci_name", ignoreDuplicates: true }
    );
  }

  await db.from("products").upsert(product, { onConflict: "id" });

  const id = product.id as string;
  await db.from("product_ingredients").delete().eq("product_id", id);
  if (ingredients.length > 0) {
    await db.from("product_ingredients").insert(
      ingredients.map((i) => ({ product_id: id, inci_name: i.inci_name, position: i.position }))
    );
  }

  const { data } = await db.from("products").select(SELECT).eq("id", id).maybeSingle();
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

  return (
    withoutHeading
      // A comma directly between two digits belongs to the name —
      // "1,2-Hexanediol" is one ingredient, and splitting there yields a bare
      // "1" and an orphaned "2-hexanediol". Kept in step with `lib/inci.ts`.
      .split(/[;]|,(?!\d)/)
      .map((part) => normalise(part))
      .filter((part) => part.length > 1 && part.length < 120)
      .map((inci_name, position) => ({ inci_name, position }))
  );
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

// ── Rate limiting ───────────────────────────────────────────────────────────

const hits = new Map<string, number[]>();

/**
 * In-memory and therefore per-instance, which is the right trade here: it
 * costs nothing, survives the only case that matters (one client looping), and
 * a burst spread across cold starts is still bounded by the upstream quota.
 */
async function withinRateLimit(key: string): Promise<boolean> {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT.windowSeconds * 1000;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT.maxRequests) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

function deviceKey(req: Request): string {
  return (
    req.headers.get("x-device-id") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
