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
 *   node scripts/reclassify-from-tags.mjs --restart      # ignore the checkpoint
 *
 * Slow by design: Open Beauty Facts documents 15 product reads per minute per
 * IP, so this paces at 4.2s per row. A full pass takes roughly half an hour,
 * which is why it checkpoints — see PROGRESS_FILE.
 */

import { readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { guessType, retryAfterMs } from "./import-obf.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const OBF = "https://world.openbeautyfacts.org";
const USER_AGENT = "for.me/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";
const READ_INTERVAL_MS = 4_200;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Which product ids this pass has already read, so a run that dies at minute
 * 20 — or one deliberately cut short with `--limit` — resumes instead of
 * re-reading the same rows from the top. Only ids that actually resolved are
 * recorded: a row that failed on a network blip stays unprocessed and is
 * retried next time, which is the behaviour that makes a transient failure
 * cost nothing.
 *
 * Gitignored: it is per-machine progress, not project state.
 */
const PROGRESS_FILE = ".reclassify-from-tags-progress.json";

/**
 * The types the bug could have produced: a compound-name product whose
 * specific pattern missed falls into one of these broad catch-alls. Plus
 * "unknown" — those have the most to gain, since tags are exactly the signal
 * `reclassify-types.mjs` never had.
 *
 * Rows already carrying a specific type (lip-balm, sheet-mask, …) are left
 * alone: the classifier only ever reached those by matching a specific
 * pattern, so there is nothing here to improve.
 */
const CANDIDATE_TYPES = ["moisturizer", "cleanser", "sunscreen", "serum", "unknown"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `--limit N`, validated. A bare `--limit` used to yield `Number(undefined)`
 * → NaN → `slice(0, NaN)` → an empty candidate list, and the run reported
 * "0 candidates" as though everything were fine.
 */
export function parseLimit(argv) {
  const at = argv.indexOf("--limit");
  if (at === -1) return Infinity;
  const value = Number(argv[at + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--limit needs a positive whole number, got ${JSON.stringify(argv[at + 1] ?? null)}`);
  }
  return value;
}

/**
 * Whether this row's freshly-guessed type is worth writing.
 *
 * Never trades a real type for "unknown": the row already carries a guess
 * made from this same evidence, and losing it is a regression, not a repair.
 */
export function proposeChange(row, guessed) {
  if (guessed === row.type || guessed === "unknown") return null;
  return { ...row, now: guessed };
}

function loadProgress(restart) {
  if (restart) {
    try {
      rmSync(PROGRESS_FILE);
    } catch {
      // Nothing to clear.
    }
    return new Set();
  }
  try {
    return new Set(JSON.parse(readFileSync(PROGRESS_FILE, "utf8")));
  } catch {
    return new Set();
  }
}

function saveProgress(done) {
  writeFileSync(PROGRESS_FILE, JSON.stringify([...done]));
}

/**
 * That product's category tags.
 *
 * Returns `{ ok: true, tags }`, or `{ ok: false, reason }` where the reason
 * separates "OBF no longer holds this barcode" from "the request failed".
 * Collapsing those two was wrong: a rate-limit rejection or a 500 would be
 * recorded as a product that no longer exists, and the row would silently
 * never be repaired.
 *
 * Honours `Retry-After` once on a 429, the same way `fetchPage` in
 * import-obf.mjs does — at 4.2s per read this sits right on OBF's documented
 * 15-reads-per-minute limit, so a 429 is a matter of when, not if.
 */
async function fetchTags(barcode, retried = false) {
  let res;
  try {
    res = await fetch(
      `${OBF}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,categories_tags`,
      { headers: { "User-Agent": USER_AGENT } }
    );
  } catch (err) {
    return { ok: false, reason: `request failed: ${String(err)}` };
  }

  if (res.status === 429 && !retried) {
    const wait = retryAfterMs(res) ?? RATE_LIMIT_WINDOW_MS;
    console.warn(`\n  ! Rate-limited by OBF. Waiting ${Math.ceil(wait / 1000)}s and retrying once.`);
    await sleep(wait);
    return fetchTags(barcode, true);
  }

  if (res.status === 404) return { ok: false, reason: "not in OBF any more" };
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

  const body = await res.json().catch(() => null);
  // status 0 is OBF's own "no such product", distinct from a transport error.
  if (body?.status !== 1 || !body.product) return { ok: false, reason: "not in OBF any more" };
  return { ok: true, tags: body.product.categories_tags ?? [] };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required, including for --dry-run.");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const limit = parseLimit(process.argv);
  const done = loadProgress(process.argv.includes("--restart"));
  const db = createClient(url, key, { auth: { persistSession: false } });

  const rows = await paginateOrdered(db, "products", {
    select: "id, barcode, brand, name, type",
    cursorColumn: "id",
    filter: (q) => q.eq("source", "obf").in("type", CANDIDATE_TYPES),
  });
  const remaining = rows.filter((r) => r.barcode && !done.has(r.id));
  const candidates = remaining.slice(0, limit);

  if (done.size > 0) console.log(`Resuming: ${done.size} row(s) already read in a previous run.`);
  console.log(
    `${candidates.length} candidate(s) this run, ${remaining.length} still outstanding of ${rows.length} matching rows. ` +
      `~${Math.ceil((candidates.length * READ_INTERVAL_MS) / 60000)} min at OBF's rate limit.\n`
  );
  if (candidates.length === 0) {
    console.log("Nothing left to read. Use --restart to check every row again.");
    return;
  }

  const changes = [];
  const failures = [];
  let read = 0;
  for (const row of candidates) {
    if (read > 0) await sleep(READ_INTERVAL_MS);
    const result = await fetchTags(row.barcode);
    read += 1;
    process.stdout.write(`\r  read ${read}/${candidates.length}`);

    if (!result.ok) {
      // Deliberately NOT recorded as done — a blip should cost a retry next
      // run, not a row that never gets repaired.
      failures.push({ ...row, reason: result.reason });
      continue;
    }

    done.add(row.id);
    const change = proposeChange(row, guessType(result.tags, row.name));
    if (change) changes.push({ ...change, tags: result.tags.slice(0, 4).join(" ") });
  }
  // Written even on the dry run: reading is the expensive half, and a dry run
  // that had to be repeated from scratch is the thing this avoids.
  saveProgress(done);

  console.log(`\n\n${changes.length} row(s) would change:\n`);
  for (const c of changes) {
    console.log(`  ${c.brand} — ${c.name}`);
    console.log(`    ${c.type} -> ${c.now}   [${c.tags}]`);
  }
  if (failures.length > 0) {
    console.log(`\n${failures.length} row(s) could not be read, and will be retried on the next run:`);
    for (const f of failures.slice(0, 10)) console.log(`  ${f.brand} — ${f.name}: ${f.reason}`);
    if (failures.length > 10) console.log(`  …and ${failures.length - 10} more`);
  }

  if (changes.length === 0) return;

  if (dryRun) {
    console.log("\n--dry-run: nothing written. Progress saved, so a real run re-reads nothing.");
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

/**
 * Only sweep when this file is what was run, so the pure helpers above can be
 * imported by a test without a network or a service-role key. Same realpath
 * comparison `import-obf.mjs` uses, and for the same reason: `import.meta.url`
 * and `process.argv[1]` are different shapes, and on Windows they also
 * disagree about separators and drive-letter case.
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
