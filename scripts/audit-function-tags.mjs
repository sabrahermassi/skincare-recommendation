/**
 * Check that the CosIng function tags in `ingredients.functions` are the ones
 * the scoring reads, and that they hold for well-known ingredients.
 *
 * `lib/rules.ts` scores 11 declared functions (humectant, emollient,
 * soothing, ...). A tag it never sees, because the column spells it another
 * way or no row carries it, is a scoring signal that silently never fires.
 * Read only, this reports:
 *
 *   - how many verified rows carry each scored tag, and any scored tag no row
 *     carries;
 *   - stored tags one or two letters away from a scored tag ("moisturizing",
 *     "humectants") that the scoring therefore ignores;
 *   - verified rows with no functions at all, per source;
 *   - well-known ingredients missing the tag CosIng gives them (`ANCHORS`);
 *   - how many rows store a tag in a spelling other than the normalised one
 *     (harmless for scoring, which normalises on read, so a count only).
 *
 * Reads need `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the shell.
 *
 *   npm run audit:function-tags
 *   npm run audit:function-tags -- --limit=200   # list more per problem
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { connect } from "./lib/db.mjs";
import { levenshtein } from "./lib/inci-parse.mjs";
import { normaliseFunction } from "./lib/normalise-function.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const DEFAULT_LIMIT = 25;

/**
 * The functions `FUNCTION_SIGNALS` in lib/rules.ts scores, normalised. A test
 * fails if this list and that table drift apart.
 */
export const SCORED_FUNCTIONS = [
  "humectant",
  "moisturising",
  "emollient",
  "skin-protecting",
  "refatting",
  "film-forming",
  "soothing",
  "uv-filter",
  "smoothing",
  "absorbent",
  "tonic",
];

/**
 * Well-known ingredients and a scored tag the pinned CosIng file (2016) gives
 * each. It checks the import kept what CosIng says; it does not judge whether
 * CosIng is right.
 */
export const ANCHORS = [
  ["glycerin", "humectant"],
  ["sodium hyaluronate", "humectant"],
  ["urea", "humectant"],
  ["butylene glycol", "humectant"],
  // No `antioxidant` anchors since #175: scoring no longer reads that tag
  // (it describes preserving the product, not the skin), so whether the
  // import kept it no longer matters to a score.
  ["allantoin", "soothing"],
  ["bisabolol", "soothing"],
  ["squalane", "emollient"],
  ["dimethicone", "emollient"],
  ["petrolatum", "emollient"],
  ["zinc oxide", "skin-protecting"],
  ["titanium dioxide", "uv-filter"],
  ["niacinamide", "smoothing"],
];

/**
 * @typedef {{ inci_name: string, functions: string[] | null, source: string }} Row
 * @typedef {{ tag: string, near: string, rows: number }} NearMiss
 * @typedef {{ inci_name: string, expected: string, found: "absent" | "missing", stored: string[] }} AnchorProblem
 */

/**
 * @param {Row[]} rows verified rows only
 */
export function checkFunctionTags(rows) {
  const scored = new Set(SCORED_FUNCTIONS);
  /** @type {Map<string, number>} */
  const tagRows = new Map();
  /** @type {Record<string, number>} */
  const noFunctions = {};
  let unnormalised = 0;
  const byName = new Map();

  for (const row of rows) {
    const raw = row.functions ?? [];
    if (raw.length === 0) noFunctions[row.source] = (noFunctions[row.source] ?? 0) + 1;
    const tags = new Set();
    for (const tag of raw) {
      const normal = normaliseFunction(tag);
      if (normal !== tag) unnormalised++;
      tags.add(normal);
    }
    for (const tag of tags) tagRows.set(tag, (tagRows.get(tag) ?? 0) + 1);
    byName.set(row.inci_name, tags);
  }

  const scoredCounts = Object.fromEntries(SCORED_FUNCTIONS.map((tag) => [tag, tagRows.get(tag) ?? 0]));
  const neverFire = SCORED_FUNCTIONS.filter((tag) => scoredCounts[tag] === 0);

  /** @type {NearMiss[]} */
  const nearMisses = [];
  for (const [tag, count] of tagRows) {
    if (scored.has(tag)) continue;
    for (const target of SCORED_FUNCTIONS) {
      // Short tags ("tonic") are one letter from too many real words at distance 2.
      const budget = target.length >= 8 ? 2 : 1;
      if (levenshtein(tag, target, budget) <= budget) {
        nearMisses.push({ tag, near: target, rows: count });
        break;
      }
    }
  }
  nearMisses.sort((a, b) => b.rows - a.rows || a.tag.localeCompare(b.tag));

  /** @type {AnchorProblem[]} */
  const anchorProblems = [];
  for (const [inci_name, expected] of ANCHORS) {
    const tags = byName.get(inci_name);
    if (!tags) anchorProblems.push({ inci_name, expected, found: "absent", stored: [] });
    else if (!tags.has(expected)) anchorProblems.push({ inci_name, expected, found: "missing", stored: [...tags].sort() });
  }

  return { total: rows.length, scoredCounts, neverFire, nearMisses, noFunctions, unnormalised, anchorProblems };
}

function listSome(title, items, limit, line) {
  console.log(`\n${title}`);
  for (const item of items.slice(0, limit)) console.log(`  ${line(item)}`);
  if (items.length > limit) console.log(`  … ${items.length - limit} more; pass --limit=${items.length} to list them all.`);
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a whole number, 1 or more.");

  const { db } = connect({ write: false });
  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name,functions,source",
    cursorColumn: "inci_name",
    filter: (query) => query.eq("verified", true),
  });

  const result = checkFunctionTags(rows);
  console.log(`Read ${result.total} verified ingredient names.`);

  console.log("\nVerified rows carrying each scored function:");
  for (const tag of SCORED_FUNCTIONS) console.log(`  ${tag.padEnd(16)} ${result.scoredCounts[tag]}`);

  const emptyTotal = Object.values(result.noFunctions).reduce((sum, n) => sum + n, 0);
  const emptyBySource = Object.entries(result.noFunctions)
    .sort((a, b) => b[1] - a[1])
    .map(([source, n]) => `${n} ${source}`)
    .join(", ");
  console.log(`\n${emptyTotal} verified rows have no functions${emptyBySource ? ` (${emptyBySource})` : ""}.`);
  console.log(`${result.unnormalised} stored tags are not in the normalised spelling (scoring normalises on read).`);
  console.log(`${result.neverFire.length} scored function(s) no row carries.`);
  console.log(`${result.nearMisses.length} stored tag(s) look like a misspelt scored function.`);
  console.log(`${result.anchorProblems.length} well-known ingredient(s) lack the tag CosIng gives them.`);

  if (result.neverFire.length > 0) console.log(`\nScored but carried by no row: ${result.neverFire.join(", ")}`);
  listSome("Stored tag that looks like a scored one:", result.nearMisses, limit, (n) => `${n.tag} (${n.rows} rows) is close to ${n.near}`);
  listSome("Well-known ingredient without its tag:", result.anchorProblems, limit, (a) =>
    a.found === "absent"
      ? `${a.inci_name}: no verified row (expected ${a.expected})`
      : `${a.inci_name}: expected ${a.expected}, stored ${a.stored.join(", ") || "none"}`
  );
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
