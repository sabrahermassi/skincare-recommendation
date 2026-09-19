/**
 * Issue #86: two distinct data-quality problems in the live catalogue.
 *
 * 1. Non-cosmetic products. The `barcode_db` fallback (UPCitemdb) indexes
 *    every barcode there is, not just cosmetics, and returns no ingredients —
 *    an unfiltered hit wrote rows like ORGANIC BLUE CORN TORTILLA CHIPS,
 *    brand "N/A". `looksCosmetic` in
 *    `supabase/functions/_shared/product-type-classifier.mjs`
 *    (migration-adjacent commit b6b32e8, 6 September) already stops *new*
 *    rows like this — "All of them stop new bad rows; none of them touch
 *    existing ones," in its own words. This script finds the existing ones,
 *    by re-running that same gate against every `barcode_db` row already on
 *    file. It imports the real function rather than a hand-copy: that shared
 *    module (added the same day as this script, in a separate change) is
 *    plain runtime-neutral ESM specifically so Node and Deno callers run the
 *    exact same decision instead of comparing regex copies after the fact.
 *
 * 2. Garbage ingredient names. Real products showing malformed entries —
 *    a batch/lot code glued onto a real name ("phenoxyethanol. pr-015376"),
 *    or unrelated sentence text that leaked in during OCR/parsing
 *    ("pr #78). 1 say and i'll move to step 2 (boarding"). A blind
 *    short-name filter would also catch genuine short INCI names (PCA, EGF),
 *    so this reports candidates for manual review rather than guessing.
 *
 * Run (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, for both the report
 * and the delete — `products` and `ingredients` are publicly readable, but
 * `import-obf.mjs` and `import-dailymed.mjs` set the precedent of requiring
 * the service key even for a read-only dry run rather than quietly reading
 * through the anon key, and deleting confirmed-junk products needs it
 * regardless):
 *
 *   node scripts/audit-catalogue-quality.mjs                     # report only
 *   node scripts/audit-catalogue-quality.mjs --delete-junk-products
 *
 * `--delete-junk-products` is the one automatic action this script takes,
 * and only because it reuses the exact gate already trusted in production —
 * a `barcode_db` row that fails the shared `looksCosmetic` gate today would
 * never have been written today. Ingredient garbage is report-only, on
 * purpose: issue #86's own plan rules out automatic deletion there, since
 * some short survivors (PCA, EGF) are genuine. Each flagged ingredient
 * prints two ready `DELETE` statements — the `product_ingredients` join row,
 * then the `ingredients` row itself, in that order, since the join's foreign
 * key has no cascade — to run by hand once reviewed. Deliberately not
 * executed here.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { looksCosmetic } from "../supabase/functions/_shared/product-type-classifier.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const APPLY = process.argv.includes("--delete-junk-products");

/**
 * Text that would never appear in a real INCI name but does appear in
 * boilerplate, lot/batch codes and OCR-leaked sentences. Deliberately a
 * denylist here, unlike `looksCosmetic` above — a real formula is a
 * comma-separated list of chemical names, so the failure mode of a false
 * positive (a genuine ingredient using one of these words) is far rarer
 * than for a whole product title, and every one of these has already been
 * seen in a real garbage row (see the issue).
 */
const PROSE_MARKERS =
  /\b(i'll|you'll|we'll|he's|she's|let's|say|move|step|customer|care|number|reg\.?|boarding|distribut(?:ed|ion)|manufactured|warning|caution|directions?|net\s?wt|best\s?before|exp(?:iry)?\s?date|batch|lot)\b/i;

