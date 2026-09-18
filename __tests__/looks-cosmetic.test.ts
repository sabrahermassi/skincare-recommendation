import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `looksCosmetic` gates the UPC barcode-database fallback in
 * `supabase/functions/product-lookup/index.ts` — the last-resort source for
 * an unrecognised barcode, with no ingredient list and no dedicated skincare
 * category, so it is the only thing standing between a genuine miss and
 * writing an arbitrary piece of merchandise into the catalogue as if it were
 * skincare (the ORGANIC BLUE CORN TORTILLA CHIPS row that function's own
 * comment already documents).
 *
 * The Deno file imports `jsr:` specifiers Jest can't resolve, so the two
 * regexes inside `looksCosmetic` are read as source text and reconstructed
 * here — same technique `classifier-parity.test.ts` already uses for
 * `guessType`.
 */

const SOURCE_PATH = join(__dirname, "..", "supabase/functions/product-lookup/index.ts");

function extractLooksCosmeticRegexes(): [medicalExclusion: RegExp, cosmeticSignal: RegExp] {
  const source = readFileSync(SOURCE_PATH, "utf8");
  const start = source.indexOf("function looksCosmetic(text: string): boolean {");
  if (start === -1) throw new Error("looksCosmetic not found in product-lookup/index.ts");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);

  const literals = [...body.matchAll(/\/(?:\\.|[^/\n])*\/[a-z]*/g)].map((m) => m[0]);
  if (literals.length !== 2) {
    throw new Error(`expected 2 regex literals in looksCosmetic, found ${literals.length}`);
  }
  return literals.map((literal) => {
    const lastSlash = literal.lastIndexOf("/");
    return new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));
  }) as [RegExp, RegExp];
}

function looksCosmetic(text: string): boolean {
  const [medicalExclusion, cosmeticSignal] = extractLooksCosmeticRegexes();
  if (medicalExclusion.test(text)) return false;
  return cosmeticSignal.test(text);
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
