import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ProductType, ProductWithIngredients } from "./types";

/**
 * The catalogue cache.
 *
 * Browse had no cache of any kind: opening it, switching to Saved and coming
 * back was three full round trips, three JSON parses, and the scoring engine
 * run three times over the same products. This is the layer that stops that.
 *
 * It sits *behind* `data/api.ts` on purpose. Every screen still reads through
 * the four fetchers and learns nothing about caching — the seam CLAUDE.md
 * protects stays exactly where it was. (This is also why there is no query
 * library here: the standard ones are component hooks, and adopting one would
 * have put data access back into the screens.)
 *
 * Two layers, deliberately different:
 *
 *   Memory   No expiry while the app is open. Returns the *same array
 *            instance* on every hit — see `productsForType` for why that is
 *            load-bearing rather than an optimisation.
 *   Disk     24h, via AsyncStorage. Measured on device at ~120ms to read and
 *            ~11ms to parse, which is why `warmCatalogue` spends it behind the
 *            splash screen rather than letting Browse flash a skeleton.
 *
 * Storage policy: this file is the second and last file permitted to import
 * AsyncStorage (`docs/device-storage-policy.md`, enforced in
 * `eslint.config.js`). The permission is narrow and the boundary is stated
 * there: public catalogue rows, the ingredient dictionary and freshness
 * watermarks, and nothing derived from the user. Every key below is a
 * constant for exactly that reason — if a key would differ between two
 * installs holding the same catalogue, it does not belong in this file.
 */

/** Bumped when the persisted shape changes, so an old blob is ignored rather than misread. */
const SCHEMA_VERSION = 1;

const PRODUCTS_KEY = `forme-catalogue-v${SCHEMA_VERSION}`;
const META_KEY = `forme-catalogue-meta-v${SCHEMA_VERSION}`;

/** How long a disk-cached catalogue may be served before it is refetched. */
export const DISK_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How long a barcode lookup stays remembered.
 *
 * This buys one thing, and it is not freshness: it stops a second lookup when
 * the same bottle is scanned twice in a session — backing out of a result and
 * re-scanning, or scanning three products and returning to the first.
 *
 * An earlier version of this claimed the short window kept the answer current
 * for someone holding the physical bottle. That was wrong, and worth recording
 * so nobody restores the reasoning: re-running the lookup returns the same
 * catalogue row, and that row has no expiry of its own — an `obf` or `ocr`
 * product written months ago is served unchanged. Nothing here makes an answer
 * fresher than the row behind it. Making *that* true is a pipeline job.
 */
export const SCANNED_TTL_MS = 60 * 60 * 1000;

/**
 * "Has anything changed?", cheaply.
 *
 * The whole point of the freshness check is that it costs 51 bytes instead of
 * the ~946KB a full list costs (both measured). `count` plus the newest `fetched_at` is
 * enough to catch every write the importers make: a new product moves the
 * count, and a rewritten formula moves the timestamp.
 */
export type CatalogueWatermark = {
  count: number;
  newest: string | null;
};

type CatalogueMeta = {
  watermark: CatalogueWatermark;
  storedAt: number;
};

/**
 * What lives in memory. The derived indexes are built once per catalogue and
 * then handed out repeatedly, which is what keeps references stable.
 */
type MemoryEntry = {
  products: ProductWithIngredients[];
  watermark: CatalogueWatermark;
  storedAt: number;
  /** Lazily filled, one stable array per type filter. */
  byType: Map<ProductType | "all", ProductWithIngredients[]>;
  byId: Map<string, ProductWithIngredients>;
  types: ProductType[] | null;
};

let memory: MemoryEntry | null = null;

/**
 * Tracks the in-flight disk read so a cold start with several screens mounting
 * at once does not read and parse the same blob more than once.
 */
let diskRead: Promise<MemoryEntry | null> | null = null;

/**
 * Set when a disk read has been waited on and given up for lost.
 *
 * `diskRead` is cleared in a `finally`, which only runs when the read settles.
 * If AsyncStorage never settles — the exact failure `warmCatalogue`'s timeout
 * race exists to survive — that `finally` never runs, `diskRead` stays
 * assigned, and every later `readCatalogue()` hands back the same permanently
 * pending promise. The splash carries on, and then Browse awaits that promise
 * forever: a skeleton that never resolves and never falls back to the network.
 * The flag is what lets the fallback happen. A late read that does eventually
 * land still populates the memory layer, so nothing is lost by moving on.
 */
let diskReadAbandoned = false;

