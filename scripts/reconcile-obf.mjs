/**
 * Step 8 of the data-strategy plan: nightly reconciliation for Open Beauty
 * Facts rows.
 *
 * Nothing in this catalogue is ever re-checked after it's written — a
 * formula imported in September is served in November exactly as it was,
 * even if the brand reformulated it. `fetched_at` (migrations 0009/0010)
 * already tracks when a row was last confirmed current; this is the thing
 * that actually confirms it, for the one source where it's both safe and
 * free to do automatically.
 *
 * Scope, decided with the user: **`obf` only.** `inci_api` rows already
 * expire hourly and their licence forbids bulk re-fetching. `ocr` rows carry
 * a formula this app's own camera read off a physical label — there is no
 * external source to check them against, so they're excluded outright; a
 * fresh re-scan of the same bottle is already how those update.
 * `curated`, `barcode_db` and `dailymed` are untouched here too —
 * `dailymed`'s own reconciliation, if wanted later, is the same shape but a
 * separate decision.
 *
 * No checkpoint file, unlike `reclassify-from-tags.mjs`. That script needs
 * one because a row's outcome (a type change) doesn't move the column the
 * candidate query sorts by, so without a checkpoint a partial run would
 * just re-read the same untouched rows forever. Here, every row this run
 * touches — changed, unchanged, or permanently gone from OBF — has its
 * `fetched_at` moved to now, and the candidate query is exactly "the oldest
 * `fetched_at` rows." A row this run reaches drops out of that ordering on
 * its own; a crash after 150 of 300 rows just means the next run picks up
 * the next 300-oldest, which no longer includes the 150 already done.
 * Nothing needs to be remembered between runs beyond what's already on the
 * table.
 *
 * Run (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/reconcile-obf.mjs --dry-run
 *   node scripts/reconcile-obf.mjs
 *   node scripts/reconcile-obf.mjs --dry-run --limit 20
 *
 * Slow by design, same reason as reclassify-from-tags.mjs: Open Beauty Facts
 * documents 15 product reads per minute per IP (import-obf.mjs's own
 * comment names this tier, distinct from the 10/min search tier that
 * importer paces against). 4.5s per row, rounded up past the 4s floor the
 * same way that file rounds 6s up to 6.5s — this may share an IP with
 * whatever else is importing.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { MIN_KNOWN_INGREDIENT_RATIO, retryAfterMs } from "./import-obf.mjs";
import { parseInci } from "./lib/inci-parse.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const OBF = "https://world.openbeautyfacts.org";
const USER_AGENT = "for.me/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";
const READ_INTERVAL_MS = 4_500;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Rows per run, regardless of `--limit`. Comfortably inside a GitHub
 * Actions job's runtime at 4.5s/row (~22 min for a full batch), and rotates
 * through today's ~500-row `obf` catalogue roughly every two nights. Raise
 * this once step 7 lifts the import cap and the catalogue actually grows —
 * not before, since there is nothing to gain from checking rows faster than
 * OBF's own data changes.
 */
const BATCH_SIZE = 300;

// Exactly the columns `replace_product_with_ingredients` (migration 0008)
// reads out of `p_product` — every one of them gets written back on every
// call, so a changed row needs all of them round-tripped unchanged, not
// just its id and formula.
const PRODUCT_COLUMNS =
  "id, barcode, brand, name, type, area, description, image_url, volume, " +
  "in_stock, suitable_for, targets, source, attribution, expires_at";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Same validation as reclassify-from-tags.mjs's own `--limit`, and the same reason. */
