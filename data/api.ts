import { isSupabaseConfigured, LOOKUP_FUNCTION, OCR_FUNCTION, supabase } from "@/lib/supabase";
import { INGREDIENTS } from "./ingredients";
import { PRODUCTS } from "./products";
import type {
  BodyArea,
  Ingredient,
  Product,
  ProductType,
  ProductWithIngredients,
  SafetyLevel,
} from "./types";

/**
 * THE SWAP POINT.
 *
 * Every screen reads catalog data through these functions and nothing else —
 * no component imports the mock files directly, and every signature is async.
 *
 * This file now has two backends behind those signatures:
 *
 *   Supabase        used whenever EXPO_PUBLIC_SUPABASE_URL and _ANON_KEY are
 *                   set. Real products from Open Beauty Facts, INCI API and
 *                   our curated K-beauty seed.
 *   Sample catalog  the eight fabricated products, used when they are not.
 *
 * The fallback is deliberate rather than transitional: a fresh checkout with
 * no credentials still runs, and the sample data keeps the test suite
 * hermetic.
 */

const usingSupabase = () => isSupabaseConfigured && supabase !== null;

/**
 * Whether to render photography that came with the catalogue data.
 *
 * OFF. Open Beauty Facts photos are all user uploads — the API exposes only
 * `uploader`, `uploaded_t` and pixel sizes, with no field separating an
 * official pack shot from someone holding the bottle in a bathroom mirror.
 * Many are review snapshots. There is no reliable way to tell them apart, so
 * none are shown and `ProductIllustration` renders instead.
 *
 * Enforced here, at the read boundary, rather than only at import: rows
 * written by an earlier import still hold their URLs, and this guarantees
 * nothing reaches a screen regardless of what is in the database. Flip to
 * true only when a source of genuine product photography exists.
 */
const SHOW_SOURCE_PHOTOS = false;

/**
 * Simulated latency for the sample catalog, so loading states are exercised
 * while developing. Development only: it must never delay a real network call
 * in production, and must not run under test, where pending timers slow the
 * suite and leave Jest workers hanging at teardown.
 */
const IS_TEST =
  typeof process !== "undefined" && process.env?.NODE_ENV === "test";
const LATENCY_MS =
  !IS_TEST && typeof __DEV__ !== "undefined" && __DEV__ ? 180 : 0;

