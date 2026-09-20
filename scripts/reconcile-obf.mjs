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
import { parserOnlyChange } from "./lib/formula-diff.mjs";
import { fetchAliases } from "./lib/aliases.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const OBF = "https://world.openbeautyfacts.org";
const USER_AGENT = "for.me/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";
const READ_INTERVAL_MS = 4_500;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Rows *successfully touched* per run (changed, unchanged, or confirmed
 * gone from OBF — not retryable), regardless of `--limit`. Comfortably
 * inside a GitHub Actions job's runtime at 4.5s/row (~22 min for a full
 * batch on an ordinary night), and rotates through today's ~500-row `obf`
 * catalogue roughly every two nights. Raise this once step 7 lifts the
 * import cap and the catalogue actually grows — not before, since there is
 * nothing to gain from checking rows faster than OBF's own data changes.
 */
const BATCH_SIZE = 300;

/**
 * Hard ceiling on OBF requests for the whole run, independent of
 * `BATCH_SIZE`. A retryable row never moves `fetched_at`, so it stays
 * "oldest" forever — a persistently broken prefix (OBF permanently 404s a
 * handful of barcodes, or they permanently fail the plausibility gate)
 * would otherwise have the candidate query hand back the *same* stuck rows
 * every single night, starving every healthy row behind them indefinitely.
 * Found by Codex on PR #122.
 *
 * Paging past a stuck prefix — rather than stopping at the first
 * `BATCH_SIZE` rows regardless of outcome — fixes the realistic case (some
 * rows broken) at the cost of more requests only on the nights that need
 * them; an ordinary night still stops at `BATCH_SIZE` touched rows well
 * under this ceiling. 3x `BATCH_SIZE` is ~67 minutes worst case, still
 * comfortably inside a default GitHub Actions job timeout. It does not
 * fully solve the pathological case (more rows stuck than this ceiling
 * allows reading past in one night) — that would need a durable per-row
 * retry count, a larger change deliberately not made here.
 */
const MAX_REQUESTS_PER_RUN = BATCH_SIZE * 3;

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
 *
 * Every result also carries `attempts` — 1, or 2 when a 429 forced the one
 * retry this function allows. `MAX_REQUESTS_PER_RUN` is meant to bound the
 * real number of HTTP requests a run makes, not the number of times the
 * main loop happened to call this function; a caller counting the latter
 * as though it were the former would let a persistently rate-limited run
 * spend up to twice the intended requests, each costing up to a full
 * `RATE_LIMIT_WINDOW_MS` wait — silently defeating the ceiling `MAX_
 * REQUESTS_PER_RUN` exists to enforce. Found by Codex on PR #122.
 */
