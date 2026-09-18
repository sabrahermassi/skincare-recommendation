import {
  classifyBarcodeIdentity,
  looksCosmetic,
} from "../supabase/functions/_shared/product-type-classifier.mjs";

/**
 * The UPC fallback is an identity-only source: it mixes every kind of
 * merchandise together and supplies no ingredient list. These tests call the
 * exact pure policy used by the Edge Function rather than rebuilding regexes
 * from its source text.
 */
describe("looksCosmetic", () => {
  it("accepts a real cosmetic and rejects unrelated merchandise", () => {
    expect(looksCosmetic("Health & Beauty CeraVe Foaming Facial Cleanser")).toBe(true);
    expect(looksCosmetic("Snacks ORGANIC BLUE CORN TORTILLA CHIPS")).toBe(false);
  });
});

describe("classifyBarcodeIdentity", () => {
  it("preserves legitimate disposable non-mask cosmetics", () => {
    expect(
      classifyBarcodeIdentity("Health & Beauty", "Disposable Facial Cleansing Wipes")
    ).toBe("cleanser");
  });

  it.each([
    "Disposable 3-Ply Face Masks",
    "Nexcare Opticlude Orthoptic Eye Patch",
    "Reusable Cloth Face Mask",
    "Silk Sleep Eye Mask",
    "Amblyopia Eye Patch",
    "Air-Purifying Face Mask",
    "Anti-Pollution PM2.5 Filter Mask",
  ])("rejects the ambiguous identity-only mask or patch: %s", (title: string) => {
    expect(classifyBarcodeIdentity("Health & Beauty", title)).toBeNull();
  });

  it.each([
    "Hydrogel Under Eye Patch",
    "Hydrocolloid Acne Pimple Patch",
    "Purifying Clay Face Mask",
    "Deep Cleansing Face Mask",
    "Charcoal Face Mask",
    "Overnight Foot Mask",
    "Overnight Hair Mask",
    "Overnight Sheet Mask",
  ])("also rejects a plausible skincare mask without an ingredient list: %s", (title: string) => {
    // This is intentionally conservative. The existing miss path asks for a
    // label photo, which can identify the formula instead of persisting an
    // unscoreable UPC identity record.
    expect(classifyBarcodeIdentity("Health & Beauty", title)).toBeNull();
  });
});
