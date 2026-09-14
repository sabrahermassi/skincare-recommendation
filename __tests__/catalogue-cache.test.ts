import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  abandonDiskRead,
  addScannedToCatalogue,
  DISK_TTL_MS,
  peekCatalogue,
  productById,
  productsForType,
  putCatalogue,
  forgetMemoryLayer,
  putScanned,
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

const WATERMARK: CatalogueWatermark = { count: 3, newest: "2026-09-14T00:00:00Z" };

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

  it("ignores a stored catalogue past its TTL", async () => {
    putCatalogue(CATALOGUE, WATERMARK);
    await flushWrites();

    const meta = JSON.parse((await AsyncStorage.getItem("forme-catalogue-meta-v1"))!);
    meta.storedAt = Date.now() - DISK_TTL_MS - 1;
    await AsyncStorage.setItem("forme-catalogue-meta-v1", JSON.stringify(meta));
    forgetMemoryLayer();

    expect(await readCatalogue()).toBeNull();
  });

  it("treats unreadable stored data as a miss rather than throwing", async () => {
    await AsyncStorage.setItem("forme-catalogue-meta-v1", "{not json");

    await expect(readCatalogue()).resolves.toBeNull();
  });

  /**
   * Valid JSON of the wrong shape is the case a `JSON.parse` + cast cannot
   * catch. It reaches `buildEntry` intact and only fails later, inside render,
   * where `matchProduct` and `ProductRow` dereference `product.ingredients`.
   */
  it.each([
    ["a product missing its ingredients array", JSON.stringify([{ id: "a", type: "serum" }])],
    ["an array of empty objects", JSON.stringify([{}])],
    ["metadata with a non-numeric storedAt", null],
  ] as const)("treats %s as a miss", async (_label: string, rawProducts: string | null) => {
    if (rawProducts === null) {
      await AsyncStorage.setItem(
        "forme-catalogue-meta-v1",
        JSON.stringify({ watermark: WATERMARK, storedAt: "yesterday" }),
      );
      await AsyncStorage.setItem("forme-catalogue-v1", JSON.stringify(CATALOGUE));
    } else {
      await AsyncStorage.setItem(
        "forme-catalogue-meta-v1",
        JSON.stringify({ watermark: WATERMARK, storedAt: Date.now() }),
      );
      await AsyncStorage.setItem("forme-catalogue-v1", rawProducts);
    }

    await expect(readCatalogue()).resolves.toBeNull();
  });

  /**
   * The splash gives up on a disk read after two seconds. Without releasing it,
   * every later read returns that same never-settling promise and Browse waits
   * on it forever — a launch that recovered into a skeleton that cannot.
   */
  it("misses instead of hanging once a stuck read is abandoned", async () => {
    const getItem = jest
      .spyOn(AsyncStorage, "getItem")
      .mockReturnValue(new Promise<string | null>(() => {}));

    try {
      void readCatalogue();
      abandonDiskRead();

      await expect(readCatalogue()).resolves.toBeNull();
    } finally {
      getItem.mockRestore();
    }
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
  await new Promise((resolve) => setTimeout(resolve, 0));
}
