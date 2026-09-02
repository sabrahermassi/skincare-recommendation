import fs from "node:fs";
import path from "node:path";

/**
 * `lib/inci.ts` runs on the client and is what `__tests__/inci.test.ts`
 * exercises. `supabase/functions/label-ocr/index.ts` runs on Deno and is what
 * actually parses a scanned label — Metro cannot bundle a Deno import, so the
 * parsing logic is a second copy rather than a shared module. That has
 * already caused two real bugs on this branch: the heading-strip fix landed
 * in one file before the other ("the two parsers simply disagreed"), and
 * `dedupe()` was added to this file without reaching `product-lookup`'s
 * separate `parseInci`.
 *
 * This test is the guard against a third instance: it extracts each shared
 * function's body from both files and asserts they are identical once
 * comments and whitespace are stripped. It does not replace extracting a
 * shared module — see the comment on `SHARED_FUNCTIONS` below — but it is
 * fifteen lines against a real, repeated failure mode, so it earns its place
 * either way.
 */

const CLIENT_PATH = path.join(__dirname, "..", "lib", "inci.ts");
const EDGE_PATH = path.join(__dirname, "..", "supabase", "functions", "label-ocr", "index.ts");

/**
 * Every function `lib/inci.ts` and the Deno copy must agree on byte-for-byte
 * (modulo comments, whitespace and the `export` keyword). Deliberately not
 * "every function in the file" — `runOcr`, the Supabase read/write helpers
 * and the rate limiter are Deno-only and have no client counterpart.
 */
const SHARED_FUNCTIONS = [
  "normalise",
  "splitOnSeparators",
  "levenshtein",
  "fuzzyBudget",
  "fuzzyLookup",
  "matchWindow",
  "reconstructFromDictionary",
  "parseIngredientBlock",
  "dedupe",
];

/**
 * Pulls one function's body out of a source file, from its declaration line
 * to the next line that is exactly a closing brace at column 0 — the house
 * style throughout both files, verified against every function this test
 * covers. Then strips `export `, line comments, and blank/whitespace-only
 * lines, so what remains is the logic itself.
 */
function extractFunctionBody(source: string, name: string): string {
  const lines = source.split("\n");
  const startPattern = new RegExp(`^(?:export )?function ${name}\\(`);
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start === -1) {
    throw new Error(`function ${name} not found`);
  }
  const end = lines.findIndex((line, i) => i > start && line === "}");
  if (end === -1) {
    throw new Error(`closing brace for ${name} not found`);
  }

  return lines
    .slice(start, end + 1)
    .map((line) => line.replace(/^export /, "").replace(/\/\/.*$/, "").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

describe("label-ocr's parser stays in step with lib/inci.ts", () => {
  const client = fs.readFileSync(CLIENT_PATH, "utf8");
  const edge = fs.readFileSync(EDGE_PATH, "utf8");

  it.each(SHARED_FUNCTIONS)("%s is identical in both copies", (name) => {
    const clientBody = extractFunctionBody(client, name);
    const edgeBody = extractFunctionBody(edge, name);
    expect(edgeBody).toBe(clientBody);
  });
});
