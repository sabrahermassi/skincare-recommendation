import AsyncStorage from "@react-native-async-storage/async-storage";

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

  it("skips an oversized payload and keeps the copy already on disk", async () => {
    // A good, small catalogue first.
    putCatalogue(CATALOGUE, WATERMARK);
    await writesSettled();
    const good = await AsyncStorage.getItem(PRODUCTS_KEY);
    expect(good).not.toBeNull();

    // Then one that cannot fit. `description` is a plain string on the
    // persisted product, so this inflates the blob without changing its shape.
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
 * measured the live catalogue at 369KB for 500 products once normalised —
 * about 740 bytes each — so these carry comparable text, a real formula
 * length, and the multi-byte characters a Korean catalogue is full of. A
 * budget checked against ASCII-only fixtures would pass here and fail on a
 * handset.
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
    // Comfortably inside the 1.5MB budget at ~740 bytes a row.
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
   * Step 6's stated done-when is 5,000 products, and this records honestly that
   * a single value does not get there.
   *
   * Five thousand serialises to roughly 3.1MB. That is under the 6MB SQLite
   * *database* ceiling everyone quotes, and well over the ~2MB `CursorWindow`
   * limit that applies to reading one value — so at 4MB it wrote cleanly here
   * and would have been unreadable on the next Android cold start, with the
   * failure surfacing nowhere near the write.
   *
   * Refused at the budget instead. Reaching 5,000 needs the payload split
   * across keys, or the windowing in step 6's item 3 so the whole catalogue is
   * never resident. Step 7 lifts the import cap and must not land before one
   * of those does.
   */
  it("refuses a five-thousand product catalogue rather than writing an unreadable one", async () => {
    const many = Array.from({ length: 5000 }, (_, i) => realisticProduct(i));

    putCatalogue(many, { ...WATERMARK, count: many.length });
    await writesSettled();

    const outcome = lastCacheWrite();
    expect(outcome?.kind).toBe("too-large");
    if (outcome?.kind !== "too-large") throw new Error("expected an over-budget skip");
    // The figure the comment above is reasoning about, pinned so a future
    // change to the payload shape shows up here rather than in the field.
    expect(outcome.bytes).toBeGreaterThan(2 * 1024 * 1024);
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
  it("holds back the watermark while disk is behind memory", async () => {
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
