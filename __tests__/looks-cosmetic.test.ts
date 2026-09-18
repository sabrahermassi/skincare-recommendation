import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `looksCosmetic` and `hasSkincareContext` gate the UPC barcode-database
 * fallback in `supabase/functions/product-lookup/index.ts` — the
 * last-resort source for an unrecognised barcode, with no ingredient list
 * and no dedicated skincare category, so they are the only thing standing
 * between a genuine miss and writing an arbitrary piece of merchandise (or
 * a medical device, or a sleep accessory) into the catalogue as if it were
 * skincare (the ORGANIC BLUE CORN TORTILLA CHIPS row `lookupBarcodeDb`'s own
 * comment already documents).
 *
 * The Deno file imports `jsr:` specifiers Jest can't resolve, so the
 * regexes inside both functions are read as source text and reconstructed
 * here — same technique `classifier-parity.test.ts` already uses for
 * `guessType`.
 */

const SOURCE_PATH = join(__dirname, "..", "supabase/functions/product-lookup/index.ts");

/**
 * Reads a function's body from source text and reconstructs its regex
 * literals, in order, as real `RegExp` objects — same technique
 * `classifier-parity.test.ts` already uses for `guessType`.
 */
function extractRegexes(functionSignature: string, expectedCount: number): RegExp[] {
  const source = readFileSync(SOURCE_PATH, "utf8");
  const start = source.indexOf(functionSignature);
  if (start === -1) throw new Error(`${functionSignature} not found in product-lookup/index.ts`);
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);

  const literals = [...body.matchAll(/\/(?:\\.|[^/\n])*\/[a-z]*/g)].map((m) => m[0]);
  if (literals.length !== expectedCount) {
    throw new Error(
      `expected ${expectedCount} regex literal(s) after "${functionSignature}", found ${literals.length}`
    );
  }
  return literals.map((literal) => {
    const lastSlash = literal.lastIndexOf("/");
    return new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));
  });
}

function looksCosmetic(text: string): boolean {
  const [medicalExclusion, cosmeticSignal] = extractRegexes(
    "function looksCosmetic(text: string): boolean {",
    2
  );
  if (medicalExclusion.test(text)) return false;
  return cosmeticSignal.test(text);
}

function hasSkincareContext(text: string): boolean {
  const [signal] = extractRegexes("function hasSkincareContext(text: string): boolean {", 1);
  return signal.test(text);
}

describe("looksCosmetic", () => {
  it("still accepts a real cosmetic", () => {
    expect(looksCosmetic("Health & Beauty CeraVe Foaming Facial Cleanser")).toBe(true);
  });

  it("still rejects an unrelated piece of merchandise", () => {
    // The documented real miss this gate exists to catch.
    expect(looksCosmetic("Snacks ORGANIC BLUE CORN TORTILLA CHIPS")).toBe(false);
  });

  // Both found on PR #129: a generic barcode database mixes cosmetics with
  // every other kind of merchandise and often categorises medical/PPE items
  // under the same broad "Health & Beauty" category a real cosmetic uses, so
  // the positive check alone let them through on a coincidental "face"/
  // "beauty" match.
  it("rejects a disposable protective face mask despite the word 'face'", () => {
    expect(looksCosmetic("Health & Beauty Disposable 3-Ply Face Masks")).toBe(false);
  });

  it("rejects a medical orthoptic eye patch despite matching the eye-patch rule's own words", () => {
    expect(looksCosmetic("Health & Beauty Nexcare Opticlude Orthoptic Eye Patch")).toBe(false);
  });
});

describe("hasSkincareContext", () => {
  // The extra gate `lookupBarcodeDb` applies specifically to face-mask/
  // eye-patch/pimple-patch hits, on top of `looksCosmetic` — found on
  // PR #129 (second round): none of these carry a word `looksCosmetic`'s own
  // medical exclusion list names, so they pass that check on "beauty"/
  // "face"/"eye"+"patch" alone.
  it("rejects a reusable cloth face mask, a silk sleep eye mask and an amblyopia eye patch", () => {
    expect(hasSkincareContext("Health & Beauty Reusable Cloth Face Mask")).toBe(false);
    expect(hasSkincareContext("Health & Beauty Silk Sleep Eye Mask")).toBe(false);
    expect(hasSkincareContext("Health & Beauty Amblyopia Eye Patch")).toBe(false);
  });

  it("accepts a real skincare mask or patch carrying actual skincare vocabulary", () => {
    expect(hasSkincareContext("Health & Beauty Hydrogel Under Eye Patch")).toBe(true);
    expect(hasSkincareContext("Health & Beauty Hydrocolloid Acne Pimple Patch")).toBe(true);
    expect(hasSkincareContext("Health & Beauty Purifying Clay Face Mask")).toBe(true);
  });

  // Found on PR #129, third round: this UPC hit carries neither "cleans..."
  // nor any of the other wordlist entries, and used to be wrongly rejected
  // even though it previously resolved fine as "cleanser" before this PR's
  // mask precedence change.
  it("accepts a cleansing mask via the 'cleans' trigger, without re-admitting a plain protective mask", () => {
    expect(hasSkincareContext("Health & Beauty Deep Cleansing Face Mask")).toBe(true);
    expect(hasSkincareContext("Health & Beauty Reusable Cloth Face Mask")).toBe(false);
  });

  // Found on PR #129, fifth round: neither of these carried any word from
  // the wordlist before "mud"/"charcoal"/"purif"/"detox" were added.
  it("accepts a mud or charcoal detox mask via the new triggers", () => {
    expect(hasSkincareContext("Health & Beauty Purifying Mud Face Mask")).toBe(true);
    expect(hasSkincareContext("Health & Beauty Charcoal Face Mask")).toBe(true);
  });
});
