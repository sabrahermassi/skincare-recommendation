import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import {
  abandonDiskRead,
  addScannedToCatalogue,
  dropLegacyBlobs,
  DISK_TTL_MS,
  peekCatalogue,
  productById,
  productsForType,
  putCatalogue,
  forgetMemoryLayer,
  lastCacheWrite,
  putScanned,
  writesSettled,
  readCatalogue,
  readScanned,
  resetCatalogueCache,
  sliceEnd,
  SCANNED_TTL_MS,
  touchCatalogue,
  watermarksMatch,
  type CatalogueWatermark,
} from "@/data/catalogue-cache";
import { fetchProducts } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";

/**
 * The cache behind `data/api.ts`. These pin the two properties that are easy
 * to break and invisible when broken: that a cache hit hands back the *same*
 * array (without which Browse silently re-scores the whole catalogue on every
 * render), and that nothing user-shaped is written to disk.
 */

function product(id: string, type: ProductWithIngredients["type"]): ProductWithIngredients {
  return {
    id,
    barcode: `barcode-${id}`,
    brand: "Test Brand",
    name: `Product ${id}`,
    type,
    productType: "bottle-pump",
    price: 1000,
    volume: "50ml",
    suitableFor: [],
    targets: [],
    description: "A product.",
    benefits: [],
    ingredientIds: [],
    ingredients: [],
  } as unknown as ProductWithIngredients;
}

const WATERMARK: CatalogueWatermark = { count: 3, newest: "2026-09-14T00:00:00Z", ingredientCount: 0, ingredientNewest: null };

const PRODUCTS_KEY = "forme-catalogue-v2";
const META_KEY = "forme-catalogue-meta-v2";
const MANIFEST_KEY = "forme-catalogue-manifest-v2";
const CHUNK_PREFIX = "forme-catalogue-chunk-v2-";

/**
 * Run a test body as a given platform.
 *
 * The disk limits are platform-shaped since 6b-4 — Android carries a
 * per-value `CursorWindow` budget and splits past it, iOS and web write one
 * value against their own ceilings — so a test about a limit has to say which
 * platform's limit it means. `jest-expo` reports `ios` by default, which is
 * exactly the platform with no per-value cap.
 *
 * The write queue is drained inside the callback deliberately: `persist` reads
 * the platform when it runs, not when it is queued.
 */
async function onPlatform(os: "ios" | "android" | "web", run: () => Promise<void>): Promise<void> {
  const original = Platform.OS;
  (Platform as { OS: string }).OS = os;
  try {
    await run();
  } finally {
    (Platform as { OS: string }).OS = original;
  }
}

/** The v2 blob shape: one dictionary, products referencing it by name. */
function blob(products: typeof CATALOGUE) {
  const dictionary = [...new Map(
    products.flatMap((p) => p.ingredients).map((i) => [i.id, i]),
  ).values()];
  return JSON.stringify({
    dictionary,
    products: products.map(({ ingredients: _formula, ...rest }) => rest),
  });
}

const CATALOGUE = [
  product("a", "serum"),
  product("b", "cleanser"),
  product("c", "serum"),
];

beforeEach(async () => {
  await resetCatalogueCache();
  await AsyncStorage.clear();
});

describe("reference stability", () => {
  /**
   * The whole point. `app/(tabs)/browse.tsx` memoises scoring on the identity
   * of this array — a cache that rebuilds it per hit would remove the network
   * cost and keep the CPU cost, which looks like a working cache from the
   * outside.
   */
  it("returns the identical array instance on repeated reads", async () => {
    putCatalogue(CATALOGUE, WATERMARK);

    const first = productsForType((await readCatalogue())!, "all");
    const second = productsForType((await readCatalogue())!, "all");

    expect(second).toBe(first);
  });

  it("returns a stable instance per type filter too", async () => {
    putCatalogue(CATALOGUE, WATERMARK);
    const entry = (await readCatalogue())!;

    const first = productsForType(entry, "serum");
    const second = productsForType(entry, "serum");

    expect(first).toHaveLength(2);
    expect(second).toBe(first);
    expect(productsForType(entry, "cleanser")).not.toBe(first);
  });

  it("keeps existing references when a freshness check finds no change", async () => {
    putCatalogue(CATALOGUE, WATERMARK);
    const before = productsForType((await readCatalogue())!, "all");

    touchCatalogue(WATERMARK);

    expect(productsForType((await readCatalogue())!, "all")).toBe(before);
  });
});

