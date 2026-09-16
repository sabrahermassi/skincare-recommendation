/**
 * Import US sunscreens from DailyMed.
 *
 * Step 10 of the data-strategy plan, and the narrowest source on it: US
 * sunscreens only, but authoritative ones. DailyMed is published by the
 * National Library of Medicine, Structured Product Labeling content is a work
 * of the US government and carries no copyright, so these rows are written
 * with `expires_at = null` and are ours outright — the same footing as Open
 * Beauty Facts and unlike the `inci_api` tier, which expires hourly.
 *
 * Why sunscreens specifically: in the US they are regulated as over-the-counter
 * drugs, so every one of them has an SPL with a structured label. That is the
 * whole reason this source exists for a skincare app — there is no DailyMed
 * entry for a moisturiser.
 *
 * Run:
 *   node scripts/import-dailymed.mjs --dry-run      # print what would be written
 *   node scripts/import-dailymed.mjs                # write to Supabase
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, including for --dry-run —
 * same reason as the OBF importer: the plausibility gate judges a parsed
 * formula against the live dictionary, so without it the count a dry run
 * prints is not the count a real run writes.
 *
 * Needs migration 0013 applied. `product_source` has no 'dailymed' value
 * before it, and every write fails on an enum violation.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { parseInci } from "./lib/inci-parse.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const DAILYMED = "https://dailymed.nlm.nih.gov/dailymed/services/v2";
const USER_AGENT = "for.me/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";
const ATTRIBUTION =
  "Label data from DailyMed (U.S. National Library of Medicine), public domain.";

/**
 * How many products one run may write, and the request ceiling it may spend.
 *
 * Smaller than the OBF import's 500 on purpose: this is an addition to a
 * catalogue, not the catalogue itself, and DailyMed costs one request per
 * product — the search returns identity only, so every formula is a second
 * fetch. 200 products is roughly 210 requests.
 *
 * The same cap reasoning applies as everywhere else on this plan: the client
 * still holds the whole catalogue, and `DISK_BUDGET_BYTES` in
 * `data/catalogue-cache.ts` bounds what a device can keep. This must not be
 * the thing that pushes it over.
 */
const TARGET_ROWS = 200;
const MAX_REQUESTS = 400;
const PAGE_SIZE = 50;

/**
 * Gap between DailyMed requests.
 *
 * DailyMed publishes no numeric rate limit — its terms ask for "reasonable"
 * automated use and nothing more specific. With no documented figure to
 * respect, this errs well clear: ~1.3 requests a second is slower than a
 * person clicking through the site and nowhere near anything that could be
 * mistaken for a load test. A full run is then a few minutes, which for a
 * source that publishes daily and an importer run by hand costs nothing worth
 * saving.
 *
 * Contrast with the OBF importer, where the interval is derived from a
 * published 10-requests-per-minute limit rather than chosen.
 */
const REQUEST_INTERVAL_MS = 750;

/** See the same constant in `scripts/import-obf.mjs`. */
const MIN_KNOWN_INGREDIENT_RATIO = 0.6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One page of sunscreen SPL summaries: setid, title, publication date.
 *
 * Identity only — the summary carries no ingredients, which is why each kept
 * product costs a second request below.
 */
