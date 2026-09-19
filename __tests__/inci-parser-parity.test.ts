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
  "isPlausibleIngredientName",
  "findListByDictionary",
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
  // Normalised once, up front, rather than patched per check below: this repo
  // checks out CRLF on Windows (core.autocrlf=true, no .gitattributes), so a
  // raw line here is e.g. "}\r", not "}". That silently broke two things at
  // once — not just the closing-brace scan (every case failed with "closing
  // brace ... not found"), but also the comment-strip regex a few lines down:
  // `.replace(/\/\/.*$/, "")` anchors `$` at the true end of the string, and
  // `.` never matches `\r`, so on a line like "code; // comment\r" the match
  // can't reach `$` and the whole comment survives as visible text. Since
  // comments are exactly what this test is supposed to look past, that
  // produced spurious diffs on every comment-only line even when the actual
  // logic was byte-identical.
  const lines = source.replace(/\r\n/g, "\n").split("\n");
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

  it.each(SHARED_FUNCTIONS)("%s is identical in both copies", (name: string) => {
    const clientBody = extractFunctionBody(client, name);
    const edgeBody = extractFunctionBody(edge, name);
    expect(edgeBody).toBe(clientBody);
  });
});

/**
 * The import scripts are the *third* set of copies, and they drifted exactly
 * as the block comment above predicted. `scripts/import-obf.mjs` carried a
 * bare `split(/[,;]/)` where `parseIngredientBlock` strips an "Ingredients:"
 * heading, truncates at legal boilerplate, and protects the comma inside
 * "1,2-Hexanediol". Measured against 549 live Open Beauty Facts rows, 42 of
 * them — 7.6% — were written with a first ingredient like
 * `"ingredients/ingrédients: aqua"`: a junk name inserted into the shared
 * dictionary, and the real most-concentrated ingredient swallowed with it.
 *
 * Two checks, because the scripts are `.mjs` and only partly comparable.
 * `normalise` is copied verbatim into all four and can be compared as a whole.
 * `parseInci` deliberately is *not* a copy of `parseIngredientBlock` — it has
 * no dictionary reconstruction, no aliases, no dedupe — so what is pinned
 * instead is the two regexes it lifted, which is where the drift actually was.
 */
const IMPORTER_PATHS = [
  "import-obf.mjs",
  "import-cosing.mjs",
  "import-inci-dictionary.mjs",
  "import-wikidata-synonyms.mjs",
  // Not an importer: the shared parser the DailyMed import reads through,
  // extracted so a fifth hand-copy was not made. Guarded here for exactly the
  // reason the others are — a copy nobody watches is a copy that drifts.
  "lib/inci-parse.mjs",
].map((name) => path.join(__dirname, "..", "scripts", name));

/**
 * Extract the one-line regex literal containing `marker`, through its `/i`.
 *
 * Found by substring rather than line prefix: prettier leaves the stop clause
 * alone on its own line but keeps the heading regex after `const heading = `,
 * and neither file should have to hold a particular line shape for this test
 * to work.
 */
function extractRegexLiteral(source: string, marker: string): string {
  const line = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.includes(marker));
  if (line === undefined) {
    throw new Error(`regex literal containing ${marker} not found`);
  }
  const start = line.indexOf(marker);
  const end = line.indexOf("/i", start + marker.length);
  if (end === -1) throw new Error(`no /i terminator on ${marker}`);
  return line.slice(start, end + 2);
}

/**
 * The scripts are plain .mjs, so the canonical body has to lose its type
 * annotations before the two can be compared. Named explicitly rather than
 * stripped by a general-purpose TypeScript regex: the list is short, and a
 * loose stripper that silently ate part of the logic would turn this test
 * into one that passes for the wrong reason.
 */
function stripTypes(body: string): string {
  return body
    .replace(/: ParsedIngredient\[\]/g, "")
    .replace(/\?: ReadonlyMap<string, string>/g, "")
    .replace(/: ReadonlySet<string>/g, "")
    .replace(/: string \| null/g, "")
    .replace(/: boolean/g, "")
    .replace(/<string>/g, "")
    .replace(/: string/g, "");
}

describe("the import scripts stay in step with lib/inci.ts", () => {
  const client = fs.readFileSync(CLIENT_PATH, "utf8");
  const clientNormalise = stripTypes(extractFunctionBody(client, "normalise"));
  const clientDedupe = stripTypes(extractFunctionBody(client, "dedupe"));

  it.each(IMPORTER_PATHS)("%s has the canonical normalise()", (scriptPath: string) => {
    const script = fs.readFileSync(scriptPath, "utf8");
    expect(extractFunctionBody(script, "normalise")).toBe(clientNormalise);
  });

  // Only import-obf writes product formulas, so it is the only script that
  // needs this one — and it is the script that shipped without it, storing a
  // repeated name as a second `product_ingredients` row that the scorer then
  // weighted twice.
  it("import-obf.mjs has the canonical dedupe()", () => {
    const obf = fs.readFileSync(path.join(__dirname, "..", "scripts", "import-obf.mjs"), "utf8");
    expect(extractFunctionBody(obf, "dedupe")).toBe(clientDedupe);
  });

  // The two functions that find the list without a heading pattern and reject
  // a fragment that cannot be a name. Both importers that write ingredient
  // stubs carry them, and a copy that drifts writes junk that the others refuse.
  it.each([
    ["import-obf.mjs", "isPlausibleIngredientName"],
    ["import-obf.mjs", "findListByDictionary"],
    ["lib/inci-parse.mjs", "isPlausibleIngredientName"],
    ["lib/inci-parse.mjs", "findListByDictionary"],
  ])("%s has the canonical %s()", (file: string, fn: string) => {
    const script = fs.readFileSync(path.join(__dirname, "..", "scripts", file), "utf8");
    expect(extractFunctionBody(script, fn)).toBe(stripTypes(extractFunctionBody(client, fn)));
  });

  it.each([
    ["the Ingredients: heading strip", "/(?:ingr[eé]dient"],
    ["the boilerplate stop clause", "/(?:\\bdirections?\\b"],
  ])("import-obf.mjs reuses %s verbatim", (_label: string, marker: string) => {
    const obf = fs.readFileSync(path.join(__dirname, "..", "scripts", "import-obf.mjs"), "utf8");
    expect(extractRegexLiteral(obf, marker)).toBe(extractRegexLiteral(client, marker));
  });
});

/**
 * `product-lookup` holds a third copy of the parser, and this file's own
 * header names it as a past drift victim — yet nothing here covered it, which
 * is how it went on storing "glycerin. made in nigeria" as an ingredient long
 * after the other two parsers learned to truncate. A junk name like that
 * reaches the shared `ingredients` dictionary as a stub row, and matches no
 * exact-name lookup — including the UV-filter and acid lists the type
 * fallback reads.
 */
describe("product-lookup's parser stays in step with lib/inci.ts", () => {
  const client = fs.readFileSync(CLIENT_PATH, "utf8");
  const lookup = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "functions", "product-lookup", "index.ts"),
    "utf8",
  );

  it("reuses the boilerplate stop clause verbatim", () => {
    const marker = "/(?:\\bdirections?\\b";
    expect(extractRegexLiteral(lookup, marker)).toBe(extractRegexLiteral(client, marker));
  });

  it("has the canonical isPlausibleIngredientName()", () => {
    expect(extractFunctionBody(lookup, "isPlausibleIngredientName")).toBe(
      extractFunctionBody(client, "isPlausibleIngredientName")
    );
  });
});