describe("disk layer", () => {
  it("survives the memory layer being dropped", async () => {
    putCatalogue(CATALOGUE, WATERMARK);
    // Simulate a cold start: memory gone, disk intact.
    await flushWrites();
    forgetMemoryLayer();

    const restored = await readCatalogue();

    expect(restored).not.toBeNull();
    expect(restored!.products).toHaveLength(3);
    expect(productById(restored!, "b")?.name).toBe("Product b");
  });

  /**
   * The property the whole deduplication rests on, asserted on the disk path
   * as well as the network one. `rehydrate` builds a single map and hands the
   * same object to every product that names it — a future refactor that
   * rebuilt per product would restore the 3.6x heap silently, since nothing
   * about the rendered output would change.
   */
  it("restores one shared object per ingredient, not a copy per product", async () => {
    const aqua = { id: "aqua", name: "Aqua", comedogenic: 0, safety: "safe", verified: true };
    const sharing = [
      { ...product("a", "serum"), ingredientIds: ["aqua"], ingredients: [aqua] },
      { ...product("b", "cleanser"), ingredientIds: ["aqua"], ingredients: [aqua] },
    ] as unknown as ProductWithIngredients[];

    putCatalogue(sharing, WATERMARK);
    await flushWrites();
    forgetMemoryLayer();

    const restored = (await readCatalogue())!;

    expect(restored.products[0].ingredients[0]).toBe(restored.products[1].ingredients[0]);
    expect(restored.products[0].ingredients[0].name).toBe("Aqua");
  });

  /**
   * Bumping the schema version hides an old blob; it does not delete one. What
   * would be stranded is a full-size copy of the catalogue, against Android's
   * 6MB AsyncStorage ceiling — so a change that halved the live blob would
   * have raised disk use on every existing install.
   */
  it("deletes the blobs an earlier schema version left behind", async () => {
    await AsyncStorage.setItem("forme-catalogue-v1", JSON.stringify([{ id: "old" }]));
    await AsyncStorage.setItem("forme-catalogue-meta-v1", "{}");

    await dropLegacyBlobs();

    expect(await AsyncStorage.getItem("forme-catalogue-v1")).toBeNull();
    expect(await AsyncStorage.getItem("forme-catalogue-meta-v1")).toBeNull();
  });

  /**
   * The same stranding, for chunks. A version bump hides them from the reader
   * and nothing else would ever remove them — and unlike a v1 blob, what is
   * left behind is a full catalogue spread over several keys, competing for
   * the same Android ceiling as the live one.
   */
  it("deletes chunks an earlier schema version left behind, and keeps this one's", async () => {
    await AsyncStorage.setItem("forme-catalogue-chunk-v1-abc-0", "stranded");
    await AsyncStorage.setItem(`${CHUNK_PREFIX}abc-0`, "current");

    await dropLegacyBlobs();

    expect(await AsyncStorage.getItem("forme-catalogue-chunk-v1-abc-0")).toBeNull();
    expect(await AsyncStorage.getItem(`${CHUNK_PREFIX}abc-0`)).toBe("current");
  });

  it("ignores a stored catalogue past its TTL", async () => {
    putCatalogue(CATALOGUE, WATERMARK);
    await flushWrites();

    const meta = JSON.parse((await AsyncStorage.getItem(META_KEY))!);
    meta.storedAt = Date.now() - DISK_TTL_MS - 1;
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
    forgetMemoryLayer();

    expect(await readCatalogue()).toBeNull();
  });

  it("treats unreadable stored data as a miss rather than throwing", async () => {
    await AsyncStorage.setItem(META_KEY, "{not json");

    await expect(readCatalogue()).resolves.toBeNull();
  });

  /**
   * Valid JSON of the wrong shape is the case a `JSON.parse` + cast cannot
   * catch. It reaches `buildEntry` intact and only fails later, inside render,
   * where `matchProduct` and `ProductRow` dereference `product.ingredients`.
   */
  it.each([
    [
      "a product with no ingredient names to rebuild from",
      JSON.stringify({ dictionary: [], products: [{ id: "a", type: "serum" }] }),
    ],
    ["a product list of empty objects", JSON.stringify({ dictionary: [], products: [{}] })],
    [
      "a dictionary entry with no name",
      JSON.stringify({ dictionary: [{ id: "aqua" }], products: [{ id: "a", type: "serum", ingredientIds: [] }] }),
    ],
    ["metadata with a non-numeric storedAt", null],
  ] as const)("treats %s as a miss", async (_label: string, rawProducts: string | null) => {
    if (rawProducts === null) {
      await AsyncStorage.setItem(
        META_KEY,
        JSON.stringify({ watermark: WATERMARK, storedAt: "yesterday" }),
      );
      await AsyncStorage.setItem(PRODUCTS_KEY, blob(CATALOGUE));
    } else {
      await AsyncStorage.setItem(
        META_KEY,
        JSON.stringify({ watermark: WATERMARK, storedAt: Date.now() }),
      );
      await AsyncStorage.setItem(PRODUCTS_KEY, rawProducts);
    }

    await expect(readCatalogue()).resolves.toBeNull();
  });

  /**
   * The splash gives up on a disk read after two seconds. Without releasing it,
   * every later read returns that same never-settling promise and Browse waits
   * on it forever — a launch that recovered into a skeleton that cannot.
   */
  /**
   * The other half of abandoning a read: it can still land. By then the
   * network fetch it made way for may have written a newer catalogue, and an
   * unconditional install would replace that with the copy from disk — every
   * later read serving the old catalogue for the rest of the session, from a
   * read the app had deliberately stopped waiting for.
   */
  it("does not let a late disk read overwrite a fresher catalogue", async () => {
    await AsyncStorage.setItem(
      META_KEY,
      JSON.stringify({ watermark: WATERMARK, storedAt: Date.now() }),
    );
    await AsyncStorage.setItem(PRODUCTS_KEY, blob(CATALOGUE));

    let release: (value: string | null) => void = () => {};
    const real = AsyncStorage.getItem;
    AsyncStorage.getItem = ((key: string) =>
      key.includes("meta")
        ? new Promise<string | null>((resolve) => {
            release = resolve;
          })
        : real(key)) as typeof AsyncStorage.getItem;

    try {
      const late = readCatalogue();
      abandonDiskRead();

      // The network path wins the race and installs a newer catalogue.
      putCatalogue([product("fresh", "serum")], { count: 1, newest: "2026-09-09T00:00:00Z", ingredientCount: 0, ingredientNewest: null });

      release(JSON.stringify({ watermark: WATERMARK, storedAt: Date.now() }));
      await late;
    } finally {
      AsyncStorage.getItem = real;
    }

    expect(peekCatalogue()!.products.map((p) => p.id)).toEqual(["fresh"]);
  });

  it("misses instead of hanging once a stuck read is abandoned", async () => {
    // Swapped by hand rather than with `jest.spyOn`. AsyncStorage is already a
    // module mock, and `mockRestore` on one of those does not give the working
    // implementation back — it leaves every later test in this file reading
    // undefined from storage, which fails somewhere far from here.
    const real = AsyncStorage.getItem;
    AsyncStorage.getItem = (() =>
      new Promise<string | null>(() => {})) as typeof AsyncStorage.getItem;

    try {
      void readCatalogue();
      abandonDiskRead();

      await expect(readCatalogue()).resolves.toBeNull();
    } finally {
      AsyncStorage.getItem = real;
    }
  });
});

describe("two saves at once", () => {
  /**
   * A save is two writes — the products blob, then the metadata describing it
   * — and nothing used to make one save wait for another. A refresh and a
   * scanned product could commit as products(A), products(B), meta(B),
   * meta(A), leaving metadata on disk that describes a blob it did not come
   * from. `watermark.count` is the one value the freshness check trusts to
   * decide whether to refetch, so a mismatch there is agreed with rather than
   * noticed.
   */
  it("finishes one before starting the next", async () => {
    const order: string[] = [];
    // Swapped by hand rather than with `jest.spyOn`: AsyncStorage is already a
    // module mock here, and restoring a spy on one of those does not reliably
    // give the working implementation back — it leaves later tests writing
    // into a void, which fails somewhere else entirely.
    const real = AsyncStorage.setItem;
    AsyncStorage.setItem = (async (key: string, value: string) => {
      const leg = key.includes("meta") ? "meta" : "products";
      order.push(leg);
      // The products blob is the slow half, and the gap a second save used to
      // slip into.
      if (leg === "products") await new Promise((resolve) => setTimeout(resolve, 5));
      return real(key, value);
    }) as typeof AsyncStorage.setItem;

    try {
      putCatalogue(CATALOGUE, WATERMARK);
      putCatalogue(CATALOGUE.slice(0, 2), { count: 2, newest: WATERMARK.newest, ingredientCount: 0, ingredientNewest: null });
      await writesSettled();

      expect(order).toEqual(["products", "meta", "products", "meta"]);
    } finally {
      AsyncStorage.setItem = real;
    }
  });

  /** And the copy left on disk is one save's, not a blend of two. */
  it("leaves metadata describing the blob it was written with", async () => {
    putCatalogue(CATALOGUE, WATERMARK);
    putCatalogue(CATALOGUE.slice(0, 2), { count: 2, newest: WATERMARK.newest, ingredientCount: 0, ingredientNewest: null });
    await writesSettled();

    const stored = JSON.parse((await AsyncStorage.getItem(PRODUCTS_KEY))!);
    const meta = JSON.parse((await AsyncStorage.getItem(META_KEY))!);

    expect(stored.products).toHaveLength(2);
    expect(meta.watermark.count).toBe(2);
  });
});