/**
 * Bumped every time something other than the disk read replaces or clears the
 * memory layer.
 *
 * The disk read captures this before it awaits and checks it before it
 * installs, because a read that has been given up on can still land — that is
 * the whole premise of `abandonDiskRead`. By then the network path it made way
 * for may already have written a *newer* catalogue, and an unconditional
 * `memory = buildEntry(...)` would replace that with the copy from disk. Every
 * later read would then serve the old catalogue for the rest of the session,
 * from a read the app had deliberately stopped waiting for.
 *
 * `abandonDiskRead` does not bump it. A late read landing on an untouched
 * memory layer is still useful, and that was the point of not clearing
 * `memory` when the timeout won.
 */
let catalogueGeneration = 0;

/**
 * Stop waiting on the in-flight disk read and let subsequent reads miss.
 *
 * Called by the splash warm when its timeout wins. Deliberately does not clear
 * `memory`: if the read lands later it is still the fastest source available.
 */
export function abandonDiskRead(): void {
  if (diskRead) diskReadAbandoned = true;
}

/**
 * Whether this launch has already asked the server "has anything changed?".
 *
 * Lives here rather than next to the code that reads it so that
 * `resetCatalogueCache` clears it with everything else — a flag that survived
 * a reset would make the first check after one silently disappear, and only in
 * tests, which is the worst place to find it.
 */
let checkedThisLaunch = false;

/**
 * When the last "has anything changed?" check ran, or null if none has.
 *
 * Separate from the boolean because the two answer different questions. The
 * flag gates the *launch* check, which must happen exactly once however many
 * screens mount at the same moment. The timestamp gates the foreground
 * re-check, which must happen repeatedly but not on every app switch.
 */
let lastCheckedAt: number | null = null;

export function hasCheckedThisLaunch(): boolean {
  return checkedThisLaunch;
}

export function markCheckedThisLaunch(): void {
  checkedThisLaunch = true;
  lastCheckedAt = Date.now();
}

/**
 * How long since the catalogue was last checked against the server.
 *
 * `Infinity` when it never has been, so a caller comparing against an
 * interval reads "overdue" rather than "just done" — the safe way round.
 */
export function msSinceLastCheck(): number {
  return lastCheckedAt === null ? Infinity : Date.now() - lastCheckedAt;
}

/** Barcode lookups. Memory only — see `readScanned`. */
const scanned = new Map<
  string,
  { product: ProductWithIngredients | null; at: number }
>();

function buildEntry(
  products: ProductWithIngredients[],
  watermark: CatalogueWatermark,
  storedAt: number,
): MemoryEntry {
  const byId = new Map<string, ProductWithIngredients>();
  for (const product of products) byId.set(product.id, product);

  const byType = new Map<ProductType | "all", ProductWithIngredients[]>();
  byType.set("all", products);

  return { products, watermark, storedAt, byType, byId, types: null };
}

export function watermarksMatch(
  a: CatalogueWatermark,
  b: CatalogueWatermark,
): boolean {
  return a.count === b.count && a.newest === b.newest;
}

/**
 * Validates the metadata blob, which is asserted rather than parsed everywhere
 * else it is touched. `storedAt` drives the TTL comparison and `watermark.count`
 * the freshness check, so a `NaN` or a missing field here does not fail loudly —
 * it makes `Date.now() - storedAt > DISK_TTL_MS` false and serves the copy
 * forever.
 */
function parseMeta(value: unknown): CatalogueMeta | null {
  if (typeof value !== "object" || value === null) return null;
  const meta = value as Partial<CatalogueMeta>;
  const mark = meta.watermark;
  if (typeof meta.storedAt !== "number" || !Number.isFinite(meta.storedAt))
    return null;
  if (typeof mark !== "object" || mark === null) return null;
  if (typeof mark.count !== "number" || !Number.isFinite(mark.count))
    return null;
  if (mark.newest !== null && typeof mark.newest !== "string") return null;
  return {
    watermark: { count: mark.count, newest: mark.newest },
    storedAt: meta.storedAt,
  };
}

/**
 * The fields a persisted product must actually have for the screens to render
 * it: an id to key and resolve by, a type to filter on, and — the one that
 * throws rather than merely looking wrong — an ingredients array, which
 * `matchProduct` and `ProductRow` both dereference without checking.
 */
function isUsableProduct(value: unknown): value is ProductWithIngredients {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Partial<ProductWithIngredients>;
  return (
    typeof p.id === "string" &&
    typeof p.type === "string" &&
    Array.isArray(p.ingredients)
  );
}