export function parseLimit(argv) {
  const at = argv.indexOf("--limit");
  if (at === -1) return Infinity;
  const value = Number(argv[at + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--limit needs a positive whole number, got ${JSON.stringify(argv[at + 1] ?? null)}`);
  }
  return value;
}

/** Mirrors reclassify-from-tags.mjs's own `capDelay` — see that file for the reasoning. */
function capDelay(ms) {
  return Math.min(Math.max(ms, 0), RATE_LIMIT_WINDOW_MS);
}

/**
 * That product's current formula, as Open Beauty Facts has it today.
 *
 * Same shape and the same reasoning as `fetchTags` in
 * reclassify-from-tags.mjs: `{ ok: true, text }`, or `{ ok: false, permanent,
 * reason }` where `permanent` separates "OBF no longer holds this barcode"
 * (status 0 — will not change on a retry) from every other failure (stays
 * retryable, never checkpointed as gone on the strength of a response that
 * might just be a blip).
 */
export async function fetchIngredients(barcode, retried = false) {
  let res;
  try {
    res = await fetch(`${OBF}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,ingredients_text`, {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (err) {
    return { ok: false, permanent: false, reason: `request failed: ${String(err)}` };
  }

  if (res.status === 429 && !retried) {
    const wait = capDelay(retryAfterMs(res) ?? RATE_LIMIT_WINDOW_MS);
    console.warn(`\n  ! Rate-limited by OBF. Waiting ${Math.ceil(wait / 1000)}s and retrying once.`);
    await sleep(wait);
    return fetchIngredients(barcode, true);
  }

  if (res.status === 404) return { ok: false, permanent: true, reason: "not in OBF any more" };
  if (!res.ok) return { ok: false, permanent: false, reason: `HTTP ${res.status}` };

  let body;
  try {
    body = await res.json();
  } catch (err) {
    return { ok: false, permanent: false, reason: `unreadable response: ${String(err)}` };
  }

  if (body?.status === 0) return { ok: false, permanent: true, reason: "not in OBF any more" };
  if (body?.status !== 1 || !body.product) {
    return { ok: false, permanent: false, reason: `unexpected response shape (status ${body?.status})` };
  }
  return { ok: true, text: (body.product.ingredients_text ?? "").trim() };
}

/**
 * Whether the freshly-parsed formula actually differs from what's stored —
 * same names, same order, or not. `current` is `product_ingredients` as
 * read from the table (position not guaranteed to arrive sorted); `fresh`
 * is `parseInci`'s output, already position-ordered and deduped.
 */
export function formulaChanged(current, fresh) {
  const before = [...current].sort((a, b) => a.position - b.position).map((i) => i.inci_name);
  const after = fresh.map((i) => i.inci_name);
  if (before.length !== after.length) return true;
  return before.some((name, i) => name !== after[i]);
}

/**
 * Verified ingredient names only — mirrors `fetchKnownIngredients` in
 * import-obf.mjs (not exported there; see that file's fuller comment for why
 * unverified stubs must stay excluded, which applies here with the same
 * force: a reconciliation run must not let one bad OBF edit teach the next
 * run that its own garbage is recognised).
 */
async function fetchKnownIngredients(db) {
  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name",
    cursorColumn: "inci_name",
    filter: (q) => q.eq("verified", true),
  });
  return new Set(rows.map((r) => r.inci_name.toLowerCase()));
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required, including for --dry-run.");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  // `--limit` can only lower the per-run cap, never raise it — see BATCH_SIZE.
  const limit = Math.min(parseLimit(process.argv), BATCH_SIZE);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const known = await fetchKnownIngredients(db);

  const { data: rows, error: readError } = await db
    .from("products")
    .select(`${PRODUCT_COLUMNS}, product_ingredients ( inci_name, position )`)
    // `expires_at is null` is redundant for source='obf' today — the
    // `cached_sources_must_expire` constraint (0001, widened by 0014)
    // already forbids an obf row from carrying one — kept anyway as cheap
    // insurance against that constraint ever loosening for this source too.
    .eq("source", "obf")
    .is("expires_at", null)
    .order("fetched_at", { ascending: true })
    .limit(limit);
  if (readError) throw new Error(`products read failed: ${readError.message}`);

  const candidates = (rows ?? []).filter((r) => r.barcode);
  console.log(
    `${candidates.length} candidate(s) this run. ` +
      `~${Math.ceil((candidates.length * READ_INTERVAL_MS) / 60000)} min at OBF's rate limit.\n`
  );
  if (candidates.length === 0) {
    console.log("Nothing to reconcile.");
    return;
  }

  let read = 0;
  let unchanged = 0;
  let changed = 0;
  let gone = 0;
  let retryable = 0;
  const changedSamples = [];
  const retryableSamples = [];

  for (const row of candidates) {
    if (read > 0) await sleep(READ_INTERVAL_MS);
    const result = await fetchIngredients(row.barcode);
    read += 1;
    process.stdout.write(`\r  read ${read}/${candidates.length}`);

    if (!result.ok) {
      if (result.permanent) {
        // Gone from OBF is not proof the product itself vanished — the row
        // stays, exactly as decided in the plan. But it's still a genuine
        // answer as of today, not a failed read, so it's confirmed the same
        // way an unchanged formula is: touch `fetched_at` and move on,
        // rather than re-spending a request on it every single night.
        gone += 1;
        if (!dryRun) {
          const { error } = await db.from("products").update({ fetched_at: new Date().toISOString() }).eq("id", row.id);
          if (error) throw new Error(`fetched_at touch failed for ${row.id} (gone from OBF): ${error.message}`);
        }
      } else {
        retryable += 1;
        if (retryableSamples.length < 5) retryableSamples.push(`${row.brand} — ${row.name}: ${result.reason}`);
      }
      continue;
    }

    const fresh = parseInci(result.text);
    if (fresh.length < 2) {
      retryable += 1;
      if (retryableSamples.length < 5) {
        retryableSamples.push(`${row.brand} — ${row.name}: the new read has fewer than 2 parsed ingredients`);
      }
      continue;
    }

    // Same plausibility gate the importers use (see MIN_KNOWN_INGREDIENT_RATIO
    // in import-obf.mjs). A row that already passed this gate once must not be
    // overwritten by an edit that fails it now — better to leave the existing,
    // already-vetted formula in place and retry the read next run.
    const hits = fresh.filter((i) => known.has(i.inci_name)).length;
    if (hits / fresh.length < MIN_KNOWN_INGREDIENT_RATIO) {
      retryable += 1;
      if (retryableSamples.length < 5) {
        retryableSamples.push(`${row.brand} — ${row.name}: new read is only ${hits}/${fresh.length} recognised`);
      }
      continue;
    }

    if (!formulaChanged(row.product_ingredients, fresh)) {
      // Confirmed current as of today, nothing to change — still worth the
      // touch, or this row would look just as stale next run despite having
      // just been checked.
      unchanged += 1;
      if (!dryRun) {
        const { error } = await db.from("products").update({ fetched_at: new Date().toISOString() }).eq("id", row.id);
        if (error) throw new Error(`fetched_at touch failed for ${row.id} (unchanged): ${error.message}`);
      }
      continue;
    }

    changed += 1;
    if (changedSamples.length < 5) changedSamples.push(`${row.brand} — ${row.name}`);
    if (!dryRun) {
      const { id, barcode, brand, name, type, area, description, image_url, volume, in_stock, suitable_for, targets, source, attribution, expires_at } =
        row;
      // `formula_changed_at` travels in the same call as the formula
      // replacement (migration 0018), not as a follow-up UPDATE. Two
      // separate statements meant a failure between them — the formula
      // replaced, the change never recorded — would permanently lose the
      // event: a later run compares against the already-replaced formula,
      // finds no difference, and has no way to know anything happened.
      // Found by Codex on PR #122.
      const { error: rpcError } = await db.rpc("replace_product_with_ingredients", {
        p_product: { id, barcode, brand, name, type, area, description, image_url, volume, in_stock, suitable_for, targets, source, attribution, expires_at },
        p_ingredients: fresh,
        // Same note import-obf.mjs itself passes for an OBF-sourced stub.
        p_stub_note: "No published rating for this ingredient yet.",
        p_formula_changed_at: new Date().toISOString(),
      });
      if (rpcError) throw new Error(`replace_product_with_ingredients failed for ${id}: ${rpcError.message}`);
    }
  }

  console.log(
    `\n\n${unchanged} unchanged, ${changed} changed, ${gone} gone from OBF, ` +
      `${retryable} unread (will retry next run).\n`
  );
  if (changedSamples.length > 0) {
    console.log("Changed:");
    for (const s of changedSamples) console.log(`  ${s}`);
  }
  if (retryableSamples.length > 0) {
    console.log("\nCould not be reconciled this run:");
    for (const s of retryableSamples) console.log(`  ${s}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  // Purely for the doc's own open question — "who is watching the nightly
  // job?" `watermark` carries nothing here: unlike an incremental import,
  // this job's resume point is just "the oldest fetched_at," which needs no
  // value remembered between runs. `last_run_at` is the only thing anyone
  // will ever query this row for.
  const { error: bookmarkError } = await db.from("sync_bookmarks").upsert(
    { source: "reconcile-obf", watermark: null, last_run_at: new Date().toISOString() },
    // Explicit even though `source` is already the primary key — matches
    // import-obf.mjs's and import-dailymed.mjs's own sync_bookmarks upserts.
    { onConflict: "source" }
  );
  if (bookmarkError) throw new Error(`sync_bookmarks upsert failed: ${bookmarkError.message}`);
  console.log("\nsync_bookmarks updated.");
}

/**
 * Same realpath comparison import-obf.mjs and reclassify-from-tags.mjs use,
 * and for the same reason: only sweep when this file is what was run, so the
 * pure helpers above can be imported by a test with no network and no
 * service-role key.
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
