/**
 * One-off fix-up: re-run `guessType` against every OBF-sourced product
 * already in the catalogue, and correct `type` where it's wrong now.
 *
 * This is deliberately NOT a re-import. `scripts/import-obf.mjs` discovers
 * new products from Open Beauty Facts and is capped at TARGET_ROWS per run —
 * running it again to fix existing rows would also add several hundred new
 * ones as a side effect, since it has no notion of "products we already
 * have". This script only reads and writes `products` — no network calls to
 * OBF, nothing added, nothing removed.
 *
 * Only `source = 'obf'` rows are touched. The hand-curated sample catalogue
 * was never typed by `guessType` and has no business being re-guessed.
 *
 * `guessType` is imported from `import-obf.mjs` rather than copied — it
 * already has one required parity copy in the product-lookup Edge Function
 * (Node vs. Deno runtimes can't share a module); a third copy here would be
 * one more place for the two to drift apart.
 *
 * `guessType` normally reads OBF's `categories_tags` too, which this table
 * does not store — only `name` is available here. That is strictly less
 * signal than import time had, and a first dry run proved it: re-guessing
 * from name alone regressed ~200 already-correctly-typed rows to `unknown`
 * (whatever matched their category tag, not their name, is invisible now),
 * and even produced one outright wrong guess (a brand name containing "uv"
 * got typed as sunscreen — which is also why `brand` is deliberately NOT
 * part of the input below; the original import never used it either).
 *
 * So this only ever moves a row OUT of `unknown` into one of the 16 new
 * types — never between two already-determined types, and never back into
 * `unknown`. A product sitting at `unknown` today got there because NO
 * pattern existed yet, tag or name; if the name alone now matches one of the
 * 16 new patterns, that's real independent evidence, not a guess competing
 * with lost tag information.
 *
 * A second, narrower fallback runs after that: for whatever still resolves
 * to "unknown" by name, fetch its ingredient list and try
 * `guessTypeFromIngredients` (a product named after its active — "Lactic
 * Acid 10%" — has no format word for either guessType pass to catch, only
 * the formula itself carries the signal). Only reached for genuine
 * remaining candidates, not every row, since it costs one extra query each.
 *
 * Run:
 *   node scripts/reclassify-types.mjs --dry-run      # print what would change
 *   node scripts/reclassify-types.mjs                # write to Supabase
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, including for --dry-run —
 * same reasoning as import-obf.mjs: the numbers a dry run prints should be
 * the numbers a real run would write, and reading the actual table needs the
 * same credentials either way. Writing needs SUPABASE_ENV=staging or
 * production on top of them, and --prod as well for production.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { connect } from "./lib/db.mjs";
import { guessType } from "./import-obf.mjs";
import { guessTypeFromIngredients } from "./lib/guess-type-from-ingredients.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * The two passes, as plain functions, each returning a type or null.
 *
 * Exported so the rule this script is built around is testable without a
 * database: a row only ever moves OUT of "unknown", never between two real
 * types — the table stores no category tags, so a re-guess from the name
 * alone knows strictly less than the import did (see the file header).
 */
export function nameGuess(name) {
  const guessed = guessType([], name);
  return guessed === "unknown" ? null : guessed;
}

export function ingredientGuess(name, ingredients) {
  const guessed = guessTypeFromIngredients(name, ingredients);
  return guessed === "unknown" ? null : guessed;
}

/**
 * One product's ingredient list, for `guessTypeFromIngredients`. One query
 * per product rather than a bulk join — this only ever runs for rows the
 * name-based passes already gave up on, and an operator script run a few
 * times a year can afford one round trip each.
 */
async function fetchProductIngredients(db, productId) {
  const { data, error } = await db
    .from("product_ingredients")
    .select("inci_name, position")
    .eq("product_id", productId)
    .order("position");
  if (error) throw new Error(`product_ingredients read failed for ${productId}: ${error.message}`);
  return data ?? [];
}

async function main() {
  // Credentials are required for --dry-run too — it reads the same rows the
  // real run would rewrite, and reports on them.
  const { db } = connect({ write: !DRY_RUN });

  const rows = await paginateOrdered(db, "products", {
    select: "id, brand, name, type",
    cursorColumn: "id",
    // Only rows currently stuck at "unknown" are candidates — see the file
    // header for why an already-typed row is never touched here.
    filter: (q) => q.eq("source", "obf").eq("type", "unknown"),
  });
  console.log(`Read ${rows.length} OBF-sourced product(s) currently typed "unknown".\n`);

  const changes = [];
  let ingredientFallbackTried = 0;
  for (const row of rows) {
    const byName = nameGuess(row.name);
    if (byName) {
      changes.push({ ...row, guessed: byName, via: "name" });
      continue;
    }

    // Only fetched once the name pass has given up, so the extra query lands
    // on genuine candidates rather than on every row.
    ingredientFallbackTried += 1;
    const byIngredients = ingredientGuess(row.name, await fetchProductIngredients(db, row.id));
    if (byIngredients) changes.push({ ...row, guessed: byIngredients, via: "ingredients" });
  }
  console.log(`Tried the ingredient-based fallback on ${ingredientFallbackTried} row(s).\n`);

  if (changes.length === 0) {
    console.log("Nothing to change — no unknown row matches either pass.");
    return;
  }

  console.log(`${changes.length} row(s) would change:\n`);
  for (const c of changes) {
    console.log(`  ${c.brand} — ${c.name}`);
    console.log(`    ${c.type} -> ${c.guessed}  (via ${c.via})`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  let written = 0;
  let skipped = 0;
  for (const c of changes) {
    // `.eq("type", c.type)` pins the write to the value this row had when we
    // read it above — a real scan/lookup for this exact barcode landing in
    // the gap between that read and this write would otherwise get its
    // fresher type silently clobbered by this stale one. A 0-row result
    // means someone else already changed it; skip rather than overwrite.
    //
    // `fetched_at` moves with it, so the client's freshness key actually
    // notices — see the long note on the same write in
    // `reclassify-from-tags.mjs` for why a type-only update is invisible to a
    // device that already holds the catalogue.
    const { data, error } = await db
      .from("products")
      .update({ type: c.guessed, fetched_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("type", c.type)
      .select("id");
    if (error) {
      throw new Error(
        `products update failed for ${c.id} (${written} of ${changes.length} already written): ${error.message}`
      );
    }
    if ((data ?? []).length === 0) {
      skipped += 1;
    } else {
      written += 1;
    }
    process.stdout.write(`\r  ${written}/${changes.length}`);
  }
  console.log(`\nUpdated ${written} product(s).`);
  if (skipped > 0) {
    console.log(`Skipped ${skipped} — already changed elsewhere since this run started reading.`);
  }
}

/**
 * Only sweep when this file is what was run, so the two passes above can be
 * imported by a test without a database. Same realpath comparison
 * `import-obf.mjs` uses: `import.meta.url` and `process.argv[1]` are
 * different shapes, and on Windows they also disagree about separators and
 * drive-letter case.
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