function delay<T>(value: T): Promise<T> {
  if (LATENCY_MS === 0) return Promise.resolve(value);
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function resolveIngredients(product: Product): ProductWithIngredients {
  return {
    ...product,
    ingredients: product.ingredientIds.map(
      (id): Ingredient =>
        INGREDIENTS[id] ?? {
          id,
          name: id,
          comedogenic: 0,
          safety: "caution",
          note: "No data for this ingredient yet.",
        }
    ),
  };
}

// ── Supabase row mapping ────────────────────────────────────────────────────

/**
 * The shape PostgREST returns for the nested select below. Ingredients arrive
 * as join rows carrying their `position`, because INCI order is regulated
 * information — entries are listed in descending concentration, so second and
 * thirtieth mean very different things — and PostgREST does not promise order.
 */
type CatalogueRow = {
  id: string;
  barcode: string | null;
  brand: string;
  name: string;
  type: string;
  area: string;
  description: string | null;
  image_url: string | null;
  volume: string | null;
  price_krw: number | null;
  in_stock: boolean;
  suitable_for: string[];
  targets: string[];
  attribution: string | null;
  fetched_at: string | null;
  product_ingredients: {
    position: number;
    ingredients: {
      inci_name: string;
      comedogenic: number | null;
      safety: SafetyLevel;
      note: string | null;
      verified: boolean;
      functions: string[] | null;
    } | null;
  }[];
};

const SELECT = `
  id, barcode, brand, name, type, area, description, image_url, volume,
  price_krw, in_stock, suitable_for, targets, attribution, fetched_at,
  product_ingredients ( position, ingredients ( inci_name, comedogenic, safety, note, verified, functions ) )
`;

function rowToProduct(row: CatalogueRow): ProductWithIngredients {
  const ingredients = row.product_ingredients
    .filter((join) => join.ingredients !== null)
    .sort((a, b) => a.position - b.position)
    .map((join) => {
      const source = join.ingredients as NonNullable<typeof join.ingredients>;
      return {
        id: source.inci_name,
        name: source.inci_name,
        // Most ingredients have no published comedogenic rating. It maps to 0
        // so the scale stays numeric, but `note` is what the UI shows, so a
        // gap is never rendered as a measured clean bill of health.
        comedogenic: (source.comedogenic ?? 0) as Ingredient["comedogenic"],
        safety: source.safety,
        note: source.note ?? undefined,
        verified: source.verified,
        functions: source.functions ?? undefined,
      };
    });

  return {
    id: row.id,
    barcode: row.barcode ?? "",
    brand: row.brand,
    name: row.name,
    type: row.type as ProductType,
    area: row.area as BodyArea,
    price: row.price_krw ?? 0,
    volume: row.volume ?? "",
    suitableFor: row.suitable_for as ProductWithIngredients["suitableFor"],
    targets: row.targets as ProductWithIngredients["targets"],
    description: row.description ?? "",
    // Real sources return a formula and a label, not copywriting.
    benefits: [],
    imageUrl: SHOW_SOURCE_PHOTOS ? row.image_url : null,
    attribution: row.attribution,
    fetchedAt: row.fetched_at ?? undefined,
    ingredientIds: ingredients.map((i) => i.id),
    inStock: row.in_stock,
    ingredients,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export type ProductFilters = {
  type?: ProductType | "all";
  area?: BodyArea;
};

/**
 * Returns products with ingredients resolved. The list screen needs them:
 * scoring reads the formula, not just the product-level tags, so that a
 * product whose INCI list contradicts its marketing cannot be surfaced as a
 * good match.
 */
export async function fetchProducts(
  filters: ProductFilters = {}
): Promise<ProductWithIngredients[]> {
  const { type = "all", area } = filters;

  if (usingSupabase()) {
    let query = supabase!.from("products").select(SELECT);
    if (type !== "all") query = query.eq("type", type);
    if (area) query = query.eq("area", area);

    const { data, error } = await query;
    if (error) throw new Error(`fetchProducts: ${error.message}`);
    return (data as unknown as CatalogueRow[]).map(rowToProduct);
  }

  const results = PRODUCTS.filter((p) => type === "all" || p.type === type)
    .filter((p) => !area || p.area === area)
    .map(resolveIngredients);
  return delay(results);
}

export async function fetchProduct(
  id: string
): Promise<ProductWithIngredients | null> {
  if (usingSupabase()) {
    const { data, error } = await supabase!
      .from("products")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`fetchProduct: ${error.message}`);
    return data ? rowToProduct(data as unknown as CatalogueRow) : null;
  }

  const product = PRODUCTS.find((p) => p.id === id);
  return delay(product ? resolveIngredients(product) : null);
}

/** Used by the compare and saved screens, which need several at once. */
export async function fetchProductsByIds(
  ids: string[]
): Promise<ProductWithIngredients[]> {
  if (ids.length === 0) return [];

  if (usingSupabase()) {
    const { data, error } = await supabase!
      .from("products")
      .select(SELECT)
      .in("id", ids);
    if (error) throw new Error(`fetchProductsByIds: ${error.message}`);
    return (data as unknown as CatalogueRow[]).map(rowToProduct);
  }

  const results = ids
    .map((id) => PRODUCTS.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p))
    .map(resolveIngredients);
  return delay(results);
}

/** Distinct product types present in the catalog, for the filter bar. */
export async function fetchProductTypes(): Promise<ProductType[]> {
  if (usingSupabase()) {
    const { data, error } = await supabase!.from("products").select("type");
    if (error) throw new Error(`fetchProductTypes: ${error.message}`);
    return [
      ...new Set((data as { type: string }[]).map((r) => r.type)),
    ] as ProductType[];
  }

  return delay([...new Set(PRODUCTS.map((p) => p.type))]);
}

/**
 * Barcode lookup for the scanner. A miss is an ordinary outcome here (an
 * unrecognised bottle), not a bad request.
 *
 * This is the one call that does not read the table directly. It goes through
 * an Edge Function because the cascade behind it — our catalogue, then Open
 * Beauty Facts, then INCI API — needs a third-party key that must never be
 * shipped in the bundle, and because a fresh fetch has to be written back with
 * the right licence terms attached.
 */
export async function fetchProductByBarcode(
  barcode: string
): Promise<ProductWithIngredients | null> {
  if (usingSupabase()) {
    const { data, error } = await supabase!.functions.invoke(LOOKUP_FUNCTION, {
      body: { barcode },
    });
    if (error) {
      // A 404 from the cascade means "in no source we consulted", which is a
      // null result, not a failure. Anything else is worth surfacing.
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 404) return null;
      throw new Error(`fetchProductByBarcode: ${error.message}`);
    }
    return data ? rowToProduct(data as CatalogueRow) : null;
  }

  const product = PRODUCTS.find((p) => p.barcode === barcode);
  return delay(product ? resolveIngredients(product) : null);
}

