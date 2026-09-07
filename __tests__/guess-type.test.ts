import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guessType } from "../scripts/import-obf.mjs";

/**
 * guessType/looksCosmetic are hand-duplicated between this repo's Node import
 * script (scripts/import-obf.mjs, tested directly below) and the Deno edge
 * function (supabase/functions/product-lookup/index.ts). The commit that
 * expanded them to handle non-English labels named the duplication as a real
 * risk — "a product typed one way at import and another way on a live scan
 * is a real inconsistency, not a cosmetic one" — but shipped with no test on
 * either copy.
 *
 * The edge function can't be imported here: it pulls in a `jsr:` specifier
 * at module load, which only resolves under Deno. Its two functions are
 * instead extracted from the file's own source text: the regex patterns
 * (and, for guessType, their paired type strings) are pulled out with a
 * plain string match and rebuilt as real `RegExp` objects — no dynamic code
 * execution, just parsing the same literals the Deno runtime would parse.
 * This exercises the actual shipped patterns (not a hand-retyped copy of
 * them), so the parity test below catches real drift between the two files.
 */

const EDGE_FUNCTION_PATH = join(
  __dirname,
  "../supabase/functions/product-lookup/index.ts"
);

function extractFunctionSource(src: string, name: string): string {
  const startMatch = src.match(new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{`));
  if (!startMatch || startMatch.index === undefined) {
    throw new Error(`${name} not found in ${EDGE_FUNCTION_PATH} — has it been renamed?`);
  }
  const start = startMatch.index;
  const braceStart = start + startMatch[0].length - 1;
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(start, i + 1);
}

/**
 * Pulls every `[/pattern/flags, "type"]` table entry out of guessType's
 * source text. None of the real patterns contain a literal "/", so a plain
 * non-"/" body is enough — no escaping to worry about. Deliberately reads
 * the live file rather than trusting a hand-copied literal, so a change to
 * the real table is what this test actually exercises.
 */
function extractGuessTypeTable(fnSrc: string): { source: string; flags: string; type: string }[] {
  const pairRe = /\/([^/]+)\/([a-z]*)\s*,\s*"([a-z-]+)"/g;
  const pairs: { source: string; flags: string; type: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(fnSrc))) {
    pairs.push({ source: m[1], flags: m[2], type: m[3] });
  }
  if (pairs.length === 0) {
    throw new Error("extracted zero guessType table entries — extraction pattern is stale");
  }
  return pairs;
}

/** Extracts the single regex looksCosmetic tests against. */
function extractLooksCosmeticRegex(fnSrc: string): RegExp {
  const m = fnSrc.match(/\/([^/]+)\/([a-z]*)/);
  if (!m) throw new Error("looksCosmetic regex not found — extraction pattern is stale");
  return new RegExp(m[1], m[2]);
}

/** Same "first match wins" loop guessType itself runs, over extracted pairs. */
function runExtractedTable(
  pairs: { source: string; flags: string; type: string }[],
  tags: string[],
  text: string
): string {
  const haystack = `${tags.join(" ")} ${text}`.toLowerCase();
  for (const { source, flags, type } of pairs) {
    if (new RegExp(source, flags).test(haystack)) return type;
  }
  return "serum";
}

function loadEdgeFunctionCopy() {
  const src = readFileSync(EDGE_FUNCTION_PATH, "utf8");
  const table = extractGuessTypeTable(extractFunctionSource(src, "guessType"));
  const looksCosmeticRegex = extractLooksCosmeticRegex(extractFunctionSource(src, "looksCosmetic"));
  return {
    guessTypeEdge: (tags: string[], text: string) => runExtractedTable(table, tags, text),
    looksCosmeticEdge: (text: string) => looksCosmeticRegex.test(text),
  };
}

describe("guessType (scripts/import-obf.mjs)", () => {
  // Named directly in the commit that added them: real catalogue rows that
  // fell through to "serum" before the non-English patterns were added.
  it.each([
    ["CeraVe Schuimende Reinigingsgel", "cleanser"],
    ["nettoyant moussant visage", "cleanser"],
    ["Huile lavante Lipikar", "cleanser"],
    ["Lipikar Syndet AP+", "cleanser"],
  ])(
    "types %j as %s rather than the English-only fallback",
    (text: string, expected: string) => {
      expect(guessType([], text)).toBe(expected);
    }
  );

  it.each([
    ["crème mains réparatrice", "hand-cream"],
    ["gel douche hydratant", "body-wash"],
    ["duschgel erfrischend", "body-wash"],
    ["lait corporel nourrissant", "body-lotion"],
    ["lotion tonique", "toner"],
    ["crema solar SPF50", "sunscreen"],
    ["zonnebrand factor 30", "sunscreen"],
    ["sérum anti-âge", "serum"],
    ["gezichtscrème hydraterend", "moisturizer"],
  ])(
    "recognises the added non-English keyword in %j as %s",
    (text: string, expected: string) => {
      expect(guessType([], text)).toBe(expected);
    }
  );

  it("still falls back to serum when nothing in the table matches", () => {
    expect(guessType([], "a completely unlabelled jar")).toBe("serum");
  });
});

describe("looksCosmetic (supabase/functions/product-lookup, extracted)", () => {
  it("accepts genuinely cosmetic categories/titles", () => {
    const { looksCosmeticEdge } = loadEdgeFunctionCopy();
    expect(looksCosmeticEdge("Beauty & Personal Care, moisturizing face cream")).toBe(true);
    expect(looksCosmeticEdge("Health, shampoo and conditioner")).toBe(true);
  });

  it("rejects the regression case that prompted this filter", () => {
    // The exact junk row named in the fix commit: a food product the
    // barcode-DB fallback had previously written into the catalogue.
    const { looksCosmeticEdge } = loadEdgeFunctionCopy();
    expect(looksCosmeticEdge("Snacks, Organic Blue Corn Tortilla Chips")).toBe(false);
  });

  it("rejects an unrelated category with no cosmetic keyword", () => {
    const { looksCosmeticEdge } = loadEdgeFunctionCopy();
    expect(looksCosmeticEdge("Electronics, USB-C Cable")).toBe(false);
  });
});

describe("the two guessType copies", () => {
  it("classify the same inputs identically", () => {
    const { guessTypeEdge } = loadEdgeFunctionCopy();
    const inputs = [
      "CeraVe Schuimende Reinigingsgel",
      "nettoyant moussant visage",
      "Huile lavante Lipikar",
      "Lipikar Syndet AP+",
      "crème mains réparatrice",
      "gel douche hydratant",
      "duschgel erfrischend",
      "lait corporel nourrissant",
      "lotion tonique",
      "crema solar SPF50",
      "zonnebrand factor 30",
      "sérum anti-âge",
      "gezichtscrème hydraterend",
      "a completely unlabelled jar",
    ];
    for (const text of inputs) {
      expect(guessTypeEdge([], text)).toBe(guessType([], text));
    }
  });
});
