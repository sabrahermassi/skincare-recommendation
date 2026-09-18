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
import {
  json,
  preflight,
  enforceRateLimit,
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

  // Parsed before the type is decided, not after, so the ingredient fallback
  // below has something to read. A live scan that skipped it stored "unknown"
  // for a product the importer would have typed from the same formula — the
  // same barcode ending up with two different types depending on how it
  // arrived.
  const ingredients = parseInci(inci);
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
  if (!res.ok) return null; // 404 product_not_found / invalid_barcode

  const p = await res.json();
  if (!p?.name) return null;

  const category: string[] = Array.isArray(p.category) ? p.category : [];
  // Same ordering as the OBF branch above, and for the same reason.
  const ingredients = parseInci(typeof p.ingredients === "string" ? p.ingredients : "");
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

  const text = `${item.category ?? ""} ${item.title}`;

  // This source indexes every barcode there is, not just cosmetics, and it
  // returns no ingredients — so an unfiltered hit writes a row the app can
  // only ever render as "we know this product but not what's in it". The
  // catalogue currently holds a bag of ORGANIC BLUE CORN TORTILLA CHIPS,
  // brand "N/A", typed as a serum, which arrived exactly this way.
  //
  // A miss is the better outcome: the user is told we don't have it and
  // offered the label-photo path, which works on anything.
  if (!looksCosmetic(text)) return null;

  const type = guessType([], text);
  // A mask/patch hit needs more than the generic cosmetic check above —
  // see hasSkincareContext's own comment for why.
  if (MASK_OR_PATCH_TYPES.has(type) && !hasSkincareContext(text)) return null;

  return {
    product: {
      id: `upc-${barcode}`,
      barcode,
      brand: (item.brand ?? "Unknown").trim(),
      name: String(item.title).trim().slice(0, 200),
      type,
      // See the note on the other `area: "face"` above.
      area: "face",
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

  // ...and truncate at whatever shares the back of the label. Legal
  // boilerplate and net-quantity marks reliably follow the formula, and
  // without this the last ingredient is stored as "glycerin. made in
  // nigeria" — a junk name that reaches the shared `ingredients` dictionary
  // as a stub, and that no exact-name lookup (the UV-filter and acid lists
  // in the ingredient fallback, for two) can match. `lib/inci.ts` and
  // `import-obf.mjs` have always done this; this parser simply never did.
  const stop =
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법|\b(?:e\s*)?\d{2,4}\s*(?:ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b)/i
      .exec(withoutHeading);
  const block = stop ? withoutHeading.slice(0, stop.index) : withoutHeading;

  const parsed = block
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
 * Whether a barcode-database hit is plausibly a cosmetic at all.
 *
 * Positive evidence required, rather than a denylist of everything that is
 * not skincare — that list has no end, and the failure mode of guessing wrong
 * is a food product sitting in a skincare catalogue.
 *
 * One narrow, bounded exclusion sits ahead of that positive check: medical
 * and PPE items that also carry a cosmetic-sounding word of their own. A
 * surgical "Disposable 3-Ply Face Mask" matches on "face"; an "Nexcare
 * Opticlude Orthoptic Eye Patch" (lazy-eye therapy, not skincare) reaches
 * `guessType`'s own `eye-patch`/`face-mask` rules the same way. This generic
 * barcode database mixes cosmetics with every other kind of merchandise and
 * often categorises both under a broad "Health & Beauty", so the positive
 * check alone isn't enough for these two specific product families (found on
 * PR #129). Unlike the open-ended "not skincare" denylist this comment
 * already argues against, this one only needs to name the handful of medical
 * terms that collide with a real cosmetic word — nothing else needs
 * excluding, because nothing else passes the positive check by accident.
 */
function looksCosmetic(text: string): boolean {
  if (/disposable|surgical|\bn95\b|\bkn95\b|respirator|orthoptic|\bply\b|\bppe\b/i.test(text)) {
    return false;
  }
  return /beauty|cosmetic|personal care|skin|face|facial|body care|hair care|lotion|cream|crème|creme|serum|cleanser|shampoo|toner|sunscreen|spf|balm|moisturi|nettoyant|reinigings|limpiador|crema/i
    .test(text);
}

/** `guessType` results that need `hasSkincareContext` on top of `looksCosmetic`. */
const MASK_OR_PATCH_TYPES = new Set(["face-mask", "eye-patch", "pimple-patch"]);

/**
 * Extra evidence a mask/patch hit from the barcode database needs, on top of
 * `looksCosmetic` passing.
 *
 * "mask" and "patch" are the only two of this app's product families that
 * collide with ordinary medical devices and sleep accessories in plain
 * English — nothing else `guessType` produces has this problem. A "Reusable
 * Cloth Face Mask", a "Silk Sleep Eye Mask" and an "Amblyopia Eye Patch" are
 * none of them disposable, surgical or orthoptic, so `looksCosmetic`'s own
 * exclusion list doesn't catch them either (found on PR #129, second time).
 * Growing that denylist to name every non-skincare mask/patch is the same
 * open-ended list `looksCosmetic`'s own doc comment already argues against —
 * so this requires the opposite: affirmative skincare vocabulary, not just
 * the absence of a few known-medical words. English-only and not
 * exhaustive, like every other pattern in this file — extended only when a
 * real catalogue example is seen failing it.
 */
// "cleans" (cleanser, cleansing, cleanse) added on top of the original
// wordlist: a UPC hit like "Deep Cleansing Face Mask" carried none of the
// other words and was wrongly rejected (found on PR #129, third round).
// Narrow on purpose — no protective or PPE mask markets itself as
// "cleansing", so this doesn't reopen the gap this function exists to
// close.
function hasSkincareContext(text: string): boolean {
  return /hydrogel|collagen|skin.?care|cosmetic|k-?beauty|korean|\bsheet\b|\bclay\b|blemish|acne|pimple|hyaluronic|serum|under.?eye|moistur|hydrat|brighten|exfoliat|vitamin|retinol|niacinamide|\bpeel\b|essence|cleans/i
    .test(text);
}

/**
 * Best-effort mapping onto our product types. Falls back to "unknown" rather
 * than inventing a type — see the comment at the bottom of this function for
 * why a wrong specific guess is worse than an honest "we don't know". The
 * browse filter bar is driven by this same closed set (`ProductType`).
 *
 * The patterns were English-only, and this catalogue is not: "CeraVe
 * Schuimende Reinigingsgel", "nettoyant moussant visage" and "Huile lavante
 * Lipikar" are all cleansers that fell through to "serum", which then scored
 * them as leave-on (contact weight 1.0 instead of 0.25) and overstated both
 * their actives and their irritants. The added terms are the ones that
 * actually appear on labels in this catalogue's languages. The 16 patterns
 * below "hand-cream" follow the same rule: English-only until a real
 * catalogue entry is seen failing in another language — not translated
 * preemptively.
 *
 * Ordering matters — earlier entries win, so anything that could be mistaken
 * for a broader pattern further down has to come first. Two cases mattered
 * enough to call out: "body butter" used to fall into `body-lotion`'s
 * `butter` alternative, so that's been removed from `body-lotion` now that
 * `body-butter` is its own type and checked first; and `eye-cream` /
 * `night-mask` / `foot-cream` all contain "cream" and have to be checked
 * before the generic `moisturizer` catch-all or they'd never be reached.
 * `micellar-water` sits directly above the generic cleanser rule for the
 * same reason — it used to be one of that rule's own alternatives, and a
 * bare word match can't tell "micellar" and "foam" apart once they're
 * merged into one pattern.
 */
function guessType(tags: string[], text: string): string {
  const haystack = `${tags.join(" ")} ${text}`.toLowerCase();
  const table: [RegExp, string][] = [
    [/hand.?cream|crème mains|handcreme/, "hand-cream"],
    [/eye[\s-]?cream/, "eye-cream"],
    [/body.?butter/, "body-butter"],
    [/body.?(wash|gel)|shower|douche|duschgel/, "body-wash"],
    [/body.?scrub|body.?exfoliat/, "body-scrub"],
    [/body.?(lotion|milk)|body ?lotion|lait corporel/, "body-lotion"],
    [/foot[\s-]?(cream|balm)/, "foot-cream"],
    // Above the sunscreen rule on purpose: "Lip Balm SPF 15" is a lip balm,
    // and `spf` below would otherwise claim it first.
    // "lèvres" (fr), "dudak" (tr), "губ" (ru/uk) — all seen failing for real.
    [/lip[\s-]?(balm|butter|care)|l[èe]vres|dudak|губ/, "lip-balm"],
    // Both above the cleanser rule: "Deep Cleansing Shampoo" carries both
    // words, and tags and name share one haystack, so `cleansing` would take
    // it even when the row is tagged `en:shampoos`.
    [/shampoo/, "shampoo"],
    // Not a bare `conditioner`: "Skin Conditioner" is a face product, and it
    // was being given the hair-conditioner label and illustration.
    [/(?<!skin[\s-])conditioner/, "conditioner"],
    // Every mask and patch rule sits above the cleanser rule below on
    // purpose: "Deep Cleansing Mask", "Masque nettoyant" (fr) and "Maschera
    // detergente" (it) all carry a cleanser word too, and cleanser used to
    // win first — discounting these products' ingredients to rinse-off
    // weight (0.25) when the intended weight is 1 (found on PR #129).
    // "mask"/"pad" both included: an under-eye "eye mask" is the same
    // hydrogel-patch product as an "eye patch" in real skincare naming, not a
    // face mask — must sit before the generic face-mask fallback below. Up
    // to two descriptor words are also allowed between "eye" and the format
    // word (mirroring the pimple-patch rule below): "Eye Gel Mask" and "Eye
    // Firming Sheet Patch" were falling through to the generic face-mask
    // rule and losing their full benefit weight (found on PR #129, second
    // round). The tight zero/one-separator form stays first so a
    // one-word compound like "eyepatch" still matches.
    [/eye(?:[\s-]?(?:patch|pad|mask)|(?:[\s-]+\w+){1,2}[\s-]+(?:patch|pad|mask))/, "eye-patch"],
    // Up to two descriptor words are allowed between the acne/pimple/
    // blemish word and "patch" — real products are marketed this way, and
    // neither "acne" nor "pimple" alone reached "patch" without this
    // (COSRX's "Acne Pimple Master Patch" is the best-known real example,
    // found on PR #129). "patch" stays mandatory, so a bare "Blemish Balm
    // Cream" (a BB cream) or "Pimple Spot Gel" still doesn't match. No bare
    // "hydrocolloid" alternative: that matched a wound/blister dressing with
    // no acne context at all (e.g. from the UPC barcode-database fallback,
    // found on PR #129) — "hydrocolloid" is still recognised when it appears
    // near an acne word, just as one of the allowed filler words. "spot" is
    // not one of the trigger words: "Dark Spot Corrector Patch" is a real,
    // distinct hyperpigmentation category, not an acne patch, and a bare
    // "spot" wrongly claimed it (found on PR #129). "spot" still works as a
    // filler word, so "Acne Spot Patch" still resolves via the "acne" trigger.
    [/(?:pimple|blemish|acne)(?:[\s-]+\w+){0,2}[\s-]+patch/, "pimple-patch"],
    // "sleeping"/"overnight" mask, not a bare "night cream" — that's a real
    // moisturizer, not the K-beauty sleep-mask category. Up to two
    // descriptor words allowed before "mask", same reasoning and same fix as
    // eye-patch above: "Overnight Face Mask" was falling through to the
    // generic face-mask rule (found on PR #129, second round).
    [/(sleeping|night|overnight)(?:[\s-]?mask|(?:[\s-]+\w+){1,2}[\s-]+mask)/, "night-mask"],
    // Same descriptor-word gap fix as night-mask above: "Hydrating Sheet
    // Face Mask" was falling through (found on PR #129, second round).
    [/sheet(?:[\s-]?mask|(?:[\s-]+\w+){1,2}[\s-]+mask)/, "sheet-mask"],
    // Same descriptor-word gap fix: "Argan Repair Hair Mask" was falling
    // through to the generic face-mask rule, same bug class as the three
    // rules above even though Codex's report only named those three.
    [/hair(?:[\s-]?mask|(?:[\s-]+\w+){1,2}[\s-]+mask)/, "hair-mask"],
    // The generic clay/cream jar — "Maske", "Maschera", "masque",
    // "mascarilla" — that none of the three specific mask rules above catch.
    // Started from the same multilingual base `guess-type-from-ingredients.mjs`'s
    // MASK_NAME_PATTERN already used (issue #105), since diverged: this rule
    // asserts a specific type and so carries extra exclusions
    // MASK_NAME_PATTERN doesn't need, because that function only asks "is
    // this any kind of mask" to skip an unrelated serum heuristic — a hair,
    // foot, hand or lip mask should skip that heuristic too. Excludes hair ("hair"
    // itself, plus the French/Italian/Spanish/German words — "capillaire"
    // and the Italian variant "capillare" as well as "capelli" — since
    // "Hair Masque" uses the French loanword spelling and so never reaches
    // the hair-mask rule above) and the other body-part masks ("Foot Mask",
    // "Hand Mask", "Lip Mask") this generic rule has no business claiming —
    // all found on PR #129. Each stays honestly unknown rather than being
    // asserted as a face mask, same principle as the hair-mask exclusion.
    // The same gap existed for French/Spanish/Italian body-part words once
    // Codex looked past the English ones a second time: "mains" (fr, hands),
    // "pieds" (fr, feet), "pies" (es, feet), "labbra" (it, lips), "cheveux"
    // (fr, hair) — added for the same reason as their English counterparts.
    [/^(?!.*(?:\bhair\b|capillaire|capillare|capelli|capilar|haar|\bfoot\b|\bhand\b|\blip\b|\bmains\b|\bpieds\b|\bpies\b|\blabbra\b|\bcheveux\b)).*(?:\bmask(?=[eis]|\b)|\bmaschera|\bmasque|\bmascarilla)/, "face-mask"],
    // Above the generic cleanser rule: a micellar water is wiped off, not
    // rinsed, so it needs its own type rather than falling into `cleanser`'s
    // rinse-off discount (step 13, PR #130). Requiring "water" alongside
    // "micellar" was not enough on its own — Codex found real rinse-off
    // names that carry both words without being adjacent, e.g. "Micellar
    // Water Foaming Cleanser" or "Water Boost Micellar Facial Gel Wash" — so
    // this also excludes any name that carries an explicit rinse-off format
    // word. A name excluded here that also fails to match the generic
    // cleanser rule below falls through to "unknown" rather than being
    // force-typed — the safe outcome, since "unknown" is the same
    // conservative-benefit/full-harm fail-safe this table already uses
    // everywhere else. English-only, like every other pattern in this table
    // until a real catalogue entry is seen failing in another language — no
    // such entry has been seen yet for this one.
    //
    // The leading `^` is load-bearing, not decorative. Every clause here is
    // a zero-width lookahead — nothing is actually consumed — so an
    // unanchored `.test()` doesn't just check the string once: on failure at
    // position 0 it retries at position 1, then 2, and so on, and the
    // negative lookahead only ever looks *forward* from wherever it's
    // currently standing. For "Foaming Micellar Water" that means a retry
    // starting right after "Foaming" sees "Micellar Water" with no
    // exclusion word ahead of it, and matches anyway — the exclusion word
    // was real, it was just behind the scan position instead of ahead of
    // it. Codex caught this with the reverse ordering of the names already
    // fixed above. `^` pins the check to a single evaluation from the true
    // start of the string, so "carries an excluded word anywhere" is what
    // it actually tests, regardless of which side of "micellar"/"water"
    // that word falls on.
    //
    // `\bcleanser\b` rather than a bare substring: `hay` is tags *and* name
    // joined, and OBF's own `en:cleansers` category tag — the one this
    // importer already pulls under, and the one a real micellar water is
    // plausibly tagged with — contains "cleanser" as a substring of
    // "cleansers". An unbounded match excluded every micellar water carrying
    // that tag, which every "Cleansing Micellar Water" test case below does.
    // The other words stay unbounded on purpose: "foam" has to keep matching
    // inside "Foaming" the same way the generic cleanser rule below already
    // does, and none of OBF's real category tags collide with them the way
    // "cleansers" collides with "cleanser".
    [
      /^(?=.*micellar)(?=.*water)(?!.*(\bcleanser\b|foam|wash|gel|nettoyant|lavante?|reinigings|schuimende|limpiador|detergente|waschgel|syndet))/,
      "micellar-water",
    ],
    [
      // nettoyant/lavant (fr), reinigings/schuimende (nl), limpiador (es),
      // detergente (it), waschgel (de) — plus "huile lavante", a washing oil.
      /cleanser|foam|cleansing|nettoyant|lavante?|reinigings|schuimende|limpiador|detergente|waschgel|syndet/,
      "cleanser",
    ],
    [/sun|spf|uv|solaire|zonnebrand/, "sunscreen"],
    [/toner|tonic|lotion tonique/, "toner"],
    [/essence/, "essence"],
    [/ampoule/, "ampoule"],
    [/(facial|face)[\s-]?oil/, "facial-oil"],
    [/hair[\s-]?oil/, "hair-oil"],
    [/serum|sérum/, "serum"],
    [/perfume|eau de (parfum|toilette)/, "perfume"],
    [/(facial|face)[\s-]?mist/, "facial-mist"],
    [/deodorant|antiperspirant/, "deodorant"],
    // No "peel pad" here: a known leave-on acid pad should not receive the
    // ambiguous exfoliator benefit discount. It falls through to the
    // ingredient rule instead, which types it "serum" — full weight.
    [/exfoliat|scrub/, "exfoliator"],
    [/cream|moisturi[sz]er|lotion|emulsion|crème|creme|crema|gezichtscrème/, "moisturizer"],
  ];
  for (const [pattern, type] of table) if (pattern.test(haystack)) return type;
  // Was "serum" — a wrong specific guess reads as more true than an honest
  // "we don't know", which is how a barcode-identified foot cream (title text
  // that matched none of the patterns above) got shown as a Serum on screen.
  return "unknown";
}