/**
 * Read a product's ingredient list off a photograph of its label.
 *
 * The tier that makes a scan-first app viable. Barcode lookup misses almost
 * everything in this market — Open Beauty Facts holds 37 products tagged South
 * Korea against a market of 10,000+ SKUs — but the formula is printed on the
 * box in the user's hand. The result is written back against the barcode, so
 * the next person to scan the same product gets an instant hit.
 */
export type LabelAnalysis =
  | { ok: true; product: ProductWithIngredients; recognised: number; total: number }
  | { ok: false; reason: "not_configured" | "unreadable" | "too_little_text" | "rate_limited"; rawText?: string };

export async function analyseLabel(
  imageBase64: string,
  opts: { barcode?: string; name?: string; brand?: string } = {}
): Promise<LabelAnalysis> {
  if (!usingSupabase()) return { ok: false, reason: "not_configured" };

  const { data, error } = await supabase!.functions.invoke(OCR_FUNCTION, {
    body: { imageBase64, ...opts },
  });

  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) return { ok: false, reason: "rate_limited" };
    if (status === 422) return { ok: false, reason: "too_little_text" };
    if (status === 503) return { ok: false, reason: "not_configured" };
    return { ok: false, reason: "unreadable" };
  }

  if (!data?.product) return { ok: false, reason: "unreadable" };

  return {
    ok: true,
    product: rowToProduct(data.product as CatalogueRow),
    recognised: Number(data.recognised ?? 0),
    total: Number(data.total ?? 0),
  };
}

/**
 * Search the catalogue by name or brand — the design's third scan mode, and
 * the graceful degradation when there is no usable camera. That matters on
 * web, where SDK 54's expo-camera decodes QR codes only.
 */
export async function searchProducts(query: string): Promise<ProductWithIngredients[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  if (usingSupabase()) {
    const escaped = trimmed.replace(/[%,()]/g, " ");
    const { data, error } = await supabase!
      .from("products")
      .select(SELECT)
      .or(`name.ilike.%${escaped}%,brand.ilike.%${escaped}%`)
      .limit(20);
    if (error) throw new Error(`searchProducts: ${error.message}`);
    return (data as unknown as CatalogueRow[]).map(rowToProduct);
  }

  const needle = trimmed.toLowerCase();
  return delay(
    PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) || p.brand.toLowerCase().includes(needle)
    ).map(resolveIngredients)
  );
}