async function fetchPage(page) {
  const url = `${DAILYMED}/spls.json?drug_name=sunscreen&pagesize=${PAGE_SIZE}&page=${page}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`DailyMed page ${page} returned ${res.status} ${res.statusText}`);
  const body = await res.json();
  if (!Array.isArray(body.data)) {
    throw new Error(`DailyMed page ${page} returned no data array — the endpoint shape may have changed`);
  }
  return body.data;
}

/**
 * The full label for one SPL, as XML.
 *
 * `.json` on this endpoint answers 415; the XML is the only representation
 * carrying the ingredient list. `packaging.json` has the *active* ingredients
 * structured, but actives are the UV filters alone — the rest of the formula,
 * which is what scoring reads, is only in the label text.
 */
async function fetchLabel(setid) {
  const res = await fetch(`${DAILYMED}/spls/${setid}.xml`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`DailyMed SPL ${setid} returned ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Pull the inactive-ingredient list out of an SPL.
 *
 * Deliberately the free-text label line rather than the structured `<name>`
 * elements elsewhere in the document. Those include active moieties — a zinc
 * oxide sunscreen lists both "ZINC OXIDE" and "ZINC CATION" — and they are not
 * in label order. The printed line is a comma-separated INCI list in
 * descending concentration, which is exactly what `parseInci` expects and what
 * position weighting depends on.
 *
 * The *last* marker, not the first: the document contains an "INACTIVE
 * INGREDIENT SECTION" header before the visible line, and matching the first
 * occurrence captures that header instead of the list.
 *
 * Measured on ten live SPLs: eight yield a comma-separated list. The other two
 * print their ingredients with no separator at all ("Purified Water Aloe
 * Barbadensis Leaf Juice Dicaprylyl Carbonate"), which collapses to a single
 * over-length token and is refused by the gates below. That is the right
 * outcome — there are 5,801 sunscreen SPLs and no reason to guess at
 * boundaries.
 */
function inactiveIngredients(xml) {
  const flat = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const marks = [...flat.matchAll(/inactive\s+ingredients?\b[:\s]*/gi)];
  if (marks.length === 0) return null;

  const last = marks[marks.length - 1];
  const body = flat
    .slice(last.index + last[0].length)
    // Whatever shares the back of the label. Same idea as the boilerplate stop
    // in `parseInci`, for the sections an SPL specifically carries.
    .split(/\b(?:Questions|Package Label|Principal Display|Other information|Purpose|Warnings|Uses|Directions)\b/i)[0]
    .trim();
  return body.length > 0 ? body : null;
}

/**
 * Split an SPL title into the parts we store.
 *
 * DailyMed titles follow one shape: "NAME (ACTIVE INGREDIENTS) DOSAGE FORM
 * [LABELER]". The labeler is the closest thing to a brand — it is the company
 * that registered the product, which for a consumer sunscreen is usually the
 * brand on the bottle and occasionally a contract manufacturer.
 */
function parseTitle(title) {
  const labeler = title.match(/\[([^\]]+)\]\s*$/)?.[1]?.trim() ?? null;
  const withoutLabeler = title.replace(/\s*\[[^\]]+\]\s*$/, "");
  const name = withoutLabeler.replace(/\s*\([^)]*\).*$/, "").trim();
  return { name: name || withoutLabeler.trim(), labeler };
}

/** Title-cased from the shouted form DailyMed publishes. */
function tidy(value) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Spf|Llc|Inc|Ltd|Co|Usa|Uv)\b/g, (w) => w.toUpperCase())
    .trim();
}

/**
 * Build the row, or a string naming why this SPL was rejected.
 *
 * Same contract as `toRow` in `scripts/import-obf.mjs`, including the
 * plausibility gate — the reasoning behind the 0.6 threshold is written up
 * there and applies unchanged: a parsed formula that mostly misses a
 * 36k-name dictionary is not a rare formula, it is a bad parse.
 */
function toRow(spl, xml, known, samples) {
  const { name, labeler } = parseTitle(spl.title ?? "");
  if (!name || !spl.setid) return "no name or setid";

  const inci = inactiveIngredients(xml);
  if (!inci) return "no inactive-ingredient section";

  const ingredients = parseInci(inci);
  if (ingredients.length < 2) return "fewer than 2 parsed ingredients";

  const hits = ingredients.filter((i) => known.has(i.inci_name)).length;
  if (hits / ingredients.length < MIN_KNOWN_INGREDIENT_RATIO) {
    if (samples.length < 5) {
      samples.push(
        `${name} — ${hits}/${ingredients.length} recognised: ` +
          ingredients.slice(0, 6).map((i) => i.inci_name).join(", ")
      );
    }
    return "formula not recognised by the dictionary";
  }

  return {
    product: {
      id: `dailymed-${spl.setid}`,
      // No barcode. DailyMed identifies products by NDC, which is not the
      // EAN/UPC a phone camera reads off a bottle, so claiming one would make
      // these rows look scannable when they are not. They are browsable
      // catalogue depth, not scan targets — `isIdentifiable` in data/api.ts
      // hides only barcode-less *OCR* rows, so these still list.
      barcode: null,
      brand: labeler ? tidy(labeler) : "Unknown",
      name: tidy(name),
      // Every product from this source is a sunscreen by construction — that
      // is the search this importer runs — so there is nothing to guess.
      type: "sunscreen",
      area: "face",
      description: null,
      image_url: null,
      volume: null,
      in_stock: true,
      suitable_for: [],
      targets: [],
      source: "dailymed",
      attribution: ATTRIBUTION,
      expires_at: null,
    },
    ingredients,
  };
}

