/**
 * One-off import: EU CosIng → the ingredient dictionary.
 *
 * This is the script that makes `ingredients.verified` mean something. CosIng
 * is the European Commission's official glossary (~15,000 INCI names, CC BY
 * 4.0), so a name that matches it is a real ingredient and a name that doesn't
 * is something we parsed off a mangled label. Everything the UI does with
 * `verified` depends on this having been run.
 *
 * The CSV is behind the CosIng web UI rather than a stable download URL, so
 * this takes a local file instead of guessing an endpoint:
 *
 *   1. Download the Annex/glossary export (csv) from
 *      https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database_en
 *   2. node scripts/import-cosing.mjs ./cosing.csv --dry-run
 *   3. node scripts/import-cosing.mjs ./cosing.csv
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY unless --dry-run.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FILE = args.find((a) => !a.startsWith("--"));

if (!FILE) {
  console.error("Usage: node scripts/import-cosing.mjs <cosing.csv> [--dry-run]");
  process.exit(1);
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

/** Same normalisation the parser uses, so the two sides can actually match. */
function normalise(raw) {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/g, "");
}

/** Column names drift between CosIng exports, so match on intent, not index. */
function findColumn(header, ...patterns) {
  for (const pattern of patterns) {
    const i = header.findIndex((h) => pattern.test(h.trim()));
    if (i !== -1) return i;
  }
  return -1;
}

function main() {
  const rows = parseCsv(readFileSync(FILE, "utf8"));
  if (rows.length < 2) {
    console.error("No data rows found — is this the right file?");
    process.exit(1);
  }

  const header = rows[0];
  const iName = findColumn(header, /^inci\s*name/i, /^ingredient/i, /^name/i);
  const iCas = findColumn(header, /cas/i);
  const iFunction = findColumn(header, /function/i);

  if (iName === -1) {
    console.error(`Could not find an INCI name column. Header was:\n  ${header.join(" | ")}`);
    process.exit(1);
  }
  console.log(
    `Columns: name=${header[iName]}` +
      (iCas !== -1 ? `, cas=${header[iCas]}` : ", cas=(absent)") +
      (iFunction !== -1 ? `, function=${header[iFunction]}` : ", function=(absent)")
  );

  const byName = new Map();
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const name = normalise(row[iName] ?? "");
    if (name.length < 2) {
      skipped += 1;
      continue;
    }
    byName.set(name, {
      inci_name: name,
      cas_number: iCas !== -1 ? (row[iCas] ?? "").trim() || null : null,
      functions:
        iFunction !== -1
          ? (row[iFunction] ?? "")
              .split(/[,/]/)
              .map((f) => f.trim().toLowerCase())
              .filter(Boolean)
          : [],
      source: "cosing",
      // The whole point of this import.
      verified: true,
      // Deliberately not setting `safety` or `comedogenic`: CosIng is a
      // glossary and a regulatory annex list, not a hazard rating. Inventing
      // one here would be fabricating the exact data the app is judged on.
    });
  }

  const ingredients = [...byName.values()];
  console.log(`${rows.length - 1} rows → ${ingredients.length} distinct names (${skipped} skipped)`);

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written. Sample:");
    for (const i of ingredients.slice(0, 5)) {
      console.log(`  ${i.inci_name}${i.cas_number ? `  CAS ${i.cas_number}` : ""}`);
    }
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run)");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  return (async () => {
    for (let i = 0; i < ingredients.length; i += 500) {
      const batch = ingredients.slice(i, i + 500);
      // Upsert rather than insert: names already created unverified by a
      // barcode lookup get promoted to verified in place, which is exactly the
      // transition this table exists to record.
      const { error } = await db.from("ingredients").upsert(batch, { onConflict: "inci_name" });
      if (error) throw new Error(error.message);
      process.stdout.write(`\r  ${Math.min(i + 500, ingredients.length)}/${ingredients.length}`);
    }
    console.log(`\nVerified ${ingredients.length} ingredient names.`);
  })();
}

Promise.resolve(main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
