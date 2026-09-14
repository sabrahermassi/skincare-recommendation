import { defaultPackagingType } from "@/components/BottleIcon";
import { isSupabaseConfigured, LOOKUP_FUNCTION, OCR_FUNCTION, supabase } from "@/lib/supabase";
import {
  abandonDiskRead,
  addScannedToCatalogue,
  hasCheckedThisLaunch,
  markCheckedThisLaunch,
  msSinceLastCheck,
  peekCatalogue,
  productById,
  productsForType,
  putCatalogue,
  putScanned,
  readCatalogue,
  readScanned,
  touchCatalogue,
  typesFrom,
  watermarksMatch,
  type CatalogueWatermark,
} from "./catalogue-cache";
import { INGREDIENTS } from "./ingredients";
import { PRODUCTS } from "./products";
import type {
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
 * none are shown — every product renders as its `productType`'s illustrated
 * bottle instead (`components/BottleIcon.tsx`), photo or no photo.
 *
 * Enforced here, at the read boundary, rather than only at import: rows
 * written by an earlier import still hold their URLs, and this guarantees
 * nothing reaches a screen regardless of what is in the database. Flip to
 * true only when a source of genuine product photography exists.
 */
const SHOW_SOURCE_PHOTOS = false;

/**
 * Whether a row can be matched back to a physical product by anyone other than
 * the person who created it.
 *
 * A label scanned without a barcode is written to the catalogue anyway
 * (`supabase/functions/label-ocr`, which mints `ocr-<uuid>` when no barcode was
 * supplied) with the placeholder brand "Unknown" and name "Scanned product".
 * That row answers the person holding the bottle perfectly — scoring reads the
 * formula, not the name — but it has no key anyone can reach it by and no words
 * anyone can recognise it from. In a browsable list it is noise that accrues
 * with every user and never leaves.
 *
 * Filtered at the read boundary rather than only at write, for the same reason
 * `SHOW_SOURCE_PHOTOS` is: rows written before this existed are already in the
 * table, and a guarantee that holds regardless of what is stored is worth more
 * than one that depends on every writer having behaved.
 *
 * Deliberately narrow. It excludes these rows from *lists* only — `fetchProduct`
 * and `fetchProductsByIds` still resolve them, because the scanner navigates
 * straight to the result it just created, and a saved or logged product must
 * still open.
 */
function isIdentifiable(row: CatalogueRow): boolean {
  // A name that is just digits is the barcode wearing the name's clothes —
  // imported rows where the source had no title. It renders in Browse and
  // search as a product called "3606000537750", which no one can recognise
  // as the bottle in their hand. Same rule as the OCR case below and for the
  // same reason: findable by id, not offered in a list.
  if (isBarcodeShapedName(row.name)) return false;

  // An absent `source` means the row came from a producer that does not select
  // the column (see `CatalogueRow.source`), not that it is an OCR row. Treating
  // unknown as identifiable is the safe default: the alternative hides real
  // products because of a missing column.
  if (row.source === undefined) return true;
  return !(row.source === "ocr" && row.barcode === null);
}

/**
 * A "name" that is only digits (and separators), long enough to be a barcode
 * rather than a product genuinely called "24" or "100".
 *
 * Deliberately not expressed in `IDENTIFIABLE_SQL`: that form exists to keep
 * `fetchWatermark`'s *count* describing the cached population, and a name
 * predicate there would make the two forms harder to keep in step for a rule
 * that is about presentation, not about what the cache holds. The count may
 * therefore include a few rows the list does not show, which moves the
 * watermark no more often than it already moves.
 */
function isBarcodeShapedName(name: string | null): boolean {
  if (!name) return false;
  const bare = name.replace(/[\s-]/g, "");
  return bare.length >= 6 && /^\d+$/.test(bare);
}

/**
 * The same rule as {@link isIdentifiable}, expressed for PostgREST.
 *
 * Both forms exist on purpose and must move together. The SQL form keeps the
 * *count* in `fetchWatermark` describing the same population the cache holds —
 * without it, one person photographing a label with no barcode changes the
 * global row count, and every other install then sees a moved watermark and
 * pulls a full catalogue to render an identical list. The TypeScript form is
 * what the tests can actually exercise, and it still guards `searchProducts`.
 */
const IDENTIFIABLE_SQL = "source.neq.ocr,barcode.not.is.null";

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

/**
 * How long a network read may hang before it is treated as a failure.
 *
 * A rejected request already has a path through every screen — browse shows
 * "Couldn't load products" with a Try again, the scanner surfaces its own
 * status. A request that never settles had none: the promise stayed pending,
 * the screen's `products` stayed null, and the spinner ran forever with no
 * message and no way to retry. That is the state this bounds.
 *
 * Reads only. `analyseLabel` is deliberately left unbounded — OCR on a photo
 * legitimately takes longer than any figure sensible here, and cutting it off
 * would discard work the user waited for.
 */
const NETWORK_TIMEOUT_MS = 12_000;

/**
 * How long the splash screen will wait for the cached catalogue to come off
 * disk before giving up and rendering anyway.
 *
 * Generous against the ~130ms this actually measures at on device, because the
 * only thing it needs to catch is a storage layer that has stopped answering
 * altogether — and short enough that a user never sits in front of a blank
 * screen wondering whether the app launched.
 */
const WARM_TIMEOUT_MS = 2_000;

// Freshness is checked once per launch, in `warmCatalogue`, and not again —
// the flag itself lives in the cache module so a reset clears it with
// everything else (`hasCheckedThisLaunch`).
//
// The obvious alternative — check whenever a read finds the cache warm — meant
// a request per type-filter tap, because Browse asks for products on every
// filter change. Throttling that on a timer works, but a timer is a proxy for
// the thing actually wanted, and no interval is defensible: five minutes and an
// hour behave identically, because sessions are shorter than either.
//
// A check is only useful at the start of a session anyway. The catalogue
// changes overnight, and one that lands mid-session cannot repaint a screen
// that is already mounted. So it happens exactly once, where it can still
// change what the first screen renders, and `DISK_TTL_MS` stays the hard
// ceiling behind it — including for a memory layer kept alive for days by an OS
// that never killed the app.

/**
 * Rejects if the query built from `attachSignal` has not settled within
 * {@link NETWORK_TIMEOUT_MS}. Takes a builder function, not a built query,
 * because `.abortSignal()` has to land at the right point in each call
 * site's own chain — after `.maybeSingle()` narrows a Supabase builder to a
 * type that no longer exposes `.abortSignal()`, so `fetchProduct`'s call
 * site needs it earlier in the chain than the others do. A single shared
 * "attach it to whatever you're given" version can't express that.
 *
 * Wraps each awaited Supabase read so a hung connection becomes an ordinary
 * error the callers already handle, rather than an indefinite spinner. The
 * timer is always cleared, so a settled request leaves nothing pending for
 * Jest to wait on at teardown.
 *
 * Also aborts the underlying fetch on timeout, not just this wrapper's own
 * promise — the first version of this only gave up on the *UI* side and left
 * the real request running, which meant a hung connection plus Browse's own
 * "Try again" button could pile up several in-flight requests behind one
 * unresponsive network path.
 */
function withTimeout<T>(attachSignal: (signal: AbortSignal) => PromiseLike<T>, label: string): Promise<T> {
  const controller = new AbortController();
  const work = attachSignal(controller.signal);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label}: no response after ${NETWORK_TIMEOUT_MS}ms`));
    }, NETWORK_TIMEOUT_MS);
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

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
  /**
   * Optional because one producer of this shape does not return it: the
   * `product-lookup` Edge Function has its own narrower `SELECT` with no
   * `source` column, and `fetchProductByBarcode` casts that response to this
   * type. Declaring it required would be a type that lies — and the lie would
   * surface as `undefined === "ocr"` quietly evaluating false somewhere.
   * `isIdentifiable` handles the absent case explicitly.
   */
  source?: string;
  brand: string;
  name: string;
  type: string;
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
  id, barcode, brand, name, type, source, description, image_url, volume,
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
        // No real catalogue row carries a comedogenic rating and none should —
        // see `ComedogenicRating` for why. Collapsing the absence to 0 keeps
        // the scale numeric, and callers must read it as "not rated" rather
        // than "rated harmless": every comedogenic branch in `lib/safety.ts`
        // is therefore dead for catalogue products, and pore-clogging is
        // decided by `INGREDIENT_RULES` instead. Left as 0 rather than made
        // nullable because the sample catalogue does rate its ingredients and
        // the two paths share this type.
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
    // Real catalogue rows don't carry a packaging shape yet, so it's derived
    // from the merchandising type they do have.
    productType: defaultPackagingType(row.type as ProductType),
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
};

/**
 * Pull the disk cache into memory before anything renders.
 *
 * Called from the splash gate in `app/_layout.tsx`, which is already waiting
 * on fonts and store rehydration. Without it, Browse mounts with an empty
 * memory layer, draws a skeleton, and only then gets the rows back from disk
 * a tick later — measured at ~130ms on device, which is short but visible.
 * Doing the read behind the splash makes the first frame of the list the real
 * list.
 *
 * Never throws and never touches the network: a cache that cannot be read
 * just leaves the app in the state it would have been in anyway.
 */
/**
 * The session's single freshness check, wherever it is reached from.
 *
 * Not awaited by any caller: the splash must not wait on the network, and the
 * only outcomes are "refetch in the background" and "do nothing".
 */
function checkFreshnessOnce(known: CatalogueWatermark): void {
  if (hasCheckedThisLaunch()) return;
  markCheckedThisLaunch();
  revalidateCatalogue(known);
}

/**
 * How long the app can be away before returning to it is worth a fresh check.
 *
 * A phone does not close an app, it backgrounds it — so "once per launch" can
 * mean once a week. Short enough that a day-old list is never what you come
 * back to; long enough that flicking to another app and straight back costs
 * nothing.
 */
export const FOREGROUND_RECHECK_MS = 5 * 60 * 1000;

/**
 * "Has anything changed?", asked again on returning to the app.
 *
 * The launch check is deliberately once-only, guarded by `hasCheckedThisLaunch`
 * so that several screens mounting together cannot each start one. That guard
 * is right for a launch and wrong for a session: the 24h ceiling only applies
 * to a copy read back from disk, and the memory layer has no expiry at all
 * while the app is open, so a process alive for days would keep serving — and
 * scoring against — the list it read on the first morning.
 *
 * Deliberately not awaited, and silent on failure. The worst outcome is the
 * list you already had.
 */
export function revalidateOnForeground(): void {
  if (!usingSupabase()) return;
  if (msSinceLastCheck() < FOREGROUND_RECHECK_MS) return;

  // Only meaningful against a catalogue we hold. With nothing cached there is
  // no watermark to compare and nothing on screen to correct — the next read
  // goes to the network on its own.
  const entry = peekCatalogue();
  if (!entry) return;

  markCheckedThisLaunch();
  revalidateCatalogue(entry.watermark);
}

export async function warmCatalogue(): Promise<void> {
  if (!usingSupabase()) return;
  try {
    // Bounded, because the splash gate in `app/_layout.tsx` renders nothing
    // until this resolves. `readCatalogue` swallows its own errors, but a
    // storage layer that never *answers* would otherwise leave the app on a
    // blank screen with no error and no retry. Losing the race costs a
    // skeleton on one screen; the read continues in the background and
    // populates the memory layer whenever it does land.
    // The timer is cleared whichever side wins, for the same reason
    // `withTimeout` clears its own: a pending timer keeps Jest workers alive
    // after the suite has finished, and on device it holds a closure for two
    // seconds past a launch that already completed.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = readCatalogue();
    const cached = await Promise.race([
      read,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), WARM_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));

    if (cached) {
      checkFreshnessOnce(cached.watermark);
      return;
    }

    // The timeout won, or there was nothing cached. Those look identical here
    // and are not: a slow read still lands, and if it lands with a catalogue
    // then this launch would otherwise perform no freshness check at all —
    // because reads no longer check either. Following the read to its end
    // closes that hole without holding the splash open for it. A genuine miss
    // resolves null and correctly checks nothing, since the cold fetch that
    // follows is fresher than any check.
    //
    // Release the read first. Surviving the timeout here is only half the job:
    // the same in-flight promise is what `readCatalogue` hands to every later
    // caller, so a read that never settles would leave Browse awaiting it
    // forever — a splash that recovered into a skeleton that cannot. See
    // `abandonDiskRead`; the `then` below still runs if it does land.
    abandonDiskRead();

    void read.then((late) => {
      if (late) checkFreshnessOnce(late.watermark);
    }).catch(() => {
      // `readCatalogue` does not reject; this is belt and braces.
    });
  } catch {
    // Belt and braces — see above.
  }
}

/**
 * Cached rows for a type filter, synchronously, or null if there are none yet.
 *
 * The one non-async member of this seam, and it earns the exception: it lets a
 * screen paint cached products on its first frame instead of showing a
 * skeleton for a tick while an already-resolved cache resolves a promise. It
 * never reaches the network and never touches the disk — a miss just means
 * "ask properly", which every caller already does.
 *
 * "Peek" describes what it costs the caller, not strict purity: asking for a
 * type this session has not filtered by yet builds that filtered array and
 * keeps it, because the whole point is that the same array instance comes back
 * next time. The observable result is identical either way.
 */
export function peekProducts(
  type: ProductType | "all" = "all"
): ProductWithIngredients[] | null {
  if (!usingSupabase()) return null;
  const entry = peekCatalogue();
  return entry ? productsForType(entry, type) : null;
}

/**
 * "Has anything changed?" for ~200 bytes instead of ~937KB.
 *
 * `fetched_at` is already a column and already in `SELECT`, so this needs no
 * schema work: the exact row count plus the newest timestamp catches both
 * kinds of write — a new product moves the count, a rewritten formula moves
 * the timestamp. PostgREST returns the count in a header and `limit(1)` keeps
 * the body to a single date.
 *
 * The second half of that only became true in migration 0009. Before it,
 * nothing wrote `fetched_at` after the insert, so a formula rewrite moved
 * neither term of the key: the watermark matched on the next launch,
 * `touchCatalogue` renewed the 24h window, and a device could serve an
 * obsolete formula indefinitely. This function is unchanged — the fix was to
 * make the column mean what this comment always claimed.
 */
async function fetchWatermark(): Promise<CatalogueWatermark> {
  const { data, error, count } = await withTimeout(
    (signal) =>
      supabase!
        .from("products")
        .select("fetched_at", { count: "exact" })
        .or(IDENTIFIABLE_SQL)
        .order("fetched_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .abortSignal(signal),
    "fetchWatermark",
  );
  if (error) throw new Error(`fetchWatermark: ${error.message}`);

  const rows = (data ?? []) as { fetched_at: string | null }[];
  return { count: count ?? 0, newest: rows[0]?.fetched_at ?? null };
}

/**
 * Rows per request when reading the whole catalogue.
 *
 * PostgREST caps a response server-side, so an unpaginated select is silently
 * truncated rather than refused. Exported for the test that walks more than
 * one page.
 */
export const CATALOGUE_PAGE_SIZE = 1000;

/**
 * Stops a server that ignores `range` from looping forever. At the page size
 * above this is 100k products — far past the point where a whole-catalogue
 * mirror is the right design at all (see `persist`'s AsyncStorage ceiling).
 */
const MAX_CATALOGUE_PAGES = 100;

/**
 * The whole catalogue, unfiltered. Type filtering happens on the device.
 *
 * Paginated, and the ordering is what makes that safe rather than a detail:
 * `range` is an offset into whatever order the server chose, so without a
 * deterministic sort the same row can appear on two pages while another
 * appears on none.
 *
 * Truncation here is worse than a plain missing page, because of what reads
 * the result next. `fetchWatermark` asks for an *exact* count over the same
 * filter, so a truncated fetch is stored under a watermark describing the full
 * table — and every later freshness check then compares that watermark against
 * itself, agrees nothing has changed, and renews the window. The catalogue
 * would settle at one page and never heal.
 */
async function fetchAllRows(): Promise<ProductWithIngredients[]> {
  const rows: CatalogueRow[] = [];

  for (let page = 0; page < MAX_CATALOGUE_PAGES; page++) {
    const from = page * CATALOGUE_PAGE_SIZE;
    const { data, error } = await withTimeout(
      (signal) =>
        supabase!
          .from("products")
          .select(SELECT)
          .or(IDENTIFIABLE_SQL)
          .order("id")
          .range(from, from + CATALOGUE_PAGE_SIZE - 1)
          .abortSignal(signal),
      "fetchProducts",
    );
    if (error) throw new Error(`fetchProducts: ${error.message}`);

    const batch = (data ?? []) as unknown as CatalogueRow[];
    rows.push(...batch);
    // A short page is the last one. An empty page ends it too, which is the
    // case where `from` has walked past the end.
    if (batch.length < CATALOGUE_PAGE_SIZE) return rows.filter(isIdentifiable).map(rowToProduct);
  }

  // Only reachable if the server kept returning full pages past the bound —
  // which means `range` was ignored, so the rows collected above are some
  // number of copies of the first page rather than a catalogue.
  throw new Error(
    `fetchProducts: catalogue exceeded ${MAX_CATALOGUE_PAGES} pages; refusing to cache a partial read`,
  );
}

/**
 * Guards against several screens mounting at once and each starting its own
 * background check.
 */
let revalidating: Promise<void> | null = null;

/**
 * Check for updates without making anyone wait.
 *
 * The caller has already been handed cached data by the time this runs, so
 * every failure here is silent: a background refresh that cannot reach the
 * network has cost the user nothing.
 *
 * Known limitation, and a deliberate one for now: if this *does* find new
 * data, the screen currently showing the old list will not repaint — the tab
 * stays mounted, so its effect does not run again. The next filter change or
 * cold start picks it up. Worth a subscription only if the import cadence
 * ever gets faster than a person's session.
 */
function revalidateCatalogue(known: CatalogueWatermark): void {
  if (revalidating) return;
  revalidating = (async () => {
    try {
      const watermark = await fetchWatermark();
      if (watermarksMatch(known, watermark)) {
        touchCatalogue(watermark);
        return;
      }
      putCatalogue(await fetchAllRows(), watermark);
    } catch {
      // See above.
    } finally {
      revalidating = null;
    }
  })();
}

/**
 * Returns products with ingredients resolved. The list screen needs them:
 * scoring reads the formula, not just the product-level tags, so that a
 * product whose INCI list contradicts its marketing cannot be surfaced as a
 * good match.
 */
export async function fetchProducts(
  filters: ProductFilters = {}
): Promise<ProductWithIngredients[]> {
  const { type = "all" } = filters;

  if (usingSupabase()) {
    // No freshness check here — that happened once, at launch, in
    // `warmCatalogue`. The only thing a read still enforces is the hard
    // ceiling: a copy past its TTL is refetched outright rather than checked,
    // which also covers an app the OS has kept alive long enough for the
    // memory layer to outlive the disk window.
    // No TTL check here any more: `readCatalogue` enforces it for every
    // fetcher, so a hit is by definition inside the window.
    const cached = await readCatalogue();
    if (cached) return productsForType(cached, type);

    // Cold: watermark first, then rows — sequential on purpose.
    //
    // Fetching the two concurrently is one round trip cheaper and quietly
    // wrong. If an import commits between the two responses landing, the cache
    // can end up holding the *old* rows under the *new* watermark, and every
    // later freshness check then agrees that nothing has changed — stale for
    // the full 24h TTL, in the one path no freshness check can rescue.
    //
    // This order fails the safe way round: a write in the gap leaves the
    // stored watermark behind reality, so the next check sees a difference and
    // refetches. The cost is one extra round trip of 51 bytes, once per cold
    // start. `revalidateCatalogue` reads in this same order, for this reason.
    const watermark = await fetchWatermark();
    return productsForType(putCatalogue(await fetchAllRows(), watermark), type);
  }

  const results = PRODUCTS.filter((p) => type === "all" || p.type === type).map(resolveIngredients);
  return delay(results);
}

export async function fetchProduct(
  id: string
): Promise<ProductWithIngredients | null> {
  if (usingSupabase()) {
    // A product opened from Browse or Saved is already in the cached
    // catalogue — the detail screen should not re-request a row the list
    // just handed it.
    const cached = await readCatalogue();
    const hit = cached ? productById(cached, id) : undefined;
    if (hit) return hit;

    const { data, error } = await withTimeout(
      // abortSignal has to come before maybeSingle: maybeSingle narrows the
      // builder to a type that no longer has abortSignal on it.
      (signal) => supabase!.from("products").select(SELECT).eq("id", id).abortSignal(signal).maybeSingle(),
      "fetchProduct",
    );
    if (error) throw new Error(`fetchProduct: ${error.message}`);
    return data ? rowToProduct(data as unknown as CatalogueRow) : null;
  }

  const product = PRODUCTS.find((p) => p.id === id);
  return delay(product ? resolveIngredients(product) : null);
}

/** Used by the saved screen, which needs several at once. */
export async function fetchProductsByIds(
  ids: string[]
): Promise<ProductWithIngredients[]> {
  if (ids.length === 0) return [];

  if (usingSupabase()) {
    // The saved shelf is almost always a subset of the catalogue already on
    // the device. Resolve what we can locally and ask only for the rest —
    // usually nothing, which makes opening Saved free.
    const cached = await readCatalogue();
    const resolved: ProductWithIngredients[] = [];
    const missing: string[] = [];

    for (const id of ids) {
      const hit = cached ? productById(cached, id) : undefined;
      if (hit) resolved.push(hit);
      else missing.push(id);
    }

    if (missing.length === 0) return resolved;

    const { data, error } = await withTimeout(
      (signal) => supabase!.from("products").select(SELECT).in("id", missing).abortSignal(signal),
      "fetchProductsByIds",
    );
    if (error) throw new Error(`fetchProductsByIds: ${error.message}`);
    return [...resolved, ...(data as unknown as CatalogueRow[]).map(rowToProduct)];
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
    // The filter bar's types are derivable from the list it filters, so once
    // the catalogue is cached this stops being a request at all.
    const cached = await readCatalogue();
    if (cached) return typesFrom(cached);

    const { data, error } = await withTimeout(
      (signal) => supabase!.from("products").select("type").abortSignal(signal),
      "fetchProductTypes",
    );
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
    // One hour, in memory only — see `readScanned` for why this one never
    // reaches the disk. Re-scanning the same bottle within a session (or
    // backing out of the result and scanning again) should not re-run the
    // whole cascade.
    const remembered = readScanned(barcode);
    if (remembered !== undefined) return remembered;

    const { data, error } = await supabase!.functions.invoke(LOOKUP_FUNCTION, {
      body: { barcode },
    });
    if (error) {
      // A 404 from the cascade means "in no source we consulted", which is a
      // null result, not a failure. Anything else is worth surfacing.
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 404) {
        putScanned(barcode, null);
        return null;
      }
      throw new Error(`fetchProductByBarcode: ${error.message}`);
    }
    const product = data ? rowToProduct(data as CatalogueRow) : null;
    putScanned(barcode, product);
    // The cascade writes anything it resolves back to the catalogue, so a hit
    // here can be a row this device's cached list does not have yet. Folding it
    // in is what stops a just-scanned product being missing from Browse.
    if (product) addScannedToCatalogue(product);
    return product;
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

  // A label read is the other way a product enters the catalogue mid-session,
  // and the one the user most expects to find afterwards — they just did the
  // work of photographing it. See `addScannedToCatalogue` for why this is an
  // insert rather than something a freshness check should have to discover.
  const scannedProduct = rowToProduct(data.product as CatalogueRow);
  addScannedToCatalogue(scannedProduct);

  // The barcode cascade that sent the user here may have cached a miss for
  // this exact barcode, and that entry outlives the label read by up to an
  // hour. Without this, re-scanning the bottle the user just photographed
  // returns the remembered `null` and offers the label flow a second time —
  // for a product that now exists. Record the real answer against whichever
  // barcode we know: the one the caller passed, or the one the row came back
  // with when the OCR function resolved it itself.
  const scannedBarcode = opts.barcode ?? scannedProduct.barcode;
  if (scannedBarcode) putScanned(scannedBarcode, scannedProduct);

  return {
    ok: true,
    product: scannedProduct,
    recognised: Number(data.recognised ?? 0),
    total: Number(data.total ?? 0),
  };
}

/**
 * Search the catalogue by name or brand — the design's third scan mode, and
 * the graceful degradation when there is no usable camera at all: a denied
 * permission, a desktop without one, a barcode too worn to read.
 */
/**
 * Look up already-parsed INCI names in the dictionary, preserving label order.
 *
 * For the paste-a-list flow, which has names but no product. A plain table
 * read — `ingredients` is public-SELECT under RLS — so it needs no edge
 * function and no service-role key.
 *
 * Names we cannot resolve come back as unverified stubs rather than being
 * dropped. That is what lets the screen say "we recognised 12 of 31" instead
 * of quietly shortening the list, and it keeps pore-clogging detection working
 * on them: an unrecognised name can still be an exact match against the
 * curated table.
 *
 * Degrades rather than throws. With no Supabase configured, or with no
 * network, every name comes back as a stub and the caller still gets a usable
 * pore-clogging answer — which is the whole point of doing that check on the
 * device.
 */
export async function resolveIngredientNames(names: string[]): Promise<Ingredient[]> {
  const stub = (name: string): Ingredient => ({
    id: name,
    name,
    comedogenic: 0,
    safety: "caution",
    verified: false,
  });

  if (names.length === 0) return [];

  if (!usingSupabase()) {
    return delay(
      names.map((name) => {
        const lookupName = name.trim().toLowerCase();
        const local = Object.values(INGREDIENTS).find(
          (i) => i.name.toLowerCase() === lookupName
        );
        return local ?? stub(name);
      })
    );
  }

  try {
    // Bounded like the catalogue reads, and the catch below is why: a
    // timeout here degrades to the unverified stubs this function already
    // promises, instead of leaving the paste-list screen waiting forever.
    const { data, error } = await withTimeout(
      (signal) =>
        supabase!
          .from("ingredients")
          .select("inci_name, comedogenic, safety, note, verified, functions")
          .in("inci_name", names)
          .abortSignal(signal),
      "resolveIngredientNames",
    );

    if (error) throw error;

    const byName = new Map<string, Ingredient>();
    for (const row of data ?? []) {
      byName.set(row.inci_name, {
        id: row.inci_name,
        name: row.inci_name,
        comedogenic: (row.comedogenic ?? 0) as Ingredient["comedogenic"],
        safety: row.safety,
        note: row.note ?? undefined,
        verified: row.verified,
        functions: row.functions ?? undefined,
      });
    }

    return names.map((name) => byName.get(name) ?? stub(name));
  } catch (err) {
    console.warn("resolveIngredientNames failed:", err);
    return names.map(stub);
  }
}

/**
 * How many search results any path may return.
 *
 * Exported because Browse narrows the cached catalogue itself on every
 * keystroke and only falls back to this function behind a debounce. If the
 * two disagree, the list visibly shrinks when the slower answer replaces the
 * faster one — so both read this.
 */
export const SEARCH_RESULT_LIMIT = 20;

export async function searchProducts(query: string): Promise<ProductWithIngredients[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  if (usingSupabase()) {
    const escaped = trimmed.replace(/[%,()]/g, " ");
    const { data, error } = await withTimeout(
      (signal) =>
        supabase!
          .from("products")
          .select(SELECT)
          .or(`name.ilike.%${escaped}%,brand.ilike.%${escaped}%`)
          .limit(SEARCH_RESULT_LIMIT)
          .abortSignal(signal),
      "searchProducts",
    );
    if (error) throw new Error(`searchProducts: ${error.message}`);
    return (data as unknown as CatalogueRow[]).filter(isIdentifiable).map(rowToProduct);
  }

  const needle = trimmed.toLowerCase();
  return delay(
    PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) || p.brand.toLowerCase().includes(needle)
    )
      .slice(0, SEARCH_RESULT_LIMIT)
      .map(resolveIngredients)
  );
}
