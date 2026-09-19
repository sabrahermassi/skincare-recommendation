/**
 * Issue #86: two distinct data-quality problems in the live catalogue.
 *
 * 1. Non-cosmetic products. The `barcode_db` fallback (UPCitemdb) indexes
 *    every barcode there is, not just cosmetics, and returns no ingredients —
 *    an unfiltered hit wrote rows like ORGANIC BLUE CORN TORTILLA CHIPS,
 *    brand "N/A". `supabase/functions/product-lookup`'s `looksCosmetic` gate
 *    (migration-adjacent commit b6b32e8, 6 September) already stops *new*
 *    rows like this — "All of them stop new bad rows; none of them touch
 *    existing ones," in its own words. This script finds the existing ones,
 *    by re-running that same gate against every `barcode_db` row already on
 *    file.
 *
 * 2. Garbage ingredient names. Real products showing malformed entries —
 *    a batch/lot code glued onto a real name ("phenoxyethanol. pr-015376"),
 *    or unrelated sentence text that leaked in during OCR/parsing
 *    ("pr #78). 1 say and i'll move to step 2 (boarding"). A blind
 *    short-name filter would also catch genuine short INCI names (PCA, EGF),
 *    so this reports candidates for manual review rather than guessing.
 *
 * Run (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — both tables are
 * publicly readable, but every other script here needs the service key, and
 * deleting confirmed-junk products needs it regardless):
 *
 *   node scripts/audit-catalogue-quality.mjs                     # report only
 *   node scripts/audit-catalogue-quality.mjs --delete-junk-products
 *
 * `--delete-junk-products` is the one automatic action this script takes,
 * and only because it reuses the exact gate already trusted in production —
 * a `barcode_db` row that fails `looksCosmetic` today would never have been
 * written today. Ingredient garbage is report-only, on purpose: issue #86's
 * own plan rules out automatic deletion there, since some short survivors
 * (PCA, EGF) are genuine. Each flagged ingredient prints a ready `DELETE`
 * statement to run by hand once reviewed — deliberately not executed here.
 */

import { createClient } from "@supabase/supabase-js";

import { paginateOrdered } from "./lib/paginate.mjs";

const APPLY = process.argv.includes("--delete-junk-products");

/**
 * Kept byte-for-byte in step with `looksCosmetic` in
 * `supabase/functions/product-lookup/index.ts` — the two run on different
 * runtimes (Node here, Deno there) so they cannot share a module. This is
 * the same "positive evidence, not a denylist" gate already live: a
 * `barcode_db` row failing it today is exactly the shape of row that gate
 * exists to refuse, just written before the gate did.
 */
function looksCosmetic(text) {
  return /beauty|cosmetic|personal care|skin|face|facial|body care|hair care|lotion|cream|crème|creme|serum|cleanser|shampoo|toner|sunscreen|spf|balm|moisturi|nettoyant|reinigings|limpiador|crema/i.test(
    text
  );
}

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

  const glued = rows.filter((r) => GLUED_CODE.test(r.inci_name));
  const prose = rows.filter((r) => !GLUED_CODE.test(r.inci_name) && PROSE_MARKERS.test(r.inci_name));
  const short = rows.filter(
    (r) =>
      !GLUED_CODE.test(r.inci_name) &&
      !PROSE_MARKERS.test(r.inci_name) &&
      r.inci_name.length <= SHORT_NAME_MAX_LENGTH &&
      !KNOWN_SHORT_NAMES.has(r.inci_name)
  );

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
      console.log(`  delete from ingredients where inci_name = ${JSON.stringify(r.inci_name)};`);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