describe("scanned barcodes", () => {
  it("remembers a lookup, including a confirmed miss", () => {
    putScanned("111", CATALOGUE[0]);
    putScanned("222", null);

    expect(readScanned("111")).toBe(CATALOGUE[0]);
    expect(readScanned("222")).toBeNull();
    expect(readScanned("333")).toBeUndefined();
  });

  it("forgets a lookup once its hour is up", () => {
    putScanned("111", CATALOGUE[0]);

    const realNow = Date.now;
    Date.now = () => realNow() + SCANNED_TTL_MS + 1;
    try {
      expect(readScanned("111")).toBeUndefined();
    } finally {
      Date.now = realNow;
    }
  });

  /**
   * The storage-policy boundary, as a test rather than a comment: which
   * barcodes a person scanned is derived from that person, so it must never
   * reach the disk. See docs/device-storage-policy.md.
   */
  it("never writes scanned barcodes to disk", async () => {
    putScanned("111", CATALOGUE[0]);
    await flushWrites();

    const keys = await AsyncStorage.getAllKeys();
    for (const key of keys) {
      expect(await AsyncStorage.getItem(key)).not.toContain("111");
    }
  });
});

describe("a product scanned this session", () => {
  /**
   * The user photographed a label, the server wrote the row, and their cached
   * list predates it — so the thing they just contributed was missing from
   * Browse until a restart. It read as the app forgetting.
   */
  it("joins the cached list without a refetch", async () => {
    putCatalogue(CATALOGUE, WATERMARK);
    const fresh = product("new", "toner");

    addScannedToCatalogue(fresh);

    const entry = (await readCatalogue())!;
    expect(entry.products.map((p) => p.id)).toContain("new");
    expect(productsForType(entry, "toner").map((p) => p.id)).toEqual(["new"]);
  });

  /**
   * The arrays handed to screens are memoised on identity, so an in-place push
   * would leave Browse rendering the old list with no way to know.
   */
  it("replaces the array rather than mutating it, so screens re-render", async () => {
    putCatalogue(CATALOGUE, WATERMARK);
    const before = productsForType((await readCatalogue())!, "all");

    addScannedToCatalogue(product("new", "toner"));

    expect(productsForType((await readCatalogue())!, "all")).not.toBe(before);
  });

  it("ignores a product with no barcode", async () => {
    putCatalogue(CATALOGUE, WATERMARK);

    addScannedToCatalogue({ ...product("ghost", "serum"), barcode: "" });

    expect((await readCatalogue())!.products).toHaveLength(CATALOGUE.length);
  });

  /**
   * A re-scan must not duplicate the row, which an earlier version achieved by
   * discarding the scan entirely — so a bottle re-photographed *because* its
   * formula had changed kept scoring against the old ingredient list, since
   * `fetchProduct` resolves the id straight out of this cache.
   */
  it("replaces a product already in the list rather than discarding the fresh row", async () => {
    putCatalogue(CATALOGUE, WATERMARK);

    const reformulated = { ...CATALOGUE[0], name: "Product a, reformulated" };
    addScannedToCatalogue(reformulated);

    const entry = (await readCatalogue())!;
    expect(entry.products).toHaveLength(CATALOGUE.length);
    expect(entry.byId.get("a")!.name).toBe("Product a, reformulated");
  });

  /**
   * The trap the previous fix left behind: this product's fresh ingredient
   * objects don't replace what every *other* product in memory still points
   * at for the same name. Left alone, `extractDictionary`'s first-wins merge
   * could persist the stale one — discarding the update this scan was for,
   * and serving it back even to the product just rescanned after the next
   * disk round-trip. Restoring the sharing invariant immediately is what
   * makes that merge's iteration order stop mattering.
   */
  it("propagates a rescanned ingredient's fresh definition to every product sharing it", async () => {
    const aquaStale = { id: "aqua", name: "Aqua", comedogenic: 0 as const, safety: "safe" as const, verified: true, note: "old" };
    const withAqua = (id: string) => ({
      ...product(id, "serum"),
      ingredientIds: ["aqua"],
      ingredients: [aquaStale],
    });
    putCatalogue([withAqua("a"), withAqua("b")], WATERMARK);

    const aquaFresh = { ...aquaStale, note: "corrected", safety: "avoid" as const };
    addScannedToCatalogue({ ...withAqua("a"), ingredients: [aquaFresh] } as unknown as ProductWithIngredients);

    const entry = (await readCatalogue())!;
    const a = entry.byId.get("a")!.ingredients[0];
    const b = entry.byId.get("b")!.ingredients[0];
    expect(a.note).toBe("corrected");
    expect(b.note).toBe("corrected");
    expect(b).toBe(a);
  });

  /**
   * The watermark describes what the server had at the last check. Advancing it
   * here would make the next check agree nothing had changed and swallow every
   * other write that landed meanwhile.
   */
  it("leaves the watermark alone, so the next check still refetches", async () => {
    putCatalogue(CATALOGUE, WATERMARK);

    addScannedToCatalogue(product("new", "toner"));

    expect((await readCatalogue())!.watermark).toEqual(WATERMARK);
  });
});

describe("watermarks", () => {
  it("detects a new product and a rewritten formula alike", () => {
    expect(watermarksMatch(WATERMARK, { ...WATERMARK })).toBe(true);
    expect(watermarksMatch(WATERMARK, { ...WATERMARK, count: 4 })).toBe(false);
    expect(watermarksMatch(WATERMARK, { ...WATERMARK, newest: "2026-09-15T00:00:00Z" })).toBe(false);
  });
});

describe("the sample-data path", () => {
  /**
   * Without Supabase credentials `data/api.ts` serves the fabricated
   * catalogue, and the cache stays out of it entirely — which is what keeps
   * this suite hermetic and free of cross-test leakage.
   */
  it("does not populate the cache", async () => {
    await fetchProducts();

    expect(peekCatalogue()).toBeNull();
    expect(await AsyncStorage.getAllKeys()).toHaveLength(0);
  });
});

/** `putCatalogue` writes in the background on purpose; tests need it landed. */
async function flushWrites(): Promise<void> {
  // Writes are queued, so a fixed number of ticks is a guess. This waits for
  // the queue itself.
  await writesSettled();
}


/**
 * Step 6, item 1: "stop the failures that do not announce themselves".
 *
 * `persist` used to catch everything and warn in development, so an
 * over-quota Android device simply stopped caching and every layer above it
 * went on believing the cache worked. These pin the two halves of the fix —
 * that an oversized payload is measured and skipped rather than attempted and
 * half-written, and that every outcome is recorded where the app can read it.
 */