/** A lot/PR/batch code glued onto the back of an otherwise real name. */
const GLUED_CODE = /\.\s*[a-z]{0,4}-?\d{3,}\b|\bpr[\s#-]?\d+\b/i;

/**
 * Real short INCI names seen in this catalogue's own dictionary — not
 * exhaustive, just enough that the "needs review" bucket doesn't relist the
 * same known-genuine entries every run. Anything else at or under this
 * length is flagged for a human to judge, never auto-deleted.
 */
const KNOWN_SHORT_NAMES = new Set(["pca", "egf", "dmae", "msm", "uv", "aha", "bha", "dna", "rna"]);
const SHORT_NAME_MAX_LENGTH = 3;

/**
 * Which bucket (if any) an unverified ingredient name falls into. Pure and
 * exported so `__tests__/audit-catalogue-quality-gates.test.ts` can pin it
 * against real examples from the issue without a live database — the same
 * shape `import-obf.mjs`'s `toRow`/`parseInci` are tested in.
 *
 * Checked in this order deliberately: a glued code takes priority over the
 * prose check (a name can incidentally contain a prose word after its code),
 * and both take priority over the short-name check so a genuinely short
 * fragment is never double-counted into more than one bucket.
 */
function classifyGarbageIngredient(name) {
  if (GLUED_CODE.test(name)) return "glued";
  if (PROSE_MARKERS.test(name)) return "prose";
  // KNOWN_SHORT_NAMES is lowercase; comparing the raw name would flag a
  // genuine "PCA" or "EGF" as garbage the moment it wasn't stored lowercase.
  if (name.length <= SHORT_NAME_MAX_LENGTH && !KNOWN_SHORT_NAMES.has(name.toLowerCase())) return "short";
  return null;
}

/**
 * A SQL single-quoted string literal, safe to paste into the Supabase SQL
 * editor. `JSON.stringify` was used here originally and produces a
 * double-quoted string — which Postgres parses as a quoted *identifier*, not
 * a string literal, so every printed `DELETE` failed with "column ... does
 * not exist" instead of deleting anything. Doubling an embedded single quote
 * is the standard SQL escape for a literal.
 */
function sqlStringLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The two statements needed to actually remove a garbage `ingredients` row,
 * in the order they must run. `product_ingredients.inci_name` references
 * `ingredients.inci_name` with no `on delete cascade` (migration 0001) —
 * these flagged names are exactly the stub rows created so a product's
 * ingredient list has something to point to, so most of them are still
 * referenced. Deleting `ingredients` alone fails with a foreign-key
 * violation (safe, but useless) rather than doing what it looks like it does.
 */
function deleteStatementsFor(inciName) {
  const literal = sqlStringLiteral(inciName);
  return [
    `delete from product_ingredients where inci_name = ${literal};`,
    `delete from ingredients where inci_name = ${literal};`,
  ];
}

async function auditJunkProducts(db) {
  const rows = await paginateOrdered(db, "products", {
    select: "id, name, brand, type, attribution",
    cursorColumn: "id",
    filter: (q) => q.eq("source", "barcode_db"),
  });

  const junk = rows.filter((r) => !looksCosmetic(`${r.name} ${r.brand}`));

  console.log(`\n== Non-cosmetic products (source = barcode_db) ==`);
  console.log(`${rows.length} barcode_db rows total, ${junk.length} fail looksCosmetic:\n`);
  for (const r of junk) {
    console.log(`  ${r.id}  "${r.name}"  brand=${r.brand}  type=${r.type}`);
    console.log(`    ${r.attribution}`);
  }
  if (junk.length === 0) console.log("  none");
  return junk;
}

async function auditGarbageIngredients(db) {
  // Unverified only: verified names come from CosIng/MFDS, authoritative
  // dictionaries this catalogue trusts outright. Garbage enters through
  // parsed-off-a-label text, which is exactly what `verified: false` marks.
  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name, source, note",
    cursorColumn: "inci_name",
    filter: (q) => q.eq("verified", false),
  });

  const glued = [];
  const prose = [];
  const short = [];
  for (const r of rows) {
    const bucket = classifyGarbageIngredient(r.inci_name);
    if (bucket === "glued") glued.push(r);
    else if (bucket === "prose") prose.push(r);
    else if (bucket === "short") short.push(r);
  }

  console.log(`\n== Garbage ingredient names (unverified) ==`);
  console.log(`${rows.length} unverified rows total.\n`);

  console.log(`-- ${glued.length} with a glued-on lot/batch/PR code --`);
  for (const r of glued) console.log(`  "${r.inci_name}"`);

  console.log(`\n-- ${prose.length} containing leaked sentence text --`);
  for (const r of prose) console.log(`  "${r.inci_name}"`);

  console.log(
    `\n-- ${short.length} unexplained short names (<= ${SHORT_NAME_MAX_LENGTH} chars, not a known-real one) --`
  );
  console.log("   review individually: a blind filter here would also catch names like PCA or EGF.");
  for (const r of short) console.log(`  "${r.inci_name}"`);

  const flagged = [...glued, ...prose, ...short];
  if (flagged.length > 0) {
    console.log(
      `\n${flagged.length} flagged for manual review. Not deleted automatically — issue #86 rules that out, ` +
        "since some short survivors above are genuine. Once reviewed, delete confirmed-bad rows by hand:\n"
    );
    for (const r of flagged) {
      for (const statement of deleteStatementsFor(r.inci_name)) console.log(`  ${statement}`);
    }
  }
  return flagged;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const junkProducts = await auditJunkProducts(db);
  await auditGarbageIngredients(db);

  if (!APPLY) {
    console.log(
      junkProducts.length > 0
        ? `\n--dry-run (default): would delete ${junkProducts.length} product(s) above. ` +
            "Re-run with --delete-junk-products to actually delete them."
        : "\nNothing to delete."
    );
    return;
  }

  if (junkProducts.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  console.log(`\nDeleting ${junkProducts.length} confirmed non-cosmetic product(s)...`);
  let deleted = 0;
  for (const row of junkProducts) {
    // `product_ingredients` cascades on `products.id` (migration 0001), and a
    // barcode_db row carries no ingredients to begin with — see
    // `lookupBarcodeDb`'s own comment, "the whole point: this source has
    // none" — so there is nothing else to clean up per row.
    const { error } = await db.from("products").delete().eq("id", row.id);
    if (error) {
      throw new Error(`delete failed for ${row.id} (${deleted} of ${junkProducts.length} already deleted): ${error.message}`);
    }
    deleted += 1;
  }
  console.log(`Deleted ${deleted} product(s).`);
}

/**
 * Only run the audit when this file is what was invoked — same guard and
 * same reasoning as `import-obf.mjs`: the classification logic below is
 * ordinary functions and deserves ordinary tests, which need this file
 * importable without hitting a live database.
 */
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

export {
  classifyGarbageIngredient,
  deleteStatementsFor,
  sqlStringLiteral,
  GLUED_CODE,
  PROSE_MARKERS,
  KNOWN_SHORT_NAMES,
  SHORT_NAME_MAX_LENGTH,
};