export async function fetchIngredients(barcode, retried = false) {
  const attempts = retried ? 2 : 1;
  let res;
  try {
    // Unbounded otherwise: a stalled connection would hang this row (and
    // everything behind it in the run) until the workflow's own default
    // timeout finally gives up. An abort lands in the catch below like any
    // other network failure, so it's already retryable with no other change.
    res = await fetch(`${OBF}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,ingredients_text`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return { ok: false, permanent: false, reason: `request failed: ${String(err)}`, attempts };
  }

  if (res.status === 429 && !retried) {
    const wait = capDelay(retryAfterMs(res) ?? RATE_LIMIT_WINDOW_MS);
    console.warn(`\n  ! Rate-limited by OBF. Waiting ${Math.ceil(wait / 1000)}s and retrying once.`);
    await sleep(wait);
    // The recursive call's own `attempts` (2, since it passes `retried:
    // true`) is the true total across both requests — passed through
    // as-is, not added to this call's own count.
    return fetchIngredients(barcode, true);
  }

  if (res.status === 404) return { ok: false, permanent: true, reason: "not in OBF any more", attempts };
  if (!res.ok) return { ok: false, permanent: false, reason: `HTTP ${res.status}`, attempts };

  let body;
  try {
    body = await res.json();
  } catch (err) {
    return { ok: false, permanent: false, reason: `unreadable response: ${String(err)}`, attempts };
  }

  if (body?.status === 0) return { ok: false, permanent: true, reason: "not in OBF any more", attempts };
  if (body?.status !== 1 || !body.product) {
    return { ok: false, permanent: false, reason: `unexpected response shape (status ${body?.status})`, attempts };
  }
  return { ok: true, text: (body.product.ingredients_text ?? "").trim(), attempts };
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

/**
 * One page of candidates, oldest `fetched_at` first, starting strictly
 * after `cursor` (or from the very start when `cursor` is null).
 *
 * A plain `.gt("fetched_at", cursor)` would skip rows that share the exact
 * same `fetched_at` as the cursor — not rare here, since a whole import
 * batch can land within the same second. Ordering and cursoring by the
 * pair `(fetched_at, id)` instead means every row is visited exactly once
 * across as many pages as it takes, regardless of ties.
 *
 * `fetched_at` is selected here specifically to build the next cursor —
 * it is deliberately not part of `PRODUCT_COLUMNS` (migration 0008's own
 * comment: the RPC leaves it untouched on write, so it plays no part in
 * `p_product`).
 */
async function fetchCandidatePage(db, pageSize, cursor) {
  let q = db
    .from("products")
    .select(`${PRODUCT_COLUMNS}, fetched_at, product_ingredients ( inci_name, position )`)
    // `expires_at is null` is redundant for source='obf' today — the
    // `cached_sources_must_expire` constraint (0001, widened by 0014)
    // already forbids an obf row from carrying one — kept anyway as cheap
    // insurance against that constraint ever loosening for this source too.
    .eq("source", "obf")
    .is("expires_at", null)
    .order("fetched_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(pageSize);
  if (cursor) {
    q = q.or(`fetched_at.gt.${cursor.fetchedAt},and(fetched_at.eq.${cursor.fetchedAt},id.gt.${cursor.id})`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`products page after ${cursor?.id ?? "start"}: ${error.message}`);
  return data ?? [];
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
  const aliases = await fetchAliases(db);

  console.log(
    `Aiming for ${limit} reconciled row(s) this run, paging past any that can't ` +
      `be read, up to ${MAX_REQUESTS_PER_RUN} requests total.\n`
  );

  let read = 0;
  let touched = 0; // changed + unchanged + gone — never retryable
  let unchanged = 0;
  let changed = 0;
  let gone = 0;
  let retryable = 0;
  let sawAnyCandidate = false;
  const changedSamples = [];
  const retryableSamples = [];
  let cursor = null;

  pages: for (;;) {
    if (touched >= limit || read >= MAX_REQUESTS_PER_RUN) break;
    const page = await fetchCandidatePage(db, Math.min(BATCH_SIZE, MAX_REQUESTS_PER_RUN - read), cursor);
    if (page.length === 0) break; // the whole obf catalogue has been paged through

    for (const row of page) {
      // Advances regardless of outcome — including a barcode-less row we
      // never spend a request on below — so a page never re-fetches rows
      // it has already looked at, even ones that stayed retryable.
      cursor = { fetchedAt: row.fetched_at, id: row.id };
      if (!row.barcode) continue;
      if (touched >= limit || read >= MAX_REQUESTS_PER_RUN) break pages;

      sawAnyCandidate = true;
      if (read > 0) await sleep(READ_INTERVAL_MS);
      const result = await fetchIngredients(row.barcode);
      // A 429 retry inside `fetchIngredients` is a second real HTTP request
      // (and up to another full RATE_LIMIT_WINDOW_MS wait) — `attempts`
      // carries the true count so a persistently rate-limited run still
      // stops at MAX_REQUESTS_PER_RUN actual requests, not double that.
      // Found by Codex on PR #122.
      read += result.attempts;
      process.stdout.write(`\r  read ${read} (touched ${touched}/${limit})`);

      if (!result.ok) {
        if (result.permanent) {
          // Gone from OBF is not proof the product itself vanished — the row
          // stays, exactly as decided in the plan. But it's still a genuine
          // answer as of today, not a failed read, so it's confirmed the same
          // way an unchanged formula is: touch `fetched_at` and move on,
          // rather than re-spending a request on it every single night.
          gone += 1;
          touched += 1;
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

      const fresh = parseInci(result.text, known, undefined, aliases);
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
        touched += 1;
        if (!dryRun) {
          const { error } = await db.from("products").update({ fetched_at: new Date().toISOString() }).eq("id", row.id);
          if (error) throw new Error(`fetched_at touch failed for ${row.id} (unchanged): ${error.message}`);
        }
        continue;
      }

      // Different only because the parser improved since this row was stored:
      // the label did not move, so it is not a reformulation. The cleaned list
      // is still written, or the old junk names would stay on the row for good,
      // but through the RPC's refresh flag and with no explicit timestamp, so
      // `formula_changed_at` is not stamped (migration 0021; see
      // `parserOnlyChange`). Counted as unchanged, since that is what it is.
      if (parserOnlyChange(row.product_ingredients, fresh, known, aliases)) {
        unchanged += 1;
        touched += 1;
        if (!dryRun) {
          const { id, barcode, brand, name, type, area, description, image_url, volume, in_stock, suitable_for, targets, source, attribution, expires_at } =
            row;
          const { error: rpcError } = await db.rpc("replace_product_with_ingredients", {
            p_product: { id, barcode, brand, name, type, area, description, image_url, volume, in_stock, suitable_for, targets, source, attribution, expires_at },
            p_ingredients: fresh,
            p_stub_note: "No published rating for this ingredient yet.",
            p_parser_refresh: true,
          });
          if (rpcError) throw new Error(`replace_product_with_ingredients failed for ${id} (parser refresh): ${rpcError.message}`);
        }
        continue;
      }

      changed += 1;
      touched += 1;
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
  }

  if (!sawAnyCandidate) {
    console.log("\nNothing to reconcile.");
    return;
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

  // If OBF is systematically unavailable, or has changed its response shape,
  // every candidate lands in `retryable` and none of the writes above ever
  // run — but execution would still reach the bookmark below, and the
  // workflow would exit 0 with a fresh `last_run_at`, looking exactly like a
  // healthy night on which nothing needed reconciling. That is precisely the
  // silent-failure mode the bookmark exists to catch (see the doc's own "who
  // is watching the nightly job?" question) — so a run that touched nothing
  // at all must fail loudly rather than record a success it didn't earn.
  // Found by Codex on PR #122.
  if (touched === 0) {
    throw new Error(
      `${retryable} candidate(s) were all retryable and none were reconciled — ` +
        "not recording success. Check the samples above for what's failing."
    );
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
