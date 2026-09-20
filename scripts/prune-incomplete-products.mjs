/**
 * Delete every product that is missing a name, a barcode or an ingredient list.
 *
 * A product only helps a scan if it can be found (barcode), named (name) and
 * judged (ingredients). The catalogue had accumulated the other kinds: a
 * barcode and name with no ingredients (`barcode_db`), and a formula with no
 * barcode (label photos on their grace timer, and the DailyMed import). This
 * removes them, and migration 0022 stops new ones being written.
 *
 * Reads and prints first; nothing is deleted unless `--apply` is passed. The
 * dry run lists what would go, by source and reason, so it can be read before
 * it is run for real.
 *
 * Run (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/prune-incomplete-products.mjs            # dry run: counts and a sample
 *   node scripts/prune-incomplete-products.mjs --apply    # delete them
 *
 * `product_ingredients` rows go with their product (on delete cascade). The
 * `ingredients` dictionary is left alone: those names belong to the dictionary,
 * not to the product that mentioned them.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { paginateOrdered } from "./lib/paginate.mjs";

/**
 * Why a product is incomplete, or null when it is whole. Exported for the test.
 *
 * @param {{ barcode: string | null, name: string | null, product_ingredients: { count: number }[] | null }} row
 * @returns {string | null}
 */
export function incompleteReason(row) {
  const reasons = [];
  if (!row.name || !row.name.trim()) reasons.push("no name");
  if (!row.barcode || !row.barcode.trim()) reasons.push("no barcode");
  if (!(row.product_ingredients?.[0]?.count > 0)) reasons.push("no ingredients");
  return reasons.length ? reasons.join(" + ") : null;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required, including for the dry run.");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const rows = await paginateOrdered(db, "products", {
    select: "id, source, barcode, name, product_ingredients(count)",
    cursorColumn: "id",
  });

  const doomed = rows
    .map((row) => ({ row, reason: incompleteReason(row) }))
    .filter((entry) => entry.reason !== null);

  const tally = new Map();
  for (const { row, reason } of doomed) {
    const key = `${row.source} — ${reason}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  console.log(`${rows.length} products; ${doomed.length} incomplete, ${rows.length - doomed.length} kept.\n`);
  for (const [group, count] of [...tally].sort()) console.log(`  ${String(count).padStart(4)}  ${group}`);
  console.log("\nSample:");
  for (const { row, reason } of doomed.slice(0, 12)) {
    console.log(`  ${row.id}  (${reason})  ${String(row.name ?? "").slice(0, 50)}`);
  }

  if (!apply) {
    console.log("\nDry run: nothing deleted. Re-run with --apply to delete these rows.");
    return;
  }

  const ids = doomed.map(({ row }) => row.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from("products").delete().in("id", ids.slice(i, i + 200));
    if (error) {
      console.error(`Delete failed after ${i} rows: ${error.message}`);
      process.exit(1);
    }
  }
  console.log(`\nDeleted ${ids.length} products.`);
}

function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