describe("disk writes announce what happened", () => {
  it("records a successful write, with its size", async () => {
    putCatalogue(CATALOGUE, WATERMARK);
    await writesSettled();

    const outcome = lastCacheWrite();
    expect(outcome?.kind).toBe("ok");
    if (outcome?.kind !== "ok") throw new Error("expected a successful write");
    expect(outcome.bytes).toBeGreaterThan(0);
    // The blob really landed, not just the bookkeeping.
    expect(await AsyncStorage.getItem(PRODUCTS_KEY)).not.toBeNull();
  });

  // Android, because refusing is Android's last resort and only Android's:
  // past the whole-database ceiling there is nowhere left to put the payload,
  // where iOS and web are bounded by their own far larger budgets. Before
  // 6b-4 this ran on every platform at 1.5MB, which is what refused an iPhone
  // a cache it could hold comfortably.
  it("skips a payload past the database ceiling and keeps the copy already on disk", async () => {
    await onPlatform("android", async () => {
      // A good, small catalogue first.
      putCatalogue(CATALOGUE, WATERMARK);
      await writesSettled();
      const good = await AsyncStorage.getItem(PRODUCTS_KEY);
      expect(good).not.toBeNull();

      // Then one that cannot fit anywhere — over the 5MB total, not merely
      // over the per-value budget, so chunking is not an answer either.
      // `description` is a plain string on the persisted product, so this
      // inflates the blob without changing its shape.
      const huge = Array.from({ length: 60 }, (_, i) => ({
        ...product(`huge-${i}`, "serum"),
        description: "x".repeat(100_000),
      })) as unknown as typeof CATALOGUE;
      putCatalogue(huge, { ...WATERMARK, count: huge.length });
      await writesSettled();

      const outcome = lastCacheWrite();
      expect(outcome?.kind).toBe("too-large");
      if (outcome?.kind !== "too-large") throw new Error("expected an over-budget skip");
      expect(outcome.bytes).toBeGreaterThan(outcome.budget);

      // The point of skipping rather than attempting: what was already there
      // survives, so the app falls back to a stale-but-whole catalogue instead
      // of a truncated one.
      expect(await AsyncStorage.getItem(PRODUCTS_KEY)).toBe(good);
    });
  });

  it("records a storage failure instead of swallowing it", async () => {
    const realSetItem = AsyncStorage.setItem;
    // Reassigned by hand rather than with jest.spyOn: AsyncStorage is a module
    // mock here, and `mockRestore` on it does not restore — it leaves every
    // later test reading undefined from storage, failing far from the cause.
    (AsyncStorage as unknown as { setItem: unknown }).setItem = () =>
      Promise.reject(new Error("database or disk is full"));
    try {
      putCatalogue(CATALOGUE, WATERMARK);
      await writesSettled();
    } finally {
      (AsyncStorage as unknown as { setItem: unknown }).setItem = realSetItem;
    }

    const outcome = lastCacheWrite();
    expect(outcome?.kind).toBe("failed");
    if (outcome?.kind !== "failed") throw new Error("expected a recorded failure");
    expect(outcome.message).toContain("disk is full");
  });

  it("does not take the app down when a product cannot be serialised", async () => {
    // The shape a test fixture produced for as long as this file has existed:
    // a product with no `ingredients`, which `extractDictionary` iterates.
    // It always threw; the old catch swallowed it and the cache silently never
    // wrote. Still not fatal — `putCatalogue` depends on that — but now said.
    const malformed = [{ id: "a", type: "serum" }] as unknown as typeof CATALOGUE;
    expect(() => putCatalogue(malformed, WATERMARK)).not.toThrow();
    await writesSettled();

    expect(lastCacheWrite()?.kind).toBe("failed");
    expect(await AsyncStorage.getItem(PRODUCTS_KEY)).toBeNull();
  });
});


/**
 * How far one AsyncStorage value actually stretches.
 *
 * Sized against the real thing rather than the small fixtures above: step 2
 * originally measured the live catalogue at 369KB for 500 products, about 740
 * bytes each, and these fixtures carry comparable text, a real formula
 * length, and the multi-byte characters a Korean catalogue is full of. A
 * budget checked against ASCII-only fixtures would pass here and fail on a
 * handset.
 *
 * That 740-byte figure is now understated. Once the real Open Beauty Facts
 * and DailyMed imports landed, the live catalogue measured closer to 1,640
 * bytes/product — see the note on `DISK_BUDGET_BYTES` in
 * `data/catalogue-cache.ts` for the current number. These fixtures were not
 * re-tuned to match: the two tests below still show the budget mechanism
 * working correctly, but the specific row counts they exercise (1,500 fits,
 * 5,000 doesn't) are no longer a tight read on what a real device holds —
 * treat them as a lower bound on the risk, not the current margin.
 *
 * Note what these tests cannot do. The AsyncStorage mock is JavaScript and has
 * no size limit at all, so nothing here would notice Android's real
 * `CursorWindow` ceiling on its own — that is precisely how a 4MB budget
 * survived review once. What they pin is that the *budget* behaves, and the
 * budget is set from the device limit rather than from what the mock tolerates.
 */
