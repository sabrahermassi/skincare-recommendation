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
  "squashKey",
  "squashIndex",
  "lengthIndex",
  "commonNameFor",
  "resolveKnownName",
  "splitSlashList",
  "splitRunTogether",
  "fuzzyKnownName",
  "salvageKnownNames",
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

/**
 * The common-name table sits at module level rather than inside
 * `commonNameFor` (so it is built once, not on every call), which takes it out
 * of the function body compared above. It is compared here instead: from its
 * declaration to the closing `]);`.
 */
function extractTable(source: string, opener: string, closer: string): string {
  const text = source.replace(/\r\n/g, "\n");
  const start = text.indexOf(opener);
  if (start === -1) throw new Error(`${opener} not found`);
  const end = text.indexOf(closer, start);
  if (end === -1) throw new Error(`${opener} is not closed`);
  return text.slice(start, end + closer.length);
}

const extractCommonNames = (source: string) => extractTable(source, "const COMMON_NAMES = new Map([", "\n]);");
const extractSynonymGroups = (source: string) => extractTable(source, "const SYNONYM_GROUPS = [", "\n];");

describe("label-ocr's parser stays in step with lib/inci.ts", () => {
  const client = fs.readFileSync(CLIENT_PATH, "utf8");
  const edge = fs.readFileSync(EDGE_PATH, "utf8");

  it("COMMON_NAMES is identical in the client, label-ocr and the import scripts", () => {
    const table = extractCommonNames(client);
    expect(extractCommonNames(edge)).toBe(table);
    expect(extractCommonNames(fs.readFileSync(path.join(__dirname, "..", "scripts", "lib", "inci-parse.mjs"), "utf8"))).toBe(table);
  });

  it("SYNONYM_GROUPS is identical in the client, label-ocr and the import scripts", () => {
    const groups = extractSynonymGroups(client);
    expect(extractSynonymGroups(edge)).toBe(groups);
    expect(extractSynonymGroups(fs.readFileSync(path.join(__dirname, "..", "scripts", "lib", "inci-parse.mjs"), "utf8"))).toBe(groups);
  });

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
 * (`import-inci-dictionary.mjs` names its rows with a bracket-keeping rule of
 * its own, and uses this copy only to work out what a label will ask for —
 * which is exactly why it has to stay the label parser's text.)
 * `parseInci` deliberately is *not* a copy of `parseIngredientBlock` — it has
 * no dictionary reconstruction, no aliases, no dedupe — so what is pinned
 * instead is the two regexes it lifted, which is where the drift actually was.
 */
const IMPORTER_PATHS = [
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
    .replace(/: Map<number, string\[\]>/g, "")
    .replace(/: Map<string, string\[\]>/g, "")
    .replace(/: \{ remaining: number \}/g, "")
    .replace(/: string \| undefined/g, "")
    .replace(/: string \| null/g, "")
    .replace(/: boolean/g, "")
    .replace(/: number/g, "")
    .replace(/: string\[\]/g, "")
    .replace(/<string>/g, "")
    .replace(/: string/g, "");
}

describe("the import scripts stay in step with lib/inci.ts", () => {
  const client = fs.readFileSync(CLIENT_PATH, "utf8");
  const clientNormalise = stripTypes(extractFunctionBody(client, "normalise"));
  const parseMjs = fs.readFileSync(path.join(__dirname, "..", "scripts", "lib", "inci-parse.mjs"), "utf8");

  it.each(IMPORTER_PATHS)("%s has the canonical normalise()", (scriptPath: string) => {
    const script = fs.readFileSync(scriptPath, "utf8");
    expect(extractFunctionBody(script, "normalise")).toBe(clientNormalise);
  });

  // `scripts/lib/inci-parse.mjs` is the one plain-JavaScript copy of the parser.
  // Every function in it but `parseInci` is `lib/inci.ts`'s own text with the
  // types removed, so a change made to one and not the other fails here — and
  // this list is the whole surface an importer parses through: separators, the
  // name check, finding the list without a heading pattern, and every step that
  // turns a printed name into a dictionary name.
  it.each([
    "splitOnSeparators",
    "levenshtein",
    "fuzzyBudget",
    "fuzzyLookup",
    "isPlausibleIngredientName",
    "findListByDictionary",
    "squashKey",
    "squashIndex",
    "lengthIndex",
    "commonNameFor",
    "resolveKnownName",
    "splitSlashList",
    "splitRunTogether",
    "fuzzyKnownName",
    "salvageKnownNames",
    "dedupe",
  ])("inci-parse.mjs has the canonical %s()", (fn: string) => {
    expect(extractFunctionBody(parseMjs, fn)).toBe(stripTypes(extractFunctionBody(client, fn)));
  });

  it.each([
    ["the Ingredients: heading strip", "/(?:ingr[eé]dient"],
    ["the boilerplate stop clause", "/(?:\\bdirections?\\b"],
  ])("inci-parse.mjs reuses %s verbatim", (_label: string, marker: string) => {
    expect(extractRegexLiteral(parseMjs, marker)).toBe(extractRegexLiteral(client, marker));
  });

  // `import-obf.mjs` carried its own hand-copy and drifted, writing label
  // headings into the dictionary. It imports the shared parser now; this fails
  // if a local copy grows back.
  it("import-obf.mjs imports the shared parser and holds no copy of it", () => {
    const obf = fs.readFileSync(path.join(__dirname, "..", "scripts", "import-obf.mjs"), "utf8");
    expect(obf).toMatch(/import \{[^}]*\bparseInci\b[^}]*\} from "\.\/lib\/inci-parse\.mjs"/);
    expect(obf).not.toMatch(/^function (?:parseInci|normalise|dedupe)\(/m);
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

  // This copy's normalise() was never widened when #185 added CJK support,
  // then never caught up to #247's width-folding/prolongation-mark fix
  // either -- nothing here compared it to the client's, so it kept stripping
  // every Korean and Japanese ingredient name silently.
  it("has the canonical normalise()", () => {
    expect(extractFunctionBody(lookup, "normalise")).toBe(extractFunctionBody(client, "normalise"));
  });

  it("recognises the Korean and Japanese ingredients headings, like the other copies", () => {
    expect(lookup).toContain("전성분");
    expect(lookup).toContain("全成分");
  });

  it("splits on the ideographic comma, like the other copies", () => {
    expect(lookup).toContain("[;、]");
  });

  // "Tocopheryl Acetate (Vit. E)" must not split at the full stop inside the
  // brackets — lib/inci.ts and label-ocr guard it, and this copy did not.
  it("guards full stops inside brackets before splitting, like the other copies", () => {
    expect(client).toContain("group.replace(/\\./g,");
    expect(lookup).toContain("const bracketGuarded = block.replace(/\\([^)]*\\)/g, (group) => group.replace(/\\./g,");
  });

  // No dictionary here, so a long real name cannot be recognised as known and
  // the eight-word cap must not drop it.
  it("protects abbreviation full stops the same way as the other copies", () => {
    const rule = "(?:vit|spp|sp|var|ssp|subsp)";
    expect(client).toContain(rule);
    expect(lookup).toContain(rule);
  });

  it("skips only the word limit, so every other check reads the whole name", () => {
    expect(lookup).toContain("isPlausibleIngredientName(part, true)");
    expect(lookup).not.toContain(".slice(0, 8)");
  });
});
