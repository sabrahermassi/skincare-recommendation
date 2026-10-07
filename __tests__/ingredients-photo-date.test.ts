import { toRow } from "../scripts/import-obf.mjs";
import { fetchIngredients } from "../scripts/reconcile-obf.mjs";
import { ingredientsPhotographedAt } from "../supabase/functions/_shared/ingredients-photo-date.mjs";

/**
 * #446: how old a barcode product's ingredient list is. Open Beauty Facts keeps
 * every uploaded photo under its number and the photo chosen for a role and a
 * language under `<role>_<language>`, pointing back by `imgid`. The shapes
 * below are the ones its API and its export file answered with on 7 October
 * 2026 (product 20532734, and the first records of the export).
 */

/** Seconds since 1970, as OBF stores an upload time. */
const at = (iso: string) => Date.parse(iso) / 1000;

const SIZES = { 100: { w: 75, h: 100 }, 400: { w: 300, h: 400 }, full: { w: 2000, h: 2666 } };

describe("ingredientsPhotographedAt", () => {
  it("takes the upload time of the photo selected as the ingredients picture, not of any other photo", () => {
    const images = {
      1: { sizes: SIZES, uploaded_t: "1523208545", uploader: "someone" },
      2: { sizes: SIZES, uploaded_t: "1523208574", uploader: "someone" },
      3: { sizes: SIZES, uploaded_t: "1700000000", uploader: "someone" },
      front_fr: { imgid: "1", rev: "9", sizes: SIZES },
      ingredients_fr: { imgid: "2", rev: "7", sizes: SIZES },
    };
    expect(ingredientsPhotographedAt(images)).toBe("2018-04-08T17:29:34.000Z");
  });

  it("reads an upload time stored as a number, and a photo number stored as one", () => {
    const images = { 4: { uploaded_t: at("2023-06-01T00:00:00Z") }, ingredients_en: { imgid: 4 } };
    expect(ingredientsPhotographedAt(images)).toBe("2023-06-01T00:00:00.000Z");
  });

  it("takes the newest when several languages have an ingredients photo", () => {
    const images = {
      1: { uploaded_t: at("2016-03-01T00:00:00Z") },
      2: { uploaded_t: at("2024-09-15T12:00:00Z") },
      3: { uploaded_t: at("2021-01-01T00:00:00Z") },
      ingredients_fr: { imgid: "1" },
      ingredients_en: { imgid: "2" },
      ingredients_de: { imgid: "3" },
    };
    expect(ingredientsPhotographedAt(images)).toBe("2024-09-15T12:00:00.000Z");
  });

  it("is null when there are photos but none of the ingredient list", () => {
    expect(ingredientsPhotographedAt({ 1: { uploaded_t: "1561593950" }, front_en: { imgid: "1" } })).toBeNull();
    expect(ingredientsPhotographedAt({})).toBeNull();
    expect(ingredientsPhotographedAt(null)).toBeNull();
  });

  it("is null when the selected photo is missing or its time is not a date", () => {
    expect(ingredientsPhotographedAt({ ingredients_fr: { imgid: "9" } })).toBeNull();
    expect(ingredientsPhotographedAt({ 2: { uploaded_t: "" }, ingredients_fr: { imgid: "2" } })).toBeNull();
    expect(ingredientsPhotographedAt({ 2: { uploaded_t: "soon" }, ingredients_fr: { imgid: "2" } })).toBeNull();
    expect(ingredientsPhotographedAt({ 2: { uploaded_t: 0 }, ingredients_fr: { imgid: "2" } })).toBeNull();
    expect(ingredientsPhotographedAt({ 2: {}, ingredients_fr: {} })).toBeNull();
  });

  it("is undefined, not null, when nobody asked for the photos: nothing may be written over a stored date", () => {
    expect(ingredientsPhotographedAt(undefined)).toBeUndefined();
  });

  it("reads the nested layout OBF has described, should it ever answer in it", () => {
    const images = {
      uploaded: { 5: { uploaded_t: at("2025-02-02T00:00:00Z") } },
      selected: { front: { en: { imgid: "1" } }, ingredients: { en: { imgid: "5" } } },
    };
    expect(ingredientsPhotographedAt(images)).toBe("2025-02-02T00:00:00.000Z");
  });
});

describe("the import", () => {
  const KNOWN = new Set(["aqua", "glycerin", "niacinamide", "panthenol"]);
  const product = (images?: unknown) => ({
    code: "8801234567890",
    product_name: "Barrier Serum",
    brands: "Some Brand",
    categories_tags: ["en:face-serums"],
    ingredients_text: "Aqua, Glycerin, Niacinamide, Panthenol",
    ...(images === undefined ? {} : { images }),
  });
  const row = (images?: unknown) => (toRow(product(images), KNOWN, [], undefined, new Map()) as { product: Record<string, unknown> }).product;

  it("stores the date of the selected ingredients photo, the newest across languages", () => {
    const images = {
      1: { uploaded_t: "1523208574" },
      2: { uploaded_t: at("2022-05-05T00:00:00Z") },
      ingredients_fr: { imgid: "1" },
      ingredients_en: { imgid: "2" },
    };
    expect(row(images).ingredients_photographed_at).toBe("2022-05-05T00:00:00.000Z");
  });

  it("stores null for a product with no ingredients photo, or with no photos at all", () => {
    expect(row({ 1: { uploaded_t: "1523208574" }, front_fr: { imgid: "1" } })).toHaveProperty("ingredients_photographed_at", null);
    // The import asks for `images`, so one that is missing is "no photo", and is written as that.
    expect(row()).toHaveProperty("ingredients_photographed_at", null);
  });
});

describe("the reconcile read", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const respond = (product: Record<string, unknown>) => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, headers: new Headers(), json: async () => ({ status: 1, product }) });
    global.fetch = fetchMock as unknown as typeof global.fetch;
    return fetchMock;
  };

  it("asks OBF for the photos, and returns how old the list is beside its text", async () => {
    const fetchMock = respond({ ingredients_text: "Aqua, Glycerin", images: { 2: { uploaded_t: "1523208574" }, ingredients_fr: { imgid: "2" } } });
    expect(await fetchIngredients("20532734")).toEqual({ ok: true, text: "Aqua, Glycerin", photographedAt: "2018-04-08T17:29:34.000Z", attempts: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/fields=code,ingredients_text,images$/);
  });

  it("returns null, which is written, for a product OBF has no ingredients photo of", async () => {
    respond({ ingredients_text: "Aqua, Glycerin" });
    expect(await fetchIngredients("20532734")).toMatchObject({ ok: true, photographedAt: null });
  });
});
