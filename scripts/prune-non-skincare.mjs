/**
 * Delete catalogue products that aren't skincare — nail polish removers,
 * household cleaners, oral care (#299).
 *
 * The OBF import now refuses these (`nonSkincareReason` in
 * `scripts/lib/non-skincare.mjs`); this removes the ones already imported.
 * The `products` table doesn't keep OBF's category tags, so existing rows are
 * judged by name alone.
 *
 * Reads and prints first; nothing is deleted unless `--apply` is passed. The
 * dry run lists every row it would remove, with the reason, so the list can
 * be read — and a false positive caught — before it is run for real.
 *
 * Run (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ENV too
 * once --apply makes it a write — plus --prod if that is production):
 *   node scripts/prune-non-skincare.mjs            # dry run: every row it would delete
 *   node scripts/prune-non-skincare.mjs --apply    # delete them
 *
 * `product_ingredients`, `scan_tokens` and `product_authors` rows go with
 * their product (on delete cascade). A `saved_products` row has no foreign
 * key to `products`, so a shelf entry for a deleted product stays and points
 * at nothing — the same as for any product pruned before.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { connect } from "./lib/db.mjs";
import { nonSkincareReason } from "./lib/non-skincare.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

async function main() {
  const apply = process.argv.includes("--apply");
  // Credentials are required for the dry run as well — it is a read of the
  // rows `--apply` would delete.
  const { db } = connect({ write: apply });

  const rows = await paginateOrdered(db, "products", {
    select: "id, source, brand, name",
    cursorColumn: "id",
  });

  const doomed = rows
    .map((row) => ({ row, reason: nonSkincareReason({ name: row.name }) }))
    .filter((entry) => entry.reason !== null);

  console.log(`${rows.length} products; ${doomed.length} not skincare, ${rows.length - doomed.length} kept.\n`);
  for (const { row, reason } of doomed) {
    console.log(`  ${row.id}  ${row.brand ?? ""} — ${String(row.name ?? "").slice(0, 60)}  (${reason})`);
  }

  if (!apply) {
    console.log("\nDry run: nothing deleted. Re-run with --apply to delete these rows.");
    return;
  }

  const ids = doomed.map(({ row }) => row.id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error } = await db.from("products").delete().in("id", batch);
    if (error) {
      console.error(`Delete failed after ${deleted} rows: ${error.message}`);
      process.exit(1);
    }
    deleted += batch.length;
  }
  console.log(`\nDeleted ${deleted} products.`);
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
