/**
 * One-off import: EU CosIng → the ingredient dictionary.
 *
 * This is the script that makes `ingredients.verified` mean something. CosIng
 * is the European Commission's official glossary (~15,000 INCI names, CC BY
 * 4.0), so a name that matches it is a real ingredient and a name that doesn't
 * is something we parsed off a mangled label. Everything the UI does with
 * `verified` depends on this having been run.
 *
 * Takes a local path or an https URL:
 *
 *   node scripts/import-cosing.mjs --dry-run
 *   node scripts/import-cosing.mjs
 *   node scripts/import-cosing.mjs ./some-other-export.csv
 *   node scripts/import-cosing.mjs --prune
 *
 * --prune also clears the shortened spellings the old naming rule wrote for
 * this file and this one does not: deleted if no product uses them, returned to
 * unverified if one does. A name that is merely missing from this file is never
 * touched — exports differ, and another one may have written it.
 *
 * Every run, --dry-run and a local CSV included, also downloads the Open Beauty
 * Facts taxonomy (~12 MB), only to learn which shortened label spellings
 * several ingredients share (see `toIngredients`). For a run with no network,
 * point it at a saved copy:
 *
 *   node scripts/import-cosing.mjs ./export.csv --taxonomy=./ingredients.json
 *
 * With no argument it pulls DEFAULT_SOURCE below — a verbatim mirror of the
 * Commission's "Ingredients and Fragrance Inventory" export, which the CosIng
 * web UI otherwise hands out only through a session-bound download. That mirror
 * is a 2016 snapshot: good enough for the long-established names the taxonomy
 * misses (measured: it supplies 115 of the 466 names our catalogue references
 * but cannot verify), and it will not carry anything newer. Re-run with a fresh
 * export path when one is to hand.
 *
 * Pinned to commit 7497cea8a8a90687d2e5175e9ecb46b7ca75a60b rather than the
 * mutable `develop` branch — verified against that exact revision: "File
 * creation date: 20/02/2016", "Last update: 15/02/2016", same header row this
 * script expects. Update the SHA (and the note above) if a fresher export is
 * ever adopted.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY unless --dry-run, and
 * SUPABASE_ENV=staging or production for the write — production also requires
 * --prod on the command line.
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fetchTaxonomy, normaliseDictionaryName, sharedLabelForms } from "./import-inci-dictionary.mjs";
import { connect } from "./lib/db.mjs";
import { fetchHttps } from "./lib/fetch-https.mjs";
import { parseFunctions } from "./lib/normalise-function.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";
import { applyPrune, assertNotTooMany, planPruneAgainst } from "./lib/prune-stale.mjs";

const DEFAULT_SOURCE =
  "https://raw.githubusercontent.com/openfoodfacts/openbeautyfacts/7497cea8a8a90687d2e5175e9ecb46b7ca75a60b/cosing/COSING_Ingredients-Fragrance.Inventory_v2.csv";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PRUNE = args.includes("--prune");
const FILE = args.find((a) => !a.startsWith("--")) ?? DEFAULT_SOURCE;
const TAXONOMY_FILE = args.find((a) => a.startsWith("--taxonomy="))?.slice("--taxonomy=".length);

async function read(source) {
  if (!/^https?:\/\//.test(source)) return readFileSync(source, "utf8");
  // A network attacker who can intercept a plain-http fetch (or any redirect
  // hop that passes through one) could substitute the CSV that gets upserted
  // into `ingredients`. `fetchHttps` refuses anything that isn't HTTPS start
  // to finish.
  const res = await fetchHttps(source);
  if (!res.ok) throw new Error(`${source} → HTTP ${res.status}`);
  return res.text();
}

/**
 * Minimal RFC-4180 reader. CosIng exports contain quoted fields with embedded
 * commas ("Origin/Definition" runs to whole sentences), so splitting on commas
 * silently corrupts the columns.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Same normalisation the label parser uses. Only for the label spellings in
 * `toIngredients`: it is what a scanned label's text becomes, so it is how a
 * label will ask for a row. The dictionary name itself keeps its brackets.
 */
function normalise(raw) {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9\p{L}]+|[^a-z0-9)\p{L}]+$/gu, "");
}