describe("how much fits in one value", () => {
  function formulaFor(i: number) {
    // `name`, not `inciName` — `isUsableIngredient` checks `id` and `name`,
    // and a dictionary entry missing either makes the whole blob unreadable on
    // the next cold start. The small fixtures above all carry an empty
    // formula, so nothing exercised that until this test.
    return Array.from({ length: 30 }, (_, n) => ({
      id: `ing-${(i + n) % 900}`,
      name: `Ingredient Name ${(i + n) % 900}`,
      comedogenic: 0 as const,
      safety: "safe" as const,
      verified: true,
      note: "No published concern at the concentrations used in leave-on products.",
    }));
  }

  function realisticProduct(i: number): ProductWithIngredients {
    return {
      ...product(`p-${i}`, i % 2 === 0 ? "serum" : "cleanser"),
      // Korean names are three UTF-8 bytes per character, which is exactly what
      // `String.length` would under-count.
      name: `수분 진정 세럼 ${i} — Hydrating Calming Serum`,
      brand: `브랜드 ${i % 50}`,
      description: "A lightweight daily serum for dehydrated, easily irritated skin.",
      // `ingredientIds` is what `rehydrate` rebuilds the formula from — the
      // persisted product drops `ingredients` and keeps the names, so a
      // fixture that fills one and not the other round-trips to an empty
      // formula.
      ingredientIds: formulaFor(i).map((ing) => ing.id),
      ingredients: formulaFor(i),
    } as unknown as ProductWithIngredients;
  }

  it("keeps a catalogue that fits, formulas intact, across a cold start", async () => {
    // Comfortably inside the 1.5MB budget at this fixture's ~740 bytes a row
    // — see the note above on how that compares to the live catalogue today.
    const many = Array.from({ length: 1500 }, (_, i) => realisticProduct(i));

    putCatalogue(many, { ...WATERMARK, count: many.length });
    await writesSettled();

    const outcome = lastCacheWrite();
    if (outcome?.kind !== "ok") {
      throw new Error(`expected a clean write, got ${JSON.stringify(outcome)}`);
    }
    expect(outcome.bytes).toBeLessThan(1.5 * 1024 * 1024);

    // A cold start: drop memory entirely, then read from disk alone.
    forgetMemoryLayer();
    const restored = await readCatalogue();
    expect(restored?.products).toHaveLength(1500);
    // The formula survives the normalise/rehydrate round trip, not just the row.
    expect(restored?.products[0].ingredients).toHaveLength(30);
  });

  /**
   * Step 6's stated done-when: 5,000 products cold-start without a failed
   * write. Before 6b-4 this was the test that recorded honestly that a single
   * value does not get there, and refused.
   *
   * Five thousand serialises to roughly 3.1MB — under the 6MB SQLite
   * *database* ceiling everyone quotes, and well over the ~2MB `CursorWindow`
   * limit that applies to reading one value. So at 4MB it wrote cleanly here
   * and would have been unreadable on the next Android cold start, with the
   * failure surfacing nowhere near the write.
   *
   * It is split across values now rather than refused, which is what makes the
   * whole mirror survive without an eviction policy to get wrong. The
   * reassembly is the part worth pinning: every chunk has to come back, in
   * order, with the formulas intact.
   */
  it("splits a catalogue too big for one value across several, and reads it back whole", async () => {
    await onPlatform("android", async () => {
      // Over the 1.5MB per-value budget, inside the 2.5MB total: the case
      // chunking exists for. Five thousand no longer reaches here — see the
      // refusal test below for why.
      const many = Array.from({ length: 2400 }, (_, i) => realisticProduct(i));

      putCatalogue(many, { ...WATERMARK, count: many.length });
      await writesSettled();

      const outcome = lastCacheWrite();
      if (outcome?.kind !== "ok") {
        throw new Error(`expected a clean chunked write, got ${JSON.stringify(outcome)}`);
      }
      expect(outcome.bytes).toBeGreaterThan(1.5 * 1024 * 1024);
      expect(outcome.chunks).toBeGreaterThan(1);

      // The manifest is what a reader follows, and the single-value copy is
      // gone — on Android it would count against the same database ceiling.
      expect(await AsyncStorage.getItem(MANIFEST_KEY)).not.toBeNull();
      expect(await AsyncStorage.getItem(PRODUCTS_KEY)).toBeNull();
      const keys = await AsyncStorage.getAllKeys();
      expect(keys.filter((k) => k.startsWith(CHUNK_PREFIX))).toHaveLength(outcome.chunks);

      // A cold start: drop memory entirely, then reassemble from disk alone.
      forgetMemoryLayer();
      const restored = await readCatalogue();
      expect(restored?.products).toHaveLength(2400);
      expect(restored?.products[0].ingredients).toHaveLength(30);
      // The join has to be in order, and a chunk boundary must not have eaten
      // a multi-byte character: the last product is the one furthest from the
      // start and so the likeliest casualty of a bad reassembly.
      expect(restored?.products[2399].name).toBe(many[2399].name);
    });
  });

  /**
   * Step 6's done-when was 5,000 products cold-starting without a failed
   * write, and on Android this records honestly that it does not get there.
   *
   * Not because 3.1MB will not fit — it is well under the 6MB database
   * ceiling — but because an atomic replace holds two generations at once, so
   * the peak is 6.2MB. The budget is halved for exactly that reason, which
   * puts Android at roughly 1,500 products. Going further needs a bigger
   * database or a catalogue that is not mirrored whole, and both are step 7's
   * to decide; see `ANDROID_TOTAL_BUDGET_BYTES`.
   *
   * Refusing is the safe end of that: the previous copy stays, and the cost is
   * a network fetch on each cold start rather than a half-written catalogue.
   */
  it("refuses a five-thousand product catalogue on Android, where a replace would need twice the ceiling", async () => {
    await onPlatform("android", async () => {
      const many = Array.from({ length: 5000 }, (_, i) => realisticProduct(i));

      putCatalogue(many, { ...WATERMARK, count: many.length });
      await writesSettled();

      const outcome = lastCacheWrite();
      expect(outcome?.kind).toBe("too-large");
      if (outcome?.kind !== "too-large") throw new Error("expected an over-budget skip");
      // The figure the reasoning above depends on, pinned so a change to the
      // payload shape shows up here rather than in the field.
      expect(outcome.bytes).toBeGreaterThan(2 * 1024 * 1024);
      expect(outcome.bytes * 2).toBeGreaterThan(6 * 1024 * 1024);
    });
  });

  it("keeps a five-thousand product catalogue in one value on iOS", async () => {
    await onPlatform("ios", async () => {
      const many = Array.from({ length: 5000 }, (_, i) => realisticProduct(i));

      putCatalogue(many, { ...WATERMARK, count: many.length });
      await writesSettled();

      const outcome = lastCacheWrite();
      if (outcome?.kind !== "ok") {
        throw new Error(`expected a clean write, got ${JSON.stringify(outcome)}`);
      }
      // No per-value cap to work around, so no chunking and no manifest: the
      // Android workaround must not follow iOS around. This is the case that
      // was refused outright before 6b-4.
      expect(outcome.chunks).toBe(1);
      expect(await AsyncStorage.getItem(MANIFEST_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(PRODUCTS_KEY)).not.toBeNull();

      forgetMemoryLayer();
      expect((await readCatalogue())?.products).toHaveLength(5000);
    });
  });

  it("refuses on web, where the localStorage quota is the smallest of the three", async () => {
    await onPlatform("web", async () => {
      const many = Array.from({ length: 5000 }, (_, i) => realisticProduct(i));

      putCatalogue(many, { ...WATERMARK, count: many.length });
      await writesSettled();

      // Chunking buys nothing here — the quota bounds the origin, not the
      // value — so refusing and keeping whatever is already there is the only
      // honest answer.
      expect(lastCacheWrite()?.kind).toBe("too-large");
    });
  });
});


/**
 * The chunked write's own failure modes.
 *
 * Splitting one value into several reintroduces the exact hazard the budget
 * check exists to prevent: a *partial* write is strictly worse than no write,
 * because a catalogue that parses into fewer products than its metadata claims
 * is served with no way for anyone to notice. The manifest is what makes that
 * unrepresentable — written last, so it never names a chunk set that is not
 * already complete — and these pin that it does.
 */
describe("a catalogue split across values", () => {
  /** Over the 1.5MB per-value budget, under the 5MB total: chunks on Android. */
  function chunky() {
    return Array.from({ length: 20 }, (_, i) => ({
      ...product(`chunk-${i}`, "serum"),
      description: "x".repeat(100_000),
    })) as unknown as typeof CATALOGUE;
  }

  async function chunkKeys() {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter((k) => k.startsWith(CHUNK_PREFIX));
  }

  it("reads as a miss when a chunk is gone, rather than serving half a catalogue", async () => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();
      const keys = await chunkKeys();
      expect(keys.length).toBeGreaterThan(1);

      // Storage lost one. The manifest still names it, so the reassembly is
      // short — and a short catalogue must never reach a caller.
      await AsyncStorage.removeItem(keys[0]);

      forgetMemoryLayer();
      expect(await readCatalogue()).toBeNull();
    });
  });

  it("does not split a surrogate pair across a chunk boundary", async () => {
    await onPlatform("android", async () => {
      // Every boundary lands inside a run of astral characters, which are two
      // UTF-16 code units and four UTF-8 bytes each. Slicing by code unit
      // would leave a lone surrogate at the end of one chunk and its partner
      // at the start of the next, and nothing guarantees storage round-trips
      // those — the corruption would survive reassembly and surface as
      // mojibake in a product name. Korean text is three-byte BMP and would
      // not catch this; an emoji is the case that does.
      const astral = Array.from({ length: 20 }, (_, i) => ({
        ...product(`astral-${i}`, "serum"),
        description: "🧴".repeat(20_000),
      })) as unknown as typeof CATALOGUE;

      putCatalogue(astral, WATERMARK);
      await writesSettled();

      const outcome = lastCacheWrite();
      if (outcome?.kind !== "ok") throw new Error("expected a clean chunked write");
      expect(outcome.chunks).toBeGreaterThan(1);

      // Reassembly only. The property that no boundary splits a pair is
      // pinned on `sliceEnd` directly, below — it cannot be caught from here,
      // because a lone surrogate survives the JavaScript storage mock intact
      // and `join("")` puts it back together.
      forgetMemoryLayer();
      const restored = await readCatalogue();
      expect(restored?.products).toHaveLength(20);
      expect(restored?.products[19].description).toBe("🧴".repeat(20_000));
    });
  });

  /**
   * The chunk boundary, tested where it can actually fail.
   *
   * A budget of 5 bytes is the case that separates a correct slice from a
   * naive one: an emoji is four UTF-8 bytes and two UTF-16 code units, so a
   * walk that charges three bytes per code unit stops after the *first* half
   * and hands back an index that splits the pair. Real budgets are megabytes,
   * where whether the split lands mid-pair is a matter of parity and luck —
   * which is exactly why this is asserted on the function rather than on a
   * payload sized to trip it.
   */
  it("never returns an index that splits a surrogate pair", () => {
    // Room for one emoji but not two, and not for half of the second.
    expect(sliceEnd("🧴🧴", 0, 5)).toBe(2);
    // Not even room for one: better to return nothing than half a character.
    expect(sliceEnd("🧴", 0, 3)).toBe(0);
    // Exactly two fit.
    expect(sliceEnd("🧴🧴", 0, 8)).toBe(4);
    // Multi-byte but not astral: three bytes each, no pair to protect.
    expect(sliceEnd("가가가", 0, 7)).toBe(2);
    // ASCII is one byte per code unit.
    expect(sliceEnd("abcdef", 0, 4)).toBe(4);
    // Resumes from an offset without re-measuring what came before.
    expect(sliceEnd("🧴🧴", 2, 5)).toBe(4);
  });

  /**
   * The claim the whole design rests on, and the one thing a post-hoc chunk
   * deletion does *not* prove: a write killed partway leaves the previous
   * catalogue whole, because the manifest that would point at the new chunks
   * is written last and never got written.
   *
   * Without that ordering this is the case that corrupts silently — the reader
   * would follow a manifest to a chunk set that was never finished and serve a
   * catalogue with products missing from the end.
   */
  it("leaves the previous catalogue whole when a write dies partway through", async () => {
    await onPlatform("android", async () => {
      putCatalogue(CATALOGUE, WATERMARK);
      await writesSettled();
      const good = await AsyncStorage.getItem(PRODUCTS_KEY);
      expect(good).not.toBeNull();

      // Fail on the second chunk: the first lands, nothing else does.
      const realSetItem = AsyncStorage.setItem;
      let writes = 0;
      (AsyncStorage as unknown as { setItem: unknown }).setItem = (k: string, v: string) => {
        if (k.startsWith(CHUNK_PREFIX) && writes++ >= 1) {
          return Promise.reject(new Error("database or disk is full"));
        }
        return realSetItem(k, v);
      };
      try {
        putCatalogue(chunky(), { ...WATERMARK, count: 20 });
        await writesSettled();
      } finally {
        (AsyncStorage as unknown as { setItem: unknown }).setItem = realSetItem;
      }

      expect(lastCacheWrite()?.kind).toBe("failed");
      // No manifest, so nothing points at the half-written set.
      expect(await AsyncStorage.getItem(MANIFEST_KEY)).toBeNull();
      // The old copy is untouched — it is only removed *after* a manifest lands.
      expect(await AsyncStorage.getItem(PRODUCTS_KEY)).toBe(good);

      // And the consequence that matters: a cold start still gets a whole
      // catalogue, the old one, rather than a truncated new one.
      forgetMemoryLayer();
      const restored = await readCatalogue();
      expect(restored?.products).toHaveLength(CATALOGUE.length);
    });
  });

  it.each([
    ["not json at all", "{not json"],
    ["valid json of the wrong shape", JSON.stringify({ nope: true })],
    ["a generation that is not a string", JSON.stringify({ generation: 7, chunks: 2 })],
    ["a chunk count that is not a whole number", JSON.stringify({ generation: "g", chunks: 1.5 })],
    ["a chunk count of zero", JSON.stringify({ generation: "g", chunks: 0 })],
    // Not merely absurd — `readProductsBlob` turns this straight into an array
    // length, and an out-of-memory failure is not something the caller's catch
    // can turn back into a cache miss the way every other bad shape is.
    ["a chunk count past any real payload", JSON.stringify({ generation: "g", chunks: 5_000_000 })],
  ])("treats a manifest with %s as a miss", async (_label: string, raw: string) => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();

      await AsyncStorage.setItem(MANIFEST_KEY, raw);

      // Never a throw and never a partial read: the network path is right
      // there, and it is the only safe answer to a manifest we cannot trust.
      forgetMemoryLayer();
      await expect(readCatalogue()).resolves.toBeNull();
    });
  });

  /**
   * The one manifest shape where the guard is the difference, rather than a
   * second net behind one that already caught it.
   *
   * The five cases above all reach a miss whether `parseManifest` validates or
   * not — an absent key, or an empty join that fails to parse, gets there on
   * its own. A `chunks` of `"2"` does not: `Array.from({ length: "2" })`
   * coerces without complaint, so an unguarded reader follows the string,
   * finds both real chunks and returns the catalogue. Only the type check
   * turns that into a miss, which is what makes this the case that pins it.
   *
   * Worth rejecting rather than tolerating for the same reason `SCHEMA_VERSION`
   * exists: a manifest whose shape we do not recognise is one a different
   * build wrote, and guessing at it is how two versions start disagreeing
   * about what is on disk.
   */
  it("rejects a manifest whose chunk count is a string, not a number", async () => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();

      // The live manifest, with only the *type* of `chunks` changed — the
      // generation and the count still name chunks that are really there.
      const live = JSON.parse((await AsyncStorage.getItem(MANIFEST_KEY))!);
      await AsyncStorage.setItem(
        MANIFEST_KEY,
        JSON.stringify({ ...live, chunks: String(live.chunks) }),
      );

      forgetMemoryLayer();
      await expect(readCatalogue()).resolves.toBeNull();
    });
  });

  /**
   * A failed write must not leave its debris for the next one to trip over.
   *
   * `clearChunks` only ran after a manifest landed, so a write that died
   * partway left its chunks behind with nothing to remove them — and the next
   * attempt allocated a *new* generation and left more. On Android every one
   * of those counts against the same 6MB database ceiling, so repeated
   * failures ate the space that made them fail, and eventually the space the
   * profile and saved shelf need. Sweeping before the write bounds it.
   */
  it("does not accumulate debris across repeated failed writes", async () => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();
      const live = await chunkKeys();
      expect(live).toHaveLength(2);

      // Two writes that both die on their second chunk.
      const realSetItem = AsyncStorage.setItem;
      (AsyncStorage as unknown as { setItem: unknown }).setItem = (k: string, v: string) => {
        if (k.startsWith(CHUNK_PREFIX) && k.endsWith("-1")) {
          return Promise.reject(new Error("database or disk is full"));
        }
        return realSetItem(k, v);
      };
      try {
        putCatalogue(chunky(), { ...WATERMARK, count: 21 });
        await writesSettled();
        putCatalogue(chunky(), { ...WATERMARK, count: 22 });
        await writesSettled();
      } finally {
        (AsyncStorage as unknown as { setItem: unknown }).setItem = realSetItem;
      }

      // The live generation is untouched, and at most one failed attempt's
      // worth of debris sits beside it — not one per attempt.
      const after = await chunkKeys();
      for (const key of live) expect(after).toContain(key);
      expect(after.length).toBeLessThanOrEqual(live.length + 1);

      // And the catalogue on disk is still the one the manifest names.
      forgetMemoryLayer();
      expect((await readCatalogue())?.products).toHaveLength(20);
    });
  });

  it("keeps the live chunks when the manifest cannot be read at all", async () => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();
      const live = await chunkKeys();
      expect(live).toHaveLength(2);

      // The manifest read throws rather than returning null, and the write
      // that follows then fails. Both halves matter: a *successful* write
      // sweeps the old generation legitimately, so the property only shows
      // up when the replacement never lands. "I don't know what is live" must
      // not be treated as "nothing is live" — a transient storage error is
      // not a reason to throw a good catalogue away.
      const realGetItem = AsyncStorage.getItem;
      const realSetItem = AsyncStorage.setItem;
      (AsyncStorage as unknown as { getItem: unknown }).getItem = (k: string) =>
        k === MANIFEST_KEY
          ? Promise.reject(new Error("storage unavailable"))
          : realGetItem(k);
      (AsyncStorage as unknown as { setItem: unknown }).setItem = (k: string, v: string) =>
        k.startsWith(CHUNK_PREFIX)
          ? Promise.reject(new Error("database or disk is full"))
          : realSetItem(k, v);
      try {
        putCatalogue(chunky(), { ...WATERMARK, count: 21 });
        await writesSettled();
      } finally {
        (AsyncStorage as unknown as { getItem: unknown }).getItem = realGetItem;
        (AsyncStorage as unknown as { setItem: unknown }).setItem = realSetItem;
      }

      expect(lastCacheWrite()?.kind).toBe("failed");
      const after = await chunkKeys();
      for (const key of live) expect(after).toContain(key);

      forgetMemoryLayer();
      expect((await readCatalogue())?.products).toHaveLength(20);
    });
  });

  it("drops a stranded single-value copy before writing, not after", async () => {
    await onPlatform("android", async () => {
      // A device that chunked once already, with a full-size `PRODUCTS_KEY`
      // left beside the manifest by an interrupted write.
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();
      await AsyncStorage.setItem(PRODUCTS_KEY, "x".repeat(1_000_000));

      // The write fails at the manifest — after the chunks, before the
      // cleanup that used to be the only thing removing this key. That gap is
      // the whole point: a test where the write succeeds passes either way,
      // because the later cleanup gets there in the end. Only a failure shows
      // whether the stranded copy was out of the way *during* the write, which
      // is what decides whether three full-size copies meet at the peak.
      const realSetItem = AsyncStorage.setItem;
      (AsyncStorage as unknown as { setItem: unknown }).setItem = (k: string, v: string) =>
        k === MANIFEST_KEY
          ? Promise.reject(new Error("database or disk is full"))
          : realSetItem(k, v);
      try {
        putCatalogue(chunky(), { ...WATERMARK, count: 21 });
        await writesSettled();
      } finally {
        (AsyncStorage as unknown as { setItem: unknown }).setItem = realSetItem;
      }

      expect(lastCacheWrite()?.kind).toBe("failed");
      expect(await AsyncStorage.getItem(PRODUCTS_KEY)).toBeNull();
    });
  });

  /**
   * The gap the first debris fix left, found by review on PR #113.
   *
   * Sweeping before a write only helps when a write happens. A catalogue that
   * has grown past the budget for good is refused every time, and that return
   * sits before the sweep — so an orphan from an earlier interrupted write was
   * stranded permanently, holding up to a per-value budget of the shared 6MB
   * database. `dropLegacyBlobs` would not take it either: it keeps
   * current-schema chunks on purpose.
   */
  it("sweeps debris even when the write is refused as too large", async () => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();
      const live = await chunkKeys();
      expect(live).toHaveLength(2);

      // An interrupted chunked write leaves one orphan behind.
      const realSetItem = AsyncStorage.setItem;
      (AsyncStorage as unknown as { setItem: unknown }).setItem = (k: string, v: string) =>
        k.startsWith(CHUNK_PREFIX) && k.endsWith("-1")
          ? Promise.reject(new Error("database or disk is full"))
          : realSetItem(k, v);
      try {
        putCatalogue(chunky(), { ...WATERMARK, count: 21 });
        await writesSettled();
      } finally {
        (AsyncStorage as unknown as { setItem: unknown }).setItem = realSetItem;
      }
      expect((await chunkKeys()).length).toBeGreaterThan(live.length);

      // Now the catalogue outgrows the budget, so every write from here is a
      // refusal — including the one that has to take the litter out.
      const huge = Array.from({ length: 60 }, (_, i) => ({
        ...product(`huge-${i}`, "serum"),
        description: "x".repeat(100_000),
      })) as unknown as typeof CATALOGUE;
      putCatalogue(huge, { ...WATERMARK, count: 60 });
      await writesSettled();

      expect(lastCacheWrite()?.kind).toBe("too-large");
      // The live generation survives; the orphan does not.
      expect((await chunkKeys()).sort()).toEqual(live.sort());
      forgetMemoryLayer();
      expect((await readCatalogue())?.products).toHaveLength(20);
    });
  });

  /**
   * A manifest that is present but unparseable is *known*, not unknown.
   *
   * The parse used to share the storage read's catch, so a malformed manifest
   * came back as "could not read" — which skipped the pre-write sweep and the
   * stranded-copy drop, leaving the old chunks and a full-size PRODUCTS_KEY
   * beside the new generation at exactly the peak the budget is sized for.
   * Nothing behind a malformed manifest is reachable, so all of it is debris.
   */
  it("treats an unparseable manifest as known debris, not as an unreadable one", async () => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();
      const stale = await chunkKeys();
      expect(stale).toHaveLength(2);

      // A manifest that is there but garbage, plus a stranded full-size copy.
      await AsyncStorage.setItem(MANIFEST_KEY, "{not json");
      await AsyncStorage.setItem(PRODUCTS_KEY, "x".repeat(1_000_000));

      // The write then fails, which is what makes the *pre*-write behaviour
      // observable — a successful one cleans up afterwards either way.
      const realSetItem = AsyncStorage.setItem;
      (AsyncStorage as unknown as { setItem: unknown }).setItem = (k: string, v: string) =>
        k.startsWith(CHUNK_PREFIX)
          ? Promise.reject(new Error("database or disk is full"))
          : realSetItem(k, v);
      try {
        putCatalogue(chunky(), { ...WATERMARK, count: 21 });
        await writesSettled();
      } finally {
        (AsyncStorage as unknown as { setItem: unknown }).setItem = realSetItem;
      }

      // Both were unreachable the moment the manifest stopped parsing, so both
      // should be gone rather than competing for the ceiling.
      for (const key of stale) expect(await AsyncStorage.getItem(key)).toBeNull();
      expect(await AsyncStorage.getItem(PRODUCTS_KEY)).toBeNull();
    });
  });

  /**
   * Cleanup runs after the manifest lands, which is the moment the write is
   * committed — a reader is already being served the new generation. A failure
   * in that tail used to be recorded as a failed write, which marks the blob
   * stale and holds back the metadata for products that really did land: a
   * cold start then reads the new catalogue under the old watermark and pays
   * for a refetch nothing needed.
   */
  it("still reports a landed write as ok when only the cleanup fails", async () => {
    await onPlatform("android", async () => {
      const realRemoveItem = AsyncStorage.removeItem;
      (AsyncStorage as unknown as { removeItem: unknown }).removeItem = (k: string) =>
        k === PRODUCTS_KEY
          ? Promise.reject(new Error("database or disk is full"))
          : realRemoveItem(k);
      try {
        putCatalogue(chunky(), WATERMARK);
        await writesSettled();
      } finally {
        (AsyncStorage as unknown as { removeItem: unknown }).removeItem = realRemoveItem;
      }

      expect(lastCacheWrite()?.kind).toBe("ok");
      // And the metadata went with it, so the watermark describes what is
      // actually on disk.
      expect(await AsyncStorage.getItem(META_KEY)).not.toBeNull();

      forgetMemoryLayer();
      expect((await readCatalogue())?.products).toHaveLength(20);
    });
  });

  it("reassembles in manifest order rather than the order storage answers in", async () => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();

      // `multiGet` is documented to return a list of pairs, not to return them
      // in the order asked. Reversing is the cheapest way to prove the join
      // reads the manifest's order and not the response's.
      const realMultiGet = AsyncStorage.multiGet;
      (AsyncStorage as unknown as { multiGet: unknown }).multiGet = async (keys: string[]) =>
        (await realMultiGet(keys)).slice().reverse();
      try {
        forgetMemoryLayer();
        const restored = await readCatalogue();
        expect(restored?.products).toHaveLength(20);
        expect(restored?.products[19].description).toBe("x".repeat(100_000));
      } finally {
        (AsyncStorage as unknown as { multiGet: unknown }).multiGet = realMultiGet;
      }
    });
  });

  it("sweeps the previous generation's chunks when it writes new ones", async () => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();
      const first = await chunkKeys();

      putCatalogue(chunky(), { ...WATERMARK, count: 21 });
      await writesSettled();
      const second = await chunkKeys();

      // A new generation writes new keys, so nothing a reader is still
      // entitled to is overwritten mid-write — and the old set does not
      // linger afterwards, which on Android would count against the same
      // database ceiling twice over.
      expect(second).toHaveLength(first.length);
      expect(second.some((k) => first.includes(k))).toBe(false);

      forgetMemoryLayer();
      expect((await readCatalogue())?.products).toHaveLength(20);
    });
  });

  it("drops the chunks and the manifest when a smaller catalogue fits in one value", async () => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();
      expect(await chunkKeys()).not.toHaveLength(0);

      putCatalogue(CATALOGUE, WATERMARK);
      await writesSettled();

      // Otherwise the stale chunks outlive every later write, and a reader
      // following a stale manifest would prefer them over the fresh value.
      expect(await chunkKeys()).toHaveLength(0);
      expect(await AsyncStorage.getItem(MANIFEST_KEY)).toBeNull();

      forgetMemoryLayer();
      expect((await readCatalogue())?.products).toHaveLength(CATALOGUE.length);
    });
  });

  it("clears chunks along with everything else on reset", async () => {
    await onPlatform("android", async () => {
      putCatalogue(chunky(), WATERMARK);
      await writesSettled();
      expect(await chunkKeys()).not.toHaveLength(0);

      await resetCatalogueCache();

      expect(await chunkKeys()).toHaveLength(0);
      expect(await AsyncStorage.getItem(MANIFEST_KEY)).toBeNull();
    });
  });
});

