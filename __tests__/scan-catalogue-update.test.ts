import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

import {
  SCAN_WRITE_DELAY_MS,
  addScannedToCatalogue,
  lastCacheWrite,
  peekCatalogue,
  putCatalogue,
  resetCatalogueCache,
  touchCatalogue,
  writesSettled,
  type CatalogueWatermark,
} from "@/data/catalogue-cache";
import type { Ingredient, ProductWithIngredients } from "@/data/types";

/**
 * #197: a scan that brings back what the catalogue already holds costs
 * nothing, and one that changes a product replaces only that product — every
 * other product keeps its object, and so its cached score.
 */

// Captured before anything schedules a write: the cache registers its
// background listener lazily, on the first delayed write.
const appStateListeners: ((state: string) => void)[] = [];
jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, listener: (state: string) => void) => {
  appStateListeners.push(listener);
  return { remove: () => undefined };
}) as unknown as typeof AppState.addEventListener);

const WATERMARK: CatalogueWatermark = { count: 3, newest: "2026-09-20T00:00:00Z", ingredientCount: 0, ingredientNewest: null };

function ingredient(name: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides };
}

const WATER = ingredient("water");
const GLYCERIN = ingredient("glycerin");
const RETINOL = ingredient("retinol", { note: "A vitamin A derivative" });

function product(id: string, ingredients: Ingredient[], overrides: Partial<ProductWithIngredients> = {}): ProductWithIngredients {
  return {
    id,
    barcode: `880000000000${id.length}${id}`,
    brand: "Brand",
    name: `Product ${id}`,
    type: "serum",
    productType: "serum",
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    fetchedAt: "2026-09-20T00:00:00Z",
    ingredientIds: ingredients.map((i) => i.id),
    inStock: true,
    ingredients,
    ...overrides,
  };
}

/** A copy as the single-row select delivers it: its own ingredient objects, not the shared ones. */
function rescan(held: ProductWithIngredients, overrides: Partial<ProductWithIngredients> = {}): ProductWithIngredients {
  return { ...held, ingredients: held.ingredients.map((i) => ({ ...i })), fetchedAt: "2026-09-24T00:00:00Z", ...overrides };
}

let a: ProductWithIngredients;
let b: ProductWithIngredients;
let c: ProductWithIngredients;

beforeEach(async () => {
  await resetCatalogueCache();
  a = product("a", [WATER, RETINOL]);
  b = product("b", [WATER, GLYCERIN]);
  c = product("c", [GLYCERIN, RETINOL]);
  putCatalogue([a, b, c], WATERMARK);
  await writesSettled();
});

describe("a rescan of an unchanged product", () => {
  it("does nothing — same entry, same array, no write — even with a newer fetchedAt", async () => {
    const entry = peekCatalogue();
    const products = entry!.products;
    const written = lastCacheWrite();

    addScannedToCatalogue(rescan(a));
    await writesSettled();

    expect(peekCatalogue()).toBe(entry);
    expect(peekCatalogue()!.products).toBe(products);
    expect(lastCacheWrite()).toBe(written);
  });
});

describe("a rescan that changes a product", () => {
  it("replaces that product with a new object and leaves every other product's object alone", () => {
    addScannedToCatalogue(rescan(a, { name: "Product a, renamed" }));

    const next = peekCatalogue()!;
    expect(next.byId.get("a")).not.toBe(a);
    expect(next.byId.get("a")!.name).toBe("Product a, renamed");
    expect(a.name).toBe("Product a");
    expect(next.byId.get("b")).toBe(b);
    expect(next.byId.get("c")).toBe(c);
  });

  it("keeps ingredient objects shared rather than taking the scan's copies", () => {
    addScannedToCatalogue(rescan(a, { name: "Product a, renamed" }));

    const renamed = peekCatalogue()!.byId.get("a")!;
    expect(renamed.ingredients[0]).toBe(WATER);
    expect(renamed.ingredients[1]).toBe(RETINOL);
  });

  it("carries a changed definition to every product that shares it, and only to those", () => {
    const corrected = { ...RETINOL, note: "Corrected note" };
    addScannedToCatalogue({ ...rescan(a), ingredients: [{ ...WATER }, corrected] });

    const next = peekCatalogue()!;
    expect(next.byId.get("a")!.ingredients[1]).toBe(corrected);
    expect(next.byId.get("c")).not.toBe(c);
    expect(next.byId.get("c")!.ingredients[1]).toBe(corrected);
    expect(next.byId.get("b")).toBe(b);
  });

  // #268 review: only fetchedAt is ignored.
  it("treats a metadata-only change as a change", () => {
    addScannedToCatalogue(rescan(a, { volume: "50ml", inStock: false }));
    const next = peekCatalogue()!.byId.get("a")!;
    expect(next).not.toBe(a);
    expect(next.volume).toBe("50ml");
    expect(next.inStock).toBe(false);
  });

  it("treats a new formula as a change", () => {
    addScannedToCatalogue(rescan(a, { ingredients: [{ ...WATER }, { ...GLYCERIN }], ingredientIds: ["water", "glycerin"] }));
    expect(peekCatalogue()!.byId.get("a")!.ingredientIds).toEqual(["water", "glycerin"]);
  });
});