/** Every verified INCI name — see the same read in `scripts/import-obf.mjs`. */
async function fetchKnownIngredients(db) {
  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name",
    cursorColumn: "inci_name",
    filter: (q) => q.eq("verified", true),
  });
  return new Set(rows.map((r) => r.inci_name.toLowerCase()));
}

/**
 * DailyMed publishes one SPL per labeler per revision, so the same physical
 * product appears many times over — a single sunscreen turned up five times in
 * a ten-row sample. Without this the catalogue fills with duplicates of one
 * bottle.
 *
 * Keyed on brand and name rather than on any identifier, because there is no
 * shared identifier to key on: setid is per-SPL and NDC is per-package.
 */
function identityKey(product) {
  return `${product.brand}|${product.name}`.toLowerCase().replace(/\s+/g, " ");
}

/**
 * The formula itself, as a key.
 *
 * Brand and name are not enough. The same bottle is registered by more than
 * one labeler — a brand and its contract manufacturer both file an SPL — and
 * the names differ while the formula does not. Measured on fifty live labels:
 * "Atlantis Laboratories, INC." and "Sqween LLC" both publish an identical
 * twenty-five ingredient list in identical order.
 *
 * Twenty-five ingredients agreeing in order is not coincidence, and for this
 * app two identical formulas are one answer: scoring reads the formula and
 * nothing else, so a second copy adds a row that can only ever say what the
 * first already said.
 *
 * Order is kept in the key rather than sorted away, because INCI order is
 * concentration order — two products with the same names in a different order
 * are genuinely different products and score differently.
 */