/**
 * The trap the "keep the previous copy" skip opens, and the guard that closes
 * it.
 *
 * Skipping an oversized write protects what is on disk — but memory then holds
 * a catalogue disk does not. A foreground revalidation that finds the server
 * unchanged calls `touchCatalogue`, which writes *metadata alone*. Left
 * unguarded that stamps the new watermark beside the old products, and the
 * next cold start reads a stale catalogue believing it is current: every
 * freshness check agrees, and the device never refetches again.
 */
describe("metadata never blesses a blob it does not describe", () => {
  // Android throughout: a skipped write is what opens this trap, and since
  // 6b-4 that only happens past Android's database ceiling.
  it("holds back the watermark while disk is behind memory", async () => {
    await onPlatform("android", async () => {
      // A good, small catalogue lands on disk at the first watermark.
      putCatalogue(CATALOGUE, WATERMARK);
      await writesSettled();
      const metaBefore = await AsyncStorage.getItem(META_KEY);
      expect(metaBefore).not.toBeNull();

      // An oversized refresh is skipped: memory moves on, disk does not.
      const huge = Array.from({ length: 60 }, (_, i) => ({
        ...product(`huge-${i}`, "serum"),
        description: "x".repeat(100_000),
      })) as unknown as typeof CATALOGUE;
      const newer: CatalogueWatermark = { ...WATERMARK, count: 9999, newest: "2027-01-01T00:00:00Z" };
      putCatalogue(huge, newer);
      await writesSettled();
      expect(lastCacheWrite()?.kind).toBe("too-large");

      // The revalidation that would otherwise do the damage.
      touchCatalogue(newer);
      await writesSettled();

      // Metadata on disk is untouched, so it still describes the products that
      // are actually there.
      expect(await AsyncStorage.getItem(META_KEY)).toBe(metaBefore);

      // And the consequence that matters: a cold start restores the old
      // catalogue with its *old* watermark, which no longer matches the server —
      // so the refetch that repairs everything still happens.
      forgetMemoryLayer();
      const restored = await readCatalogue();
      expect(restored?.products).toHaveLength(CATALOGUE.length);
      expect(watermarksMatch(restored!.watermark, newer)).toBe(false);
    });
  });

/**
   * The same trap, reached by ordering rather than by state.
   *
   * The order these are called in is not the order they run in: a catalogue
   * write is queued first and a metadata write can be queued behind it while
   * that one is still pending. Checking the flag at call time reads it before
   * the catalogue write has set it, so a write later skipped as oversized
   * still lets the metadata through.
   *
   * Deliberately does not await between the two calls, because awaiting is
   * what hides the bug.
   */
  it("holds back metadata queued before the write that fails", async () => {
    await onPlatform("android", async () => {
      putCatalogue(CATALOGUE, WATERMARK);
      await writesSettled();
      const metaBefore = await AsyncStorage.getItem(META_KEY);

      const huge = Array.from({ length: 60 }, (_, i) => ({
        ...product(`huge-${i}`, "serum"),
        description: "x".repeat(100_000),
      })) as unknown as typeof CATALOGUE;
      const newer: CatalogueWatermark = { ...WATERMARK, count: 9999, newest: "2027-01-01T00:00:00Z" };

      // Both queued before either runs.
      putCatalogue(huge, newer);
      touchCatalogue(newer);
      await writesSettled();

      expect(lastCacheWrite()?.kind).toBe("too-large");
      expect(await AsyncStorage.getItem(META_KEY)).toBe(metaBefore);
    });
  });

    it("writes metadata again once a write has landed", async () => {
    putCatalogue(CATALOGUE, WATERMARK);
    await writesSettled();

    const later: CatalogueWatermark = { ...WATERMARK, newest: "2026-12-31T00:00:00Z" };
    touchCatalogue(later);
    await writesSettled();

    const meta = JSON.parse((await AsyncStorage.getItem(META_KEY)) ?? "null");
    expect(meta.watermark.newest).toBe("2026-12-31T00:00:00Z");
  });
});
