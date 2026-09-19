import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LOOKS_COSMETIC_SOURCE } from "../scripts/audit-catalogue-quality.mjs";

/**
 * `looksCosmetic` lives in two hand-synced copies for the same reason
 * `guessType` does (see `classifier-parity.test.ts`): Node and Deno can't
 * share a module. Nothing was checking the two stayed in step, which is
 * exactly the failure mode that test exists to catch for `guessType` — a
 * keyword added to one copy and not the other would silently change which
 * `barcode_db` rows the audit script flags versus which ones the live gate
 * in `product-lookup` accepts, with no error anywhere.
 *
 * `product-lookup/index.ts` imports `jsr:` specifiers Jest can't resolve, so
 * — same technique as `classifier-parity.test.ts` — its copy is read as
 * source text rather than imported.
 */
function edgeFunctionLooksCosmeticSource(): string {
  const source = readFileSync(
    join(__dirname, "..", "supabase", "functions", "product-lookup", "index.ts"),
    "utf8"
  );
  const marker = "function looksCosmetic(text: string): boolean {";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error("looksCosmetic not found in product-lookup/index.ts");

  const regexMatch = source.slice(start).match(/\/((?:\\.|[^/\n])+)\/i/);
  if (!regexMatch) throw new Error("looksCosmetic's regex literal not found");
  return regexMatch[1];
}

describe("looksCosmetic stays in step across both runtimes", () => {
  it("has the same pattern in the audit script and the Edge Function", () => {
    const edgeSource = edgeFunctionLooksCosmeticSource();
    // Without this the test would pass silently if either extraction method
    // ever stopped finding the pattern at all.
    expect(edgeSource.length).toBeGreaterThan(20);
    expect(LOOKS_COSMETIC_SOURCE).toEqual(edgeSource);
  });
});