/**
 * The cached catalogue, or null if there isn't a usable one.
 *
 * Memory first; then disk, once. Either way the copy has to be inside the 24h
 * window: the TTL is enforced *here* so that it cannot be forgotten at a call
 * site. It used to live in `fetchProducts` alone, which meant the three other
 * fetchers — a product by id, the saved shelf, the type list — would serve a
 * copy of any age. A phone does not close an app, so "the memory layer has no
 * expiry while the app is open" and "this data is at most a day old" were two
 * promises the code could not keep at once.
 *
 * A failure at any point here is not an error the caller should see — a cache
 * that cannot be read is a cache miss, and the network path handles it.
 */
export async function readCatalogue(): Promise<MemoryEntry | null> {
  // `touchCatalogue` moves `storedAt` forward whenever a freshness check
  // confirms nothing changed, so this measures time since the copy was last
  // known good rather than since it was first fetched.
  if (memory) return Date.now() - memory.storedAt > DISK_TTL_MS ? null : memory;
  // Before the `diskRead` check, not after: the abandoned read is still the
  // one held there, so testing that first would hand it straight back and the
  // flag would never be reached. See `abandonDiskRead`.
  if (diskReadAbandoned) return null;
  if (diskRead) return diskRead;

  // Captured before the first await, compared before the install below.
  const readGeneration = catalogueGeneration;

  diskRead = (async () => {
    try {
      const rawMeta = await AsyncStorage.getItem(META_KEY);
      if (rawMeta === null) return null;

      const meta = parseMeta(JSON.parse(rawMeta) as unknown);
      if (!meta) return null;
      if (Date.now() - meta.storedAt > DISK_TTL_MS) return null;

      const rawProducts = await AsyncStorage.getItem(PRODUCTS_KEY);
      if (rawProducts === null) return null;

      const products = JSON.parse(rawProducts) as unknown;
      if (!Array.isArray(products) || products.length === 0) return null;
      // The cast this replaces asserted a shape nothing had checked. A blob
      // written by an older build — or half-written, or hand-edited — could
      // put `[{}]` here, and the first thing to touch it is
      // `matchProduct`/`ProductRow` reading `product.ingredients.length`,
      // which throws while rendering rather than anywhere it can be caught.
      // `isIdentifiable` guards the *network* rows before `rowToProduct`;
      // nothing guarded the persisted ones. A miss is recoverable — the
      // network path is right there — so validating down to the fields those
      // consumers actually dereference is enough.
      if (!products.every(isUsableProduct)) return null;

      // Something replaced or cleared the memory layer while this read was in
      // flight — almost certainly the network fetch that ran because this read
      // was too slow. Whatever it wrote is newer than what is on disk, so this
      // result is returned to whoever is still waiting on it but is not
      // installed. See `catalogueGeneration`.
      if (readGeneration !== catalogueGeneration) {
        return buildEntry(products, meta.watermark, meta.storedAt);
      }

      memory = buildEntry(products, meta.watermark, meta.storedAt);
      return memory;
    } catch {
      // Corrupt JSON, a schema that no longer parses, storage unavailable —
      // all of them mean the same thing to the caller.
      return null;
    } finally {
      diskRead = null;
      // It settled, so it was never lost — whatever a timeout concluded
      // earlier, the next read starts clean rather than inheriting a verdict
      // about a read that has now finished.
      diskReadAbandoned = false;
    }
  })();

  return diskRead;
}

/**
 * Record a freshly fetched catalogue.
 *
 * Returns the entry so a caller can hand its stable arrays straight back to a
 * screen without a second read.
 *
 * **An empty catalogue is returned but never retained**, in memory or on disk.
 * A products table that genuinely holds nothing is not a state this app ships
 * in; an empty array is far more likely to be a request that failed without
 * throwing — a policy change, a bad filter, a half-open connection. Caching
 * that would show an empty Browse for the next 24 hours and suppress the very
 * refetch that would fix it. Not retaining it means the next call simply tries
 * again, which is what an empty result deserves. `readCatalogue` refuses an
 * empty stored array for the same reason, so the two agree.
 */
export function putCatalogue(
  products: ProductWithIngredients[],
  watermark: CatalogueWatermark,
): MemoryEntry {
  const storedAt = Date.now();
  const entry = buildEntry(products, watermark, storedAt);

  if (products.length === 0) return entry;

  memory = entry;
  catalogueGeneration++;

  // Fire and forget: a screen must never wait on a cache write, and a failed
  // write only costs the next cold start a spinner.
  void persist(products, { watermark, storedAt });

  return memory;
}

/**
 * The catalogue was checked and had not changed.
 *
 * Restarts the 24h window without rewriting the products blob — the expensive
 * half — and without replacing any array, so every screen holding a reference
 * from before the check keeps it and nothing re-renders or re-scores.
 */
