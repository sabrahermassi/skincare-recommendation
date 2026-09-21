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

import { connect } from "./lib/db.mjs";
import { guessType, retryAfterMs } from "./import-obf.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const OBF = "https://world.openbeautyfacts.org";
const USER_AGENT = "for.me/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";
const READ_INTERVAL_MS = 4_200;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Which product ids are *settled*, so a run that dies at minute 20 — or one
 * cut short with `--limit` — resumes instead of starting from the top.
 *
 * Settled means the row's outcome cannot change on a retry: its update was
 * applied (or skipped because someone else changed it first), it was read and
 * needed nothing, or OBF permanently no longer holds the barcode. Everything
 * else stays out — a transport failure or a 5xx costs a retry next run, and a
 * row with a change still pending is never recorded, so a dry run cannot
 * swallow the work it just listed.
 *
 * Gitignored: per-machine progress, not project state.
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
const CANDIDATE_TYPES = [
  "moisturizer",
  "cleanser",
  "sunscreen",
  "serum",
  // Both were themselves catch-alls before the classifier fixes: the old
  // body-lotion pattern matched "body butter" outright, and the generic scrub
  // rule swallowed body scrubs into `exfoliator`. Without these, a full run
  // reports completion while leaving those rows misclassified.
  "body-lotion",
  "exfoliator",
  // Not catch-alls — a second, separate bug also lands here: the lip regex
  // used to miss a hyphenated tag (`en:lip-balms`) for lack of `[\s-]?`, so a
  // lip product fell through to whatever specific rule matched next, which
  // could be one of these three just as easily as a catch-all. Only 6 rows
  // total as of writing, so sweeping all of them costs nothing.
  "toner",
  "essence",
  "ampoule",
  "unknown",
];

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
 * `Retry-After` is a server-supplied number and nothing bounds it — a large
 * value, or an HTTP date days out, would park the repair for hours. One
 * window is the longest wait that can still be justified: the limit is per
 * minute, so having sent nothing for that long, it has certainly rolled.
 */