// #268 review, CodeRabbit: product-lookup's select omits `source` entirely,
// unlike the on-device list's, so a plain re-scan of an already-known,
// catalogue-sourced product would otherwise always look changed — defeating
// the fast path this whole PR exists for.
describe("a rescan whose lookup source came back undefined", () => {
  it("is not treated as a change on its own", async () => {
    const sourced = product("with-source", [WATER], { source: "obf" });
    putCatalogue([sourced], WATERMARK);
    await writesSettled();

    const entry = peekCatalogue();
    addScannedToCatalogue(rescan(sourced, { source: undefined }));
    await writesSettled();

    expect(peekCatalogue()).toBe(entry);
  });

  it("keeps the held source if some other field genuinely changed", () => {
    const sourced = product("with-source-2", [WATER], { source: "obf" });
    putCatalogue([sourced], WATERMARK);

    addScannedToCatalogue(rescan(sourced, { source: undefined, volume: "50ml" }));

    expect(peekCatalogue()!.byId.get("with-source-2")!.source).toBe("obf");
  });
});

describe("the disk write after a scan", () => {
  it("waits, then lands, and several scans share one write", async () => {
    jest.useFakeTimers();
    try {
      const written = lastCacheWrite();
      addScannedToCatalogue(product("new-1", [WATER]));
      addScannedToCatalogue(product("new-2", [GLYCERIN]));
      await Promise.resolve();
      expect(lastCacheWrite()).toBe(written);

      jest.advanceTimersByTime(SCAN_WRITE_DELAY_MS);
      jest.useRealTimers();
      await writesSettled();
      expect(lastCacheWrite()).not.toBe(written);
      expect(lastCacheWrite()!.kind).toBe("ok");
    } finally {
      jest.useRealTimers();
    }
  });

  // #268 review round 2: a current watermark must not land beside pre-scan products.
  it("holds back a metadata-only write while a scan write is waiting, then lands both together", async () => {
    const META_KEY = "forme-catalogue-meta-v3";
    const before = await AsyncStorage.getItem(META_KEY);

    addScannedToCatalogue(product("new-4", [WATER]));
    touchCatalogue({ ...WATERMARK, count: 99 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await AsyncStorage.getItem(META_KEY)).toBe(before);

    await writesSettled();
    expect(JSON.parse((await AsyncStorage.getItem(META_KEY))!).watermark.count).toBe(99);
  });

  // #268 review, CodeRabbit: an unrelated write landing successfully must not
  // clear diskBlobStale on the scan write's account — a persistMeta call
  // right after would otherwise stamp the current watermark beside a
  // products blob still missing the scan.
  it("keeps a metadata-only write held back even after an unrelated write lands while the scan write is still pending", async () => {
    const META_KEY = "forme-catalogue-meta-v3";

    addScannedToCatalogue(product("new-5", [WATER]));

    // Called directly, not through the scan path — lands and succeeds while
    // the scan write above is still only pending.
    putCatalogue([a, b, c], { ...WATERMARK, count: 7 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(JSON.parse((await AsyncStorage.getItem(META_KEY))!).watermark.count).toBe(7);

    touchCatalogue({ ...WATERMARK, count: 42 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(JSON.parse((await AsyncStorage.getItem(META_KEY))!).watermark.count).toBe(7);

    await writesSettled();
    expect(JSON.parse((await AsyncStorage.getItem(META_KEY))!).watermark.count).toBe(42);
  });

  it("is flushed when the app goes to the background", async () => {
    addScannedToCatalogue(product("new-3", [WATER]));
    const written = lastCacheWrite();
    expect(appStateListeners.length).toBeGreaterThan(0);

    for (const listener of appStateListeners) listener("background");
    // Well inside SCAN_WRITE_DELAY_MS, and without `writesSettled` (which
    // flushes too): only the listener can have started this write.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(lastCacheWrite()).not.toBe(written);
  });
});
