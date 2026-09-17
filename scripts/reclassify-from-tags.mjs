/**
 * Repair pass for products typed before the classifier was fixed.
 *
 * `reclassify-types.mjs` deliberately only moves rows OUT of "unknown" and
 * never between two real types. That restriction exists because the
 * `products` table doesn't store Open Beauty Facts' `categories_tags`, so a
 * re-guess from the name alone has strictly less information than the import
 * had — a first dry run of exactly that regressed ~200 correctly-typed rows.
 *
 * This script removes the restriction the only way that's safe: by
 * re-fetching each product's category tags from Open Beauty Facts, so the
 * classifier sees what it saw at import time, plus the fixes it has since
 * gained (hyphenated tags, lip products ahead of the SPF rule, the specific
 * mask/oil types ahead of the bare serum rule).
 *
 * Measured on a 40-row sample before this was written: ~74 of 408 rows
 * carrying a broad catch-all type would come out differently, nearly all of
 * them lip products that `spf`/`cream` had claimed first.
 *
 * Run (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/reclassify-from-tags.mjs --dry-run
 *   node scripts/reclassify-from-tags.mjs
 *   node scripts/reclassify-from-tags.mjs --dry-run --limit 60
 *
 * Slow by design: Open Beauty Facts documents 15 product reads per minute per
 * IP, so this paces at 4.2s per row. A full pass over the candidates takes
 * roughly half an hour. `--limit` exists so a partial pass is possible; the
 * rows it skips are simply picked up by the next run.
 */

import { createClient } from "@supabase/supabase-js";

import { guessType } from "./import-obf.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const OBF = "https://world.openbeautyfacts.org";
const USER_AGENT = "for.me/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";
const READ_INTERVAL_MS = 4_200;

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;

/**
 * Which rows are worth spending a request on: the broad catch-alls a missed
 * specific pattern falls into, plus "unknown" — those have the most to gain,
 * since tags are exactly the signal `reclassify-types.mjs` never had.
 *
 * Rows already carrying a specific type (lip-balm, sheet-mask, …) are left
 * alone: the classifier only ever reached those by matching a specific
 * pattern, so there is nothing for this pass to improve.
 */
const CANDIDATE_TYPES = ["moisturizer", "cleanser", "sunscreen", "serum", "unknown"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** That product's current category tags, or null if OBF can't resolve it any more. */
async function fetchTags(barcode) {
  const res = await fetch(
    `${OBF}/api/v2/product/${barcode}.json?fields=code,categories_tags`,
    { headers: { "User-Agent": USER_AGENT } }
  ).catch(() => null);
  if (!res?.ok) return null;
  const body = await res.json().catch(() => null);
  if (body?.status !== 1 || !body.product) return null;
  return body.product.categories_tags ?? [];
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required, including for --dry-run.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const rows = await paginateOrdered(db, "products", {
    select: "id, barcode, brand, name, type",
    cursorColumn: "id",
    filter: (q) => q.eq("source", "obf").in("type", CANDIDATE_TYPES),
  });
  const candidates = rows.filter((r) => r.barcode).slice(0, LIMIT);
  console.log(
    `${candidates.length} candidate(s) with a barcode, of ${rows.length} matching rows. ` +
      `~${Math.ceil((candidates.length * READ_INTERVAL_MS) / 60000)} min at OBF's rate limit.\n`
  );

  const changes = [];
  let checked = 0;
  let unresolved = 0;
  for (const row of candidates) {
    if (checked > 0) await sleep(READ_INTERVAL_MS);
    const tags = await fetchTags(row.barcode);
    checked += 1;
    process.stdout.write(`\r  read ${checked}/${candidates.length}`);
    if (tags === null) {
      unresolved += 1;
      continue;
    }

    const now = guessType(tags, row.name);
    // Never trade a real type for "unknown": the row already carries a guess
    // made from this same evidence, and losing it is a regression, not a fix.
    if (now === row.type || now === "unknown") continue;
    changes.push({ ...row, now, tags: tags.slice(0, 4).join(" ") });
  }

  console.log(
    `\n\n${changes.length} row(s) would change` +
      (unresolved ? ` (${unresolved} no longer resolvable at OBF, skipped)` : "") +
      (changes.length ? ":\n" : ".")
  );
  for (const c of changes) {
    console.log(`  ${c.brand} — ${c.name}`);
    console.log(`    ${c.type} -> ${c.now}   [${c.tags}]`);
  }

  if (changes.length === 0) return;

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  let written = 0;
  let skipped = 0;
  for (const c of changes) {
    // Pinned to the type read at the top of this run, same as
    // reclassify-types.mjs: a live scan landing on this barcode mid-run must
    // not have its fresher answer overwritten by this one.
    const { data, error } = await db
      .from("products")
      .update({ type: c.now })
      .eq("id", c.id)
      .eq("type", c.type)
      .select("id");
    if (error) {
      throw new Error(
        `products update failed for ${c.id} (${written} of ${changes.length} already written): ${error.message}`
      );
    }
    if ((data ?? []).length === 0) skipped += 1;
    else written += 1;
    process.stdout.write(`\r  write ${written}/${changes.length}`);
  }
  console.log(`\nUpdated ${written} product(s).`);
  if (skipped > 0) {
    console.log(`Skipped ${skipped} — already changed elsewhere since this run started reading.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