function formulaKey(ingredients) {
  return ingredients.map((i) => i.inci_name).join("|");
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required, including for --dry-run:\n" +
        "the plausibility gate reads the live ingredient dictionary."
    );
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const known = await fetchKnownIngredients(db);
  console.log(`Dictionary: ${known.size} verified ingredient names.\n`);

  const rows = new Map();
  const seenIdentity = new Set();
  const seenFormula = new Set();
  const rejected = new Map();
  const rejectSamples = [];
  let requests = 0;
  let seen = 0;
  // The newest publication date this run saw, kept in DailyMed's own format.
  // `sync_bookmarks.watermark` is text precisely so each source can record
  // whatever "how far we got" means to it — see migration 0012.
  let newestPublished = null;

  page: for (let page = 1; ; page += 1) {
    if (rows.size >= TARGET_ROWS || requests >= MAX_REQUESTS) break;

    if (requests > 0) await sleep(REQUEST_INTERVAL_MS);
    const summaries = await fetchPage(page);
    requests += 1;
    if (summaries.length === 0) break;

    seen += summaries.length;
    let kept = 0;
    let duplicates = 0;

    for (const spl of summaries) {
      if (rows.size >= TARGET_ROWS) break page;
      if (requests >= MAX_REQUESTS) {
        console.warn(`\n  ! Hit the ${MAX_REQUESTS}-request budget. Stopping early.`);
        break page;
      }

      if (typeof spl.published_date === "string") {
        const at = Date.parse(spl.published_date);
        if (!Number.isNaN(at) && (newestPublished === null || at > Date.parse(newestPublished))) {
          newestPublished = spl.published_date;
        }
      }

      // Cheapest rejections first, before spending a request on the label.
      const { name, labeler } = parseTitle(spl.title ?? "");
      if (!name) {
        rejected.set("no name or setid", (rejected.get("no name or setid") ?? 0) + 1);
        continue;
      }
      const identity = identityKey({ brand: labeler ?? "Unknown", name });
      if (seenIdentity.has(identity)) {
        duplicates += 1;
        continue;
      }

      await sleep(REQUEST_INTERVAL_MS);
      const xml = await fetchLabel(spl.setid);
      requests += 1;

      const row = toRow(spl, xml, known, rejectSamples);
      if (typeof row === "string") {
        rejected.set(row, (rejected.get(row) ?? 0) + 1);
        // Recorded either way: a duplicate of something rejected is still not
        // worth another request next page.
        seenIdentity.add(identity);
        continue;
      }

      seenIdentity.add(identity);

      // The second pass at the same question, now that the formula is known.
      // See `formulaKey`: different labelers file the same bottle.
      const formula = formulaKey(row.ingredients);
      if (seenFormula.has(formula)) {
        duplicates += 1;
        continue;
      }
      seenFormula.add(formula);

      rows.set(row.product.id, row);
      kept += 1;
    }

    console.log(
      `  page ${String(page).padStart(2)}  ${String(summaries.length).padStart(3)} found` +
        `  ${String(kept).padStart(3)} new` +
        `  ${String(duplicates).padStart(3)} dup` +
        `  ${String(rows.size).padStart(3)}/${TARGET_ROWS} total`
    );
  }

  const all = [...rows.values()];
  console.log(
    `\n${seen} labels seen over ${requests} request(s), ${all.length} usable, ` +
      `${new Set(all.flatMap((r) => r.ingredients.map((i) => i.inci_name))).size} distinct ingredients`
  );
  for (const [reason, count] of [...rejected.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  rejected ${String(count).padStart(4)}  ${reason}`);
  }
  if (rejectSamples.length > 0) {
    console.log(`\n  Rejected by the dictionary gate (first ${rejectSamples.length}) — these should read as junk:`);
    for (const sample of rejectSamples) console.log(`    ${sample}`);
  }

  // Before the dry-run return, for the same reason as the OBF importer: a
  // preflight that reports an empty import and exits 0 hides exactly the
  // breakage it exists to surface.
  if (all.length === 0) {
    throw new Error(
      `No usable sunscreens found across ${requests} request(s) of ${seen} labels. ` +
        "Check the DailyMed endpoint and the gates above." +
        (DRY_RUN ? "" : " Refusing to record a bookmark.")
    );
  }

  if (DRY_RUN) {
    console.log(`\n--dry-run: would record watermark "${newestPublished ?? "null"}" for source "dailymed".`);
    console.log("--dry-run: nothing written. Sample:");
    for (const r of all.slice(0, 3)) {
      console.log(`  ${r.product.brand} — ${r.product.name}`);
      console.log(`    type=${r.product.type} barcode=none`);
      console.log(`    ${r.ingredients.length} ingredients: ${r.ingredients.slice(0, 5).map((i) => i.inci_name).join(", ")}…`);
    }
    return;
  }

  // One transactional call per product, same as the OBF importer and for the
  // same reason — see issue #40. The RPC creates the ingredient stubs in the
  // same transaction as the formula that needs them, and bumps `fetched_at`.
  let written = 0;
  for (const r of all) {
    const { error } = await db.rpc("replace_product_with_ingredients", {
      p_product: r.product,
      p_ingredients: r.ingredients,
      p_stub_note: "No published rating for this ingredient yet.",
    });
    if (error) {
      throw new Error(
        `replace_product_with_ingredients failed for ${r.product.id} ` +
          `(${written} of ${all.length} already written): ${error.message}` +
          (/invalid input value for enum/.test(error.message)
            ? " — apply migration 0013, which adds 'dailymed' to product_source."
            : "")
      );
    }
    written += 1;
    process.stdout.write(`\r  ${written}/${all.length}`);
  }

  const links = all.reduce((n, r) => n + r.ingredients.length, 0);
  console.log(`\nWrote ${written} products and ${links} ingredient links.`);

  const { error: bookmarkError } = await db.from("sync_bookmarks").upsert(
    {
      source: "dailymed",
      watermark: newestPublished,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "source" }
  );
  if (bookmarkError) throw new Error(`sync_bookmarks upsert failed: ${bookmarkError.message}`);
}

/** See the same guard in `scripts/import-obf.mjs`. */
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

export { inactiveIngredients, parseTitle, tidy, toRow, identityKey, formulaKey };
