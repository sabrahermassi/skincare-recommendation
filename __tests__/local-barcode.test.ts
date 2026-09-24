/**
 * #196: a barcode the phone's catalogue already holds is answered on the
 * device — no network call, offline too — and an old copy is re-checked in
 * the background, replaced only when its formula changed.
 */
const mockInvoke = jest.fn();
jest.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  LOOKUP_FUNCTION: "product-lookup",
  OCR_FUNCTION: "label-ocr",
}));

import { LOCAL_RECHECK_AFTER_MS, fetchProductByBarcode } from "@/data/api";
import {
  DISK_TTL_MS,
  barcodeWinner,
  peekCatalogue,
  productByBarcode,
  putCatalogue,
  resetCatalogueCache,
  type CatalogueWatermark,
} from "@/data/catalogue-cache";
import type { Ingredient, ProductWithIngredients } from "@/data/types";

const WATERMARK: CatalogueWatermark = { count: 1, newest: "2026-09-20T00:00:00Z", ingredientCount: 0, ingredientNewest: null };
const BARCODE = "8801234567890";
const NOW = Date.parse("2026-09-24T00:00:00Z");

function ingredient(name: string): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true };
}

function product(overrides: Partial<ProductWithIngredients> = {}): ProductWithIngredients {
  const ingredients = [ingredient("water"), ingredient("glycerin")];
  const barcode = overrides.barcode ?? BARCODE;
  return {
    id: `obf-${barcode}`,
    barcode,
    brand: "Brand",
    name: "Toner",
    type: "toner",
    productType: "serum",
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    fetchedAt: "2026-09-23T00:00:00Z",
    source: "obf",
    ingredientIds: ingredients.map((i) => i.id),
    inStock: true,
    ingredients,
    ...overrides,
  };
}