export function capDelay(ms) {
  return Math.min(Math.max(ms, 0), RATE_LIMIT_WINDOW_MS);
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

function saveProgress(settled) {
  writeFileSync(PROGRESS_FILE, JSON.stringify([...settled]));
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
export async function fetchTags(barcode, retried = false) {
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
    const wait = capDelay(retryAfterMs(res) ?? RATE_LIMIT_WINDOW_MS);
    console.warn(`\n  ! Rate-limited by OBF. Waiting ${Math.ceil(wait / 1000)}s and retrying once.`);
    await sleep(wait);
    return fetchTags(barcode, true);
  }

  // `permanent` marks an answer that will not change on a retry, so the
  // caller can checkpoint it and stop re-reading it every run.
  if (res.status === 404) return { ok: false, permanent: true, reason: "not in OBF any more" };
  if (!res.ok) return { ok: false, permanent: false, reason: `HTTP ${res.status}` };

  // A 200 carrying a truncated body, or an HTML page from something sitting in
  // front of OBF, is a failed read and not an answer about the product. Folding
  // it in with `status: 0` below would checkpoint the row on the strength of a
  // response we could not even parse, and it would never be read again.
  let body;
  try {
    body = await res.json();
  } catch (err) {
    return { ok: false, permanent: false, reason: `unreadable response: ${String(err)}` };
  }

  // status 0 is OBF's own explicit "no such product" — the only shape that
  // means the answer will not change on a retry. Anything else unexpected
  // (status 1 with no product, an intermediary's own error JSON, a future
  // field OBF adds) is evidence the read went wrong, not evidence the product
  // is gone, so it stays retryable rather than being checkpointed forever.
  if (body?.status === 0) {
    return { ok: false, permanent: true, reason: "not in OBF any more" };
  }
  if (body?.status !== 1 || !body.product) {
    return { ok: false, permanent: false, reason: `unexpected response shape (status ${body?.status})` };
  }
  return { ok: true, tags: body.product.categories_tags ?? [] };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = parseLimit(process.argv);
  const settled = loadProgress(process.argv.includes("--restart"));
  // Credentials are required for --dry-run too — it reads the live rows it
  // reports on.
  const { db } = connect({ write: !dryRun });

  const rows = await paginateOrdered(db, "products", {
    select: "id, barcode, brand, name, type",
    cursorColumn: "id",
    filter: (q) => q.eq("source", "obf").in("type", CANDIDATE_TYPES),
  });
  const remaining = rows.filter((r) => r.barcode && !settled.has(r.id));
  const candidates = remaining.slice(0, limit);

  if (settled.size > 0) {
    console.log(`Resuming: ${settled.size} row(s) already settled in an earlier run.`);
  }
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
      // A permanent miss is settled — OBF will keep saying no, so re-reading
      // it every run would eventually fill `--limit` with nothing but these
      // and starve every row behind them. A transport or 5xx failure is not
      // settled and stays unrecorded, so a blip costs a retry rather than a
      // row that never gets repaired.
      if (result.permanent) settled.add(row.id);
      failures.push({ ...row, reason: result.reason, permanent: result.permanent === true });
      continue;
    }

    const change = proposeChange(row, guessType(result.tags, row.name));
    // Read and found to need nothing: settled, whatever mode this is.
    if (!change) settled.add(row.id);
    else changes.push({ ...change, tags: result.tags.slice(0, 4).join(" ") });
  }

  console.log(`\n\n${changes.length} row(s) would change:\n`);
  for (const c of changes) {
    console.log(`  ${c.brand} — ${c.name}`);
    console.log(`    ${c.type} -> ${c.now}   [${c.tags}]`);
  }
  // Split, because the two halves have opposite futures and saying "will be
  // retried" over both is wrong for one of them: a permanent miss was just
  // added to `settled` and is done with, a transient one is not recorded at all
  // and comes back next run.
  const gone = failures.filter((f) => f.permanent);
  const retryable = failures.filter((f) => !f.permanent);
  const list = (rows) => {
    for (const f of rows.slice(0, 10)) console.log(`  ${f.brand} — ${f.name}: ${f.reason}`);
    if (rows.length > 10) console.log(`  …and ${rows.length - 10} more`);
  };
  if (gone.length > 0) {
    console.log(`\n${gone.length} row(s) are no longer in OBF, and will not be read again:`);
    list(gone);
  }
  if (retryable.length > 0) {
    console.log(`\n${retryable.length} row(s) could not be read, and will be retried on the next run:`);
    list(retryable);
  }

  // Saved here, before any write, because everything in `settled` is a row
  // whose outcome cannot change: a permanent OBF miss, or a read that found
  // nothing to update. Rows with a pending change are deliberately absent —
  // see the dry-run branch below.
  saveProgress(settled);

  if (changes.length === 0) return;

  if (dryRun) {
    console.log(
      `\n--dry-run: nothing written. The ${changes.length} row(s) above are NOT checkpointed, ` +
        "so the real run will re-read and apply them."
    );
    return;
  }

  let written = 0;
  let skipped = 0;
  for (const c of changes) {
    // Pinned to the type read at the top of this run, same as
    // reclassify-types.mjs: a live scan landing on this barcode mid-run must
    // not have its fresher answer overwritten by this one.
    //
    // `fetched_at` moves too, or this repair never reaches anyone. The client's
    // freshness key is the exact product count plus the newest `fetched_at`
    // (`fetchWatermark` in data/api.ts), and a type-only write moves neither:
    // the watermark still matches on the next launch, `touchCatalogue` renews
    // the 24h window, and a device with a warm catalogue serves the old type —
    // and the `contactWeight` derived from it — indefinitely. Only
    // `replace_product_with_ingredients` bumps the column (migration 0009), and
    // this script deliberately does not go through it.
    //
    // The cost is that `fetched_at` also captions "This formula was read {when}"
    // past six months, so an old formula's age warning resets although the
    // formula itself did not change. That is worth paying: the caption is an
    // advisory line on one screen, while a wrong type skews the score on every
    // view of the product.
    const { data, error } = await db
      .from("products")
      .update({ type: c.now, fetched_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("type", c.type)
      .select("id");
    if (error) {
      throw new Error(
        `products update failed for ${c.id} (${written} of ${changes.length} already written): ${error.message}`
      );
    }
    // Settled only now that the write has actually landed (or was skipped
    // because someone else got there first). Checkpointing before this is
    // what made a dry run swallow the whole workload: every reviewed row came
    // back marked done, and the real run then had nothing left to apply.
    settled.add(c.id);
    saveProgress(settled);
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