/** Column names drift between CosIng exports, so match on intent, not index. */
function findColumn(header, ...patterns) {
  for (const pattern of patterns) {
    const i = header.findIndex((h) => pattern.test(h.trim()));
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * `records` are `{ name, cas, functions }` as printed in the export. Official
 * names keep their bracketed chemistry: dropping it filed fourteen different
 * POLY(…) ingredients under the one false name "poly".
 *
 * `sharedElsewhere` are shortened spellings several Open Beauty Facts
 * ingredients read as. This export is a 2016 snapshot, so a spelling only one
 * of its ingredients has can still be shared in the newer, larger list.
 */
function toIngredients(records, sharedElsewhere = new Set()) {
  const byName = new Map();
  const labelForms = new Map(); // what a scanned label would ask for → the names that read that way
  const oldRuleNames = new Set(); // what the label parser's rule made of every name here
  let skipped = 0;

  for (const record of records) {
    const raw = record.name ?? "";
    const oldName = normalise(raw);
    if (oldName.length >= 2) oldRuleNames.add(oldName);

    const name = normaliseDictionaryName(raw);
    if (name.length < 2) {
      skipped += 1;
      continue;
    }
    byName.set(name, {
      inci_name: name,
      cas_number: (record.cas ?? "").trim() || null,
      functions: parseFunctions(record.functions),
      source: "cosing",
      // The whole point of this import.
      verified: true,
      // Deliberately not setting `safety` or `comedogenic`: CosIng is a
      // glossary and a regulatory annex list, not a hazard rating. Inventing
      // one here would be fabricating the exact data the app is judged on.
    });
    if (raw.includes("(") && oldName.length >= 2) {
      labelForms.set(oldName, (labelForms.get(oldName) ?? new Set()).add(name));
    }
  }

  // The label parser drops bracketed text, so a label asks for the shortened
  // spelling. It gets a row only when one ingredient alone reads that way.
  for (const [form, owners] of labelForms) {
    if (owners.size !== 1 || byName.has(form) || sharedElsewhere.has(form)) continue;
    const [owner] = owners;
    byName.set(form, { ...byName.get(owner), inci_name: form });
  }

  // Every name the old rule wrote for this file that this one does not: the
  // shortened spellings, and names with a stray bracket. They are all --prune
  // may clear: a name merely missing from this file was written from a
  // different export, and is still a real ingredient.
  const retired = new Set([...oldRuleNames].filter((name) => !byName.has(name)));

  return { parsed: [...byName.values()], retired, skipped };
}

async function main() {
  const rows = parseCsv(await read(FILE));
  if (rows.length < 2) {
    console.error("No data rows found — is this the right file?");
    process.exit(1);
  }

  // The export opens with an Excel `sep=,` directive, a creation date and a
  // title row, all before the real header. Patterns are tried strictest-first
  // across the early rows, because the loose ones match the title too —
  // "Ingredients/Fragrance Inventory (CosIng 2)" satisfies /^ingredient/ and
  // would silently make column 0 (the CosIng reference number) the name.
  const NAME_PATTERNS = [/^inci\s*name$/i, /^inci\s*name/i, /^ingredient$/i, /^name$/i];
  let headerRow = -1;
  let iName = -1;
  outer: for (const pattern of NAME_PATTERNS) {
    for (let r = 0; r < Math.min(rows.length, 30); r++) {
      const i = rows[r].findIndex((h) => pattern.test(h.trim()));
      if (i !== -1) {
        headerRow = r;
        iName = i;
        break outer;
      }
    }
  }

  if (iName === -1) {
    console.error(
      `Could not find an INCI name column in the first rows:\n  ${rows
        .slice(0, 10)
        .map((r) => r.join(" | "))
        .join("\n  ")}`
    );
    process.exit(1);
  }

  const header = rows[headerRow];
  const iCas = findColumn(header, /cas/i);
  const iFunction = findColumn(header, /function/i);
  console.log(
    `Columns: name=${header[iName]}` +
      (iCas !== -1 ? `, cas=${header[iCas]}` : ", cas=(absent)") +
      (iFunction !== -1 ? `, function=${header[iFunction]}` : ", function=(absent)")
  );

  const { parsed, retired, skipped } = toIngredients(
    rows.slice(headerRow + 1).map((row) => ({
      name: row[iName] ?? "",
      cas: iCas !== -1 ? row[iCas] : null,
      functions: iFunction !== -1 ? row[iFunction] : null,
    })),
    // A failed download stops the run: writing without it would verify the
    // shared spellings this list exists to keep out.
    sharedLabelForms(await fetchTaxonomy(TAXONOMY_FILE))
  );
  console.log(
    `${rows.length - headerRow - 1} rows → ${parsed.length} distinct names (${skipped} skipped)`
  );

  // One client for both uses below: the probe that reads what is already
  // there, and the upsert that writes. A dry run is still allowed to run with
  // no credentials at all — it then compares against nothing (see below) — so
  // the connection is only made when there is something to connect to, or when
  // this run writes and `connect` must refuse it.
  const haveCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const db = haveCredentials || !DRY_RUN ? connect({ write: !DRY_RUN }).db : null;

  // Rows already verified by another source are left exactly as they are.
  // A blind upsert would relabel every one of the taxonomy's names as
  // `cosing` and overwrite its functions — losing provenance on ~24,000 rows
  // to add a few hundred. Only genuinely new names, names currently sitting
  // unverified, and rows this import wrote itself are written.
  const existing = new Map();
  if (db) {
    const rows = await paginateOrdered(db, "ingredients", {
      select: "inci_name, verified, source",
      cursorColumn: "inci_name",
    });
    for (const row of rows) existing.set(row.inci_name, row);
  }

  if (existing.size === 0) {
    console.log(
      "  (no credentials — cannot compare against the live table, so every name below reads as new)"
    );
  }

  const fresh = parsed.filter((i) => !existing.has(i.inci_name));
  // A promoted row still carries the note its scan wrote — "Read from a label,
  // not matched to the ingredient dictionary" — which becomes false the moment
  // CosIng verifies it. Clear it rather than leave the row contradicting itself.
  const promoted = parsed
    .filter((i) => existing.get(i.inci_name)?.verified === false)
    .map((i) => ({ ...i, note: null }));
  // Its own rows are rewritten so a fix to how functions are read reaches rows
  // already stored — "not reported" was once kept as if it were a function.
  // The row carries no `safety` or `note`, so neither is touched.
  const refreshed = parsed.filter((i) => {
    const current = existing.get(i.inci_name);
    return current?.verified === true && current.source === "cosing";
  });
  const untouched = parsed.length - fresh.length - promoted.length - refreshed.length;
  // Refreshed rows go last and the batches below never mix the two shapes: a
  // bulk upsert sends every column any row in the batch has, so a refreshed
  // row sharing a batch with a promoted one would have its note cleared too.
  const ingredients = [...fresh, ...promoted, ...refreshed];
  const firstRefreshed = fresh.length + promoted.length;

  console.log(
    `  ${fresh.length} new, ${promoted.length} promoted from unverified, ` +
      `${refreshed.length} CosIng rows refreshed, ${untouched} left alone`
  );

  let prune = null;
  if (db) {
    prune = await planPruneAgainst(db, parsed, existing, "cosing", retired);
    console.log(
      `  ${prune.stale.length} name(s) the old naming rule wrote are no longer produced: ` +
        `${prune.remove.length} unused, ${prune.demote.length} still used by a product` +
        (PRUNE ? "" : " (pass --prune to clear them)")
    );
    for (const name of prune.demote.slice(0, 20)) console.log(`    still used: ${name}`);
    if (PRUNE) assertNotTooMany(prune, "CosIng");
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written. Sample of what would be written:");
    for (const i of ingredients.slice(0, 8)) {
      console.log(`  ${i.inci_name}${i.cas_number ? `  CAS ${i.cas_number}` : ""}`);
    }
    return;
  }

  for (const [from, to] of [[0, firstRefreshed], [firstRefreshed, ingredients.length]]) {
    for (let i = from; i < to; i += 500) {
      const batch = ingredients.slice(i, Math.min(i + 500, to));
      const { error } = await db.from("ingredients").upsert(batch, { onConflict: "inci_name" });
      if (error) throw new Error(error.message);
      process.stdout.write(`\r  ${Math.min(i + 500, to)}/${ingredients.length}`);
    }
  }
  console.log(`\nVerified ${ingredients.length} ingredient names.`);

  if (!PRUNE) return;
  const { removed, demoted } = await applyPrune(db, prune, "cosing");
  console.log(`Pruned: ${removed} deleted, ${demoted} returned to unverified.`);
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

export { toIngredients };

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
