import { readFileSync } from "node:fs";
import { join } from "node:path";

import { guessTypeFromIngredients as nodeFallback } from "../scripts/lib/guess-type-from-ingredients.mjs";
import { guessTypeFromIngredients as denoFallback } from "../supabase/functions/_shared/guess-type-from-ingredients";

/**
 * The classifier lives in four hand-synced copies: `guessType` in
 * `scripts/import-obf.mjs` and `supabase/functions/product-lookup/index.ts`,
 * and the ingredient fallback in `scripts/lib/guess-type-from-ingredients.mjs`
 * and `supabase/functions/_shared/guess-type-from-ingredients.ts`. Node and
 * Deno can't share a module, so the duplication is structural — but nothing
 * was checking that the copies still agree, and a product typed one way at
 * import and another way on a live scan is a real inconsistency:
 * `contactWeight` reads the result.
 *
 * The two fallback copies are both importable here, so they're compared by
 * behaviour. The two `guessType` copies are not — the Edge Function's module
 * imports `jsr:` specifiers Jest can't resolve — so those are compared by
 * their pattern tables as source text, which is the thing that actually drifts.
 */

const ROOT = join(__dirname, "..");

/**
 * One "regex=>type" string per table entry, in order.
 *
 * A regex and its result type sit on the same line for a short pattern
 * (`[/hand.?cream.../, "hand-cream"],`) but on separate lines once the regex
 * is too long to fit (the cleanser entry). Comparing regex lines alone — what
 * this used to do — silently drops the type half of any multi-line entry from
 * the comparison, so a copy that mapped that regex to a *different* type
 * would still pass. Pairing each regex with the next type line, however far
 * apart, catches both halves regardless of layout.
 */
function patternTable(path: string): string[] {
  const source = readFileSync(join(ROOT, path), "utf8");
  const start = source.indexOf("[/hand.?cream");
  const end = source.indexOf("];", start);
  if (start === -1 || end === -1) throw new Error(`no classifier table found in ${path}`);

  const lines = source
    .slice(start, end)
    .split("\n")
    .map((line) => line.trim())
    // Comments explain the same rule differently in each copy and are not
    // what drifts.
    .filter((line) => line.length > 0 && !line.startsWith("//"));

  const entries: string[] = [];
  let pendingRegex: string | null = null;
  for (const line of lines) {
    const regexMatch = line.match(/\/(?:\\.|[^/])*\/[a-z]*/);
    const typeMatch = line.match(/"[a-z-]+"/);
    if (regexMatch && !pendingRegex) pendingRegex = regexMatch[0];
    if (typeMatch && pendingRegex) {
      entries.push(`${pendingRegex}=>${typeMatch[0]}`);
      pendingRegex = null;
    }
  }
  return entries;
}

describe("guessType stays in step across both runtimes", () => {
  it("has the same patterns, in the same order, in the importer and the Edge Function", () => {
    const importer = patternTable("scripts/import-obf.mjs");
    // Without this the test would pass silently if the extractor ever stopped
    // finding the table at all.
    expect(importer.length).toBeGreaterThan(20);
    expect(patternTable("supabase/functions/product-lookup/index.ts")).toEqual(importer);

    // The cleanser entry's regex is long enough to sit on its own line, with
    // the result type below it rather than beside it. Pinning that the type
    // still made it into the comparison is what catches a copy that changed
    // the type without changing the regex — the exact gap the old line-only
    // extraction had.
    expect(importer.some((entry) => entry.endsWith('=>"cleanser"'))).toBe(true);
  });
});

describe("the ingredient fallback stays in step across both runtimes", () => {
  const ingredient = (inci_name: string, position: number) => ({ inci_name, position });

  type Case = { name: string; ingredients: { inci_name: string; position: number }[] };

  const cases: Case[] = [
    { name: "Daily Fluid", ingredients: [ingredient("aqua", 0), ingredient("avobenzone", 1)] },
    { name: "Lactic Acid 10%", ingredients: [ingredient("aqua", 0), ingredient("lactic acid", 1)] },
    { name: "Purifying Clay Mask", ingredients: [ingredient("aqua", 0), ingredient("salicylic acid", 1)] },
    { name: "Maskara Siyah", ingredients: [ingredient("aqua", 0), ingredient("lactic acid", 1)] },
    { name: "Tinted Lip Balm", ingredients: [ingredient("titanium dioxide", 0)] },
    { name: "Nothing Special", ingredients: [ingredient("aqua", 0), ingredient("glycerin", 1)] },
    {
      name: "Long Formula",
      ingredients: [...Array.from({ length: 24 }, (_, i) => ingredient(`filler-${i}`, i)), ingredient("lactic acid", 24)],
    },
  ];

  it.each(cases)("agrees on $name", ({ name, ingredients }: Case) => {
    expect(denoFallback(name, ingredients)).toBe(nodeFallback(name, ingredients));
  });
});