export function touchCatalogue(watermark: CatalogueWatermark): void {
  if (!memory) return;
  memory.watermark = watermark;
  memory.storedAt = Date.now();
  void persistMeta({ watermark, storedAt: memory.storedAt });
}

/**
 * Serialises every disk write, so two of them cannot interleave.
 *
 * A save is two `setItem` calls — the products blob, then the metadata that
 * describes it — and nothing used to make one save wait for another. A
 * refresh and a scanned product writing at the same time could therefore
 * commit as products(A), products(B), meta(B), meta(A), leaving metadata on
 * disk that describes a blob it did not come from: a `watermark.count` that
 * disagrees with the rows beside it, which is the one value the freshness
 * check trusts to decide whether to refetch.
 *
 * Both legs of the chain are the same function, so a failed write cannot
 * stall the queue behind it — `persist` and `persistMeta` swallow their own
 * errors anyway, and this only guarantees ordering, never success.
 */
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(write: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(write, write);
  return writeQueue;
}

/**
 * Resolves once every write queued so far has finished. For tests, which
 * otherwise have to guess at how many ticks a two-part write takes.
 */
export function writesSettled(): Promise<void> {
  return writeQueue;
}

async function persist(
  products: ProductWithIngredients[],
  meta: CatalogueMeta,
): Promise<void> {
  return enqueueWrite(async () => {
    try {
      await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
      await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (err) {
      // Never fatal — see `putCatalogue`. Surfaced in development only, because a
      // write that silently fails looks exactly like a cache that works until the
      // next cold start, which is an unpleasant thing to debug twice.
      if (__DEV__) console.warn("[catalogue-cache] disk write failed:", err);
    }
  });
}

async function persistMeta(meta: CatalogueMeta): Promise<void> {
  return enqueueWrite(async () => {
    try {
      await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch {
      // See `putCatalogue`.
    }
  });
}

/**
 * The cached list for one type filter, as a stable array.
 *
 * This is the part that has to be exactly right. `app/(tabs)/browse.tsx`
 * memoises its scoring on the *identity* of the products array. Returning a
 * freshly built array on every cache hit would remove the network cost and
 * keep the CPU cost — every tab return would re-score the whole catalogue
 * while looking, from the outside, like the cache was working. So each filter
 * is built once and the same instance is handed out from then on.
 */
export function productsForType(
  entry: MemoryEntry,
  type: ProductType | "all",
): ProductWithIngredients[] {
  const cached = entry.byType.get(type);
  if (cached) return cached;

  const filtered = entry.products.filter((product) => product.type === type);
  entry.byType.set(type, filtered);
  return filtered;
}

/**
 * The in-memory catalogue, without touching the disk.
 *
 * Exists so a screen can render cached rows on its very first frame. Every
 * other read here is async because the disk might be involved, and an async
 * read — however fast — still resolves a tick late, which is one frame of
 * skeleton the user did not need to see.
 */
/**
 * The memory layer as it stands, with no TTL check and no disk read.
 *
 * Deliberately the one reader that will hand back a copy past its window:
 * this exists so the first frame has something to draw (see `peekProducts`),
 * and a day-old list on screen for the moment before the real read lands is
 * better than a skeleton. Every caller follows it with a `readCatalogue` path
 * that will correct it. Do not reach for this to avoid the TTL.
 */
export function peekCatalogue(): MemoryEntry | null {
  return memory;
}

export function productById(
  entry: MemoryEntry,
  id: string,
): ProductWithIngredients | undefined {
  return entry.byId.get(id);
}

/** Distinct types present, cached so the filter bar stops issuing its own query. */
export function typesFrom(entry: MemoryEntry): ProductType[] {
  if (entry.types) return entry.types;
  entry.types = [
    ...new Set(entry.products.map((p) => p.type)),
  ] as ProductType[];
  return entry.types;
}

/**
 * A barcode lookup from this session, if it is still inside its hour.
 *
 * Memory only, and deliberately not written to disk. Which barcodes a person
 * has scanned is derived from that person — persisting it would put a
 * user-shaped key set in a file whose stated boundary is data identical across
 * every install (`docs/device-storage-policy.md`). Keeping it in memory also
 * happens to be the more correct reading of the one-hour rule: a new session
 * asks again.
 *
 * `null` is a cached value, not a miss: "this barcode is in no source we
 * consulted" is an ordinary answer and worth not re-asking within a session.
 * The miss is `undefined`.
 */
export function readScanned(
  barcode: string,
): ProductWithIngredients | null | undefined {
  const hit = scanned.get(barcode);
  if (!hit) return undefined;
  if (Date.now() - hit.at > SCANNED_TTL_MS) {
    scanned.delete(barcode);
    return undefined;
  }
  return hit.product;
}

export function putScanned(
  barcode: string,
  product: ProductWithIngredients | null,
): void {
  scanned.set(barcode, { product, at: Date.now() });
}

/**
 * Forget every barcode looked up this session.
 *
 * Called by `resetApp`. This map is the one thing in this module derived from
 * the person using the app rather than from the catalogue — it is a list of
 * what *they* pointed a camera at — so "erase my profile" has to include it,
 * even though it never reaches the disk and would be gone at app close anyway.
 * The products it holds are public; the set of keys is not.
 *
 * Deliberately separate from `resetCatalogueCache`: that also drops the
 * catalogue, which is public, identical on every install, and costs a spinner
 * to rebuild for no privacy gain.
 */
export function forgetScannedBarcodes(): void {
  scanned.clear();
}

/**
 * Fold a product this session just created into the cached catalogue.
 *
 * A scan that finds nothing and is followed by a label photo writes a new row
 * server-side — and the person who did that work then could not find it in
 * Browse, because their cached list predates it and nothing invalidates on a
 * write. It read as the app forgetting.
 *
 * This is the targeted alternative to polling for it. The app is the thing
 * that caused the change and already holds the response, so there is nothing to
 * discover: insert it and move on. No network, no timer, no refetch of ~946KB
 * to learn about one row we are holding.
 *
 * The watermark is deliberately left alone. It describes what the *server* had
 * at the last check, and pretending otherwise would make the next freshness
 * check agree that nothing had changed — hiding every other write that landed
 * in the meantime. Leaving it stale means the next check refetches, which is
 * correct.
 *
 * Ignores anything unidentifiable (no barcode): a row that cannot be reached
 * from a list has no business appearing in one.
 *
 * A product we already hold is **replaced, not skipped**. Re-scanning a known
 * bottle must not duplicate it, which is what the earlier early-return was
 * for — but the lookup that just ran returned the row as it stands *now*, and
 * the cached copy may predate a reformulation. Discarding the fresher one
 * meant the scanner navigated by id, `fetchProduct` resolved that id from the
 * cache, and the result screen scored the stale ingredient list the user had
 * just re-photographed to get away from.
 */
export function addScannedToCatalogue(product: ProductWithIngredients): void {
  if (!memory) return;
  if (!product.barcode) return;

  // A new array rather than a push or an in-place splice: the existing one is
  // handed to screens as a stable reference and memoised on its identity, so
  // mutating it would leave Browse showing the old list with no way to know it
  // changed. Replacing the entry is what makes the change appear.
  const products = memory.byId.has(product.id)
    ? memory.products.map((p) => (p.id === product.id ? product : p))
    : [product, ...memory.products];

  memory = buildEntry(products, memory.watermark, memory.storedAt);
  catalogueGeneration++;
  void persist(memory.products, {
    watermark: memory.watermark,
    storedAt: memory.storedAt,
  });
}

/**
 * Drops the memory layer and leaves the disk copy alone — what a cold start
 * looks like from this module's point of view.
 *
 * Exported for the tests that cover the disk path, which have no other way to
 * reach that state: re-importing the module to get fresh state would take the
 * mocked AsyncStorage down with it and destroy the very copy under test.
 */
export function forgetMemoryLayer(): void {
  memory = null;
  catalogueGeneration++;
  diskRead = null;
  diskReadAbandoned = false;
}

/**
 * Drops everything, memory and disk.
 *
 * Exported for tests, which would otherwise leak a catalogue from one case
 * into the next.
 *
 * **`resetApp` deliberately does not call this.** "Erase my profile" is about
 * the user's own data — profile, saved shelf, scan history — all of which the
 * store clears. Nothing in here is theirs: it is the public product catalogue,
 * identical on every install, and holding it back would only cost the next
 * screen a spinner while revealing nothing. The storage policy draws the line
 * in the same place, which is why the one genuinely user-shaped thing this
 * module touches — scanned barcodes — never reaches the disk at all.
 */
export async function resetCatalogueCache(): Promise<void> {
  memory = null;
  catalogueGeneration++;
  diskRead = null;
  diskReadAbandoned = false;
  checkedThisLaunch = false;
  lastCheckedAt = null;
  scanned.clear();
  try {
    await AsyncStorage.multiRemove([PRODUCTS_KEY, META_KEY]);
  } catch {
    // Nothing to do — the memory layer is already gone, which is what callers
    // actually depend on.
  }
}