/** A `product-lookup` response row with this formula, in the shape the Edge Function returns. */
function lookupRow(names: string[], barcode = BARCODE) {
  return {
    id: `obf-${barcode}`,
    barcode,
    brand: "Brand",
    name: "Toner",
    type: "toner",
    description: null,
    image_url: null,
    volume: null,
    price_krw: null,
    in_stock: true,
    suitable_for: [],
    targets: [],
    attribution: null,
    fetched_at: "2026-09-24T00:00:00Z",
    formula_changed_at: null,
    product_ingredients: names.map((name, position) => ({
      position,
      ingredients: { inci_name: name, comedogenic: null, safety: "safe", note: null, verified: true, functions: null },
    })),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let now = NOW;

beforeEach(async () => {
  mockInvoke.mockReset();
  await resetCatalogueCache();
  now = NOW;
  jest.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("answering a barcode from the device", () => {
  it("answers a known barcode with no network call", async () => {
    const held = product();
    putCatalogue([held], WATERMARK);

    expect(await fetchProductByBarcode(BARCODE)).toEqual({ ok: true, value: held });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("still asks product-lookup about a barcode it doesn't hold", async () => {
    putCatalogue([product()], WATERMARK);
    mockInvoke.mockResolvedValue({ data: null, error: { context: { status: 404 } } });

    expect(await fetchProductByBarcode("8809999999999")).toEqual({ ok: true, value: null });
    expect(mockInvoke).toHaveBeenCalledWith("product-lookup", expect.objectContaining({ body: { barcode: "8809999999999" } }));
  });

  it("answers from the catalogue even after an earlier miss for the same barcode", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { context: { status: 404 } } });
    expect(await fetchProductByBarcode(BARCODE)).toEqual({ ok: true, value: null });

    const arrived = product();
    putCatalogue([arrived], WATERMARK);
    expect(await fetchProductByBarcode(BARCODE)).toEqual({ ok: true, value: arrived });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("answers offline from the device instead of reporting a failure", async () => {
    putCatalogue([product({ fetchedAt: "2026-01-01T00:00:00Z" })], WATERMARK);
    mockInvoke.mockRejectedValue(new TypeError("Network request failed"));

    const result = await fetchProductByBarcode(BARCODE);
    expect(result.ok && result.value?.id).toBe(`obf-${BARCODE}`);
    await flush();
  });
});

// #267 review: an app left running past the catalogue's window must not keep
// answering from it without asking — but offline, its copy still helps.
describe("a catalogue past its window", () => {
  it("asks the server instead of answering from it", async () => {
    putCatalogue([product()], WATERMARK);
    now = NOW + DISK_TTL_MS + 1000;
    mockInvoke.mockResolvedValue({ data: lookupRow(["water", "glycerin"]), error: null });

    await fetchProductByBarcode(BARCODE);
    expect(mockInvoke).toHaveBeenCalledWith("product-lookup", expect.objectContaining({ body: { barcode: BARCODE } }));
  });

  it("still answers from it when the server can't be reached", async () => {
    const held = product();
    putCatalogue([held], WATERMARK);
    now = NOW + DISK_TTL_MS + 1000;
    mockInvoke.mockResolvedValue({ data: null, error: new TypeError("Network request failed") });

    expect(await fetchProductByBarcode(BARCODE)).toEqual({ ok: true, value: held });
  });

  it("still reports a genuine miss as a miss", async () => {
    putCatalogue([product()], WATERMARK);
    now = NOW + DISK_TTL_MS + 1000;
    mockInvoke.mockResolvedValue({ data: null, error: { context: { status: 404 } } });

    expect(await fetchProductByBarcode(BARCODE)).toEqual({ ok: true, value: null });
  });
});

describe("the barcode index", () => {
  it("leaves rows with no barcode out", () => {
    const entry = putCatalogue([product({ id: "curated-1", barcode: "" })], WATERMARK);
    expect(productByBarcode(entry, "")).toBeUndefined();
  });

  it("prefers a user's read of the box over a register row, and a register row over an import", () => {
    const imported = product();
    const register = product({ id: `mfds-${BARCODE}`, source: "mfds" });
    const userRead = product({ id: `ocr-${BARCODE}`, source: "ocr", fetchedAt: "2025-01-01T00:00:00Z" });

    expect(barcodeWinner(imported, register)).toBe(register);
    expect(barcodeWinner(register, userRead)).toBe(userRead);
    const entry = putCatalogue([imported, userRead, register], WATERMARK);
    expect(productByBarcode(entry, BARCODE)).toBe(userRead);
  });

  it("breaks a same-source tie by the newer read, then the lower id, in any order", () => {
    const older = product({ id: "obf-b", fetchedAt: "2026-01-01T00:00:00Z" });
    const newer = product({ id: "obf-a", fetchedAt: "2026-06-01T00:00:00Z" });
    expect(barcodeWinner(older, newer)).toBe(newer);
    expect(barcodeWinner(newer, older)).toBe(newer);

    const x = product({ id: "obf-x" });
    const y = product({ id: "obf-y" });
    expect(barcodeWinner(x, y)).toBe(x);
    expect(barcodeWinner(y, x)).toBe(x);
  });

  it("falls back to the id's prefix for a row with no source", () => {
    const imported = product({ source: undefined });
    const userRead = product({ id: `ocr-${BARCODE}`, source: undefined });
    expect(barcodeWinner(imported, userRead)).toBe(userRead);
  });
});

describe("re-checking an old local copy", () => {
  const OLD = new Date(NOW - LOCAL_RECHECK_AFTER_MS - 1000).toISOString();

  it("doesn't re-check a recent copy", async () => {
    putCatalogue([product()], WATERMARK);
    await fetchProductByBarcode(BARCODE);
    await flush();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("shows an old copy at once, and keeps it when the formula hasn't changed", async () => {
    const code = "8800000000011";
    const held = product({ barcode: code, fetchedAt: OLD });
    putCatalogue([held], WATERMARK);
    mockInvoke.mockResolvedValue({ data: lookupRow(["water", "glycerin"], code), error: null });

    expect(await fetchProductByBarcode(code)).toEqual({ ok: true, value: held });
    await flush();

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(peekCatalogue()!.byId.get(held.id)).toBe(held);
    // Remembered, so the next scan neither re-checks nor changes answer.
    expect(await fetchProductByBarcode(code)).toEqual({ ok: true, value: held });
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // #267 review: past the hour's scan memory, but inside the week, it still
    // isn't asked about again — its fetchedAt stays old on purpose.
    now = NOW + 2 * 60 * 60 * 1000;
    expect(await fetchProductByBarcode(code)).toEqual({ ok: true, value: held });
    await flush();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("replaces an old copy whose formula changed, for the next scan and the catalogue", async () => {
    const code = "8800000000028";
    const held = product({ barcode: code, fetchedAt: OLD });
    putCatalogue([held], WATERMARK);
    mockInvoke.mockResolvedValue({ data: lookupRow(["water", "glycerin", "niacinamide"], code), error: null });

    expect(await fetchProductByBarcode(code)).toEqual({ ok: true, value: held });
    await flush();

    const next = await fetchProductByBarcode(code);
    expect(next.ok && next.value?.ingredientIds).toEqual(["water", "glycerin", "niacinamide"]);
    expect(peekCatalogue()!.byId.get(held.id)?.ingredientIds).toEqual(["water", "glycerin", "niacinamide"]);
    expect(held.fetchedAt).toBe(OLD);
  });
});
