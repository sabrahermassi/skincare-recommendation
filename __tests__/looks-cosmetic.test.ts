import { looksCosmetic } from "../supabase/functions/_shared/product-type-classifier.mjs";

/**
 * The gate `scripts/audit-catalogue-quality.mjs` runs to find non-cosmetic rows.
 * Called directly rather than rebuilding its regex from source text.
 */
describe("looksCosmetic", () => {
  it("accepts a real cosmetic and rejects unrelated merchandise", () => {
    expect(looksCosmetic("Health & Beauty CeraVe Foaming Facial Cleanser")).toBe(true);
    expect(looksCosmetic("Snacks ORGANIC BLUE CORN TORTILLA CHIPS")).toBe(false);
  });

  it("accepts real personal-care products this gate previously missed", () => {
    // Found by issue #86's audit script against the live catalogue:
    // CRYSTAL Mineral Deodorant Roll-On was flagged as non-cosmetic junk
    // alongside real junk (a tortilla-chip listing, a Pepsi can), purely
    // because "deodorant"/"antiperspirant" were absent here — even though
    // `guessType`'s own AFTER_MASK_RULES already types deodorants correctly.
    expect(
      looksCosmetic("CRYSTAL Mineral Deodorant Roll-On Unscented Body Deodorant Crystal Essence")
    ).toBe(true);
    expect(looksCosmetic("Secret Antiperspirant Deodorant Invisible Solid")).toBe(true);
  });
});
