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
 *
 * With no argument it pulls DEFAULT_SOURCE below — a verbatim mirror of the
 * Commission's "Ingredients and Fragrance Inventory" export, which the CosIng
 * web UI otherwise hands out only through a session-bound download. That mirror
 * is a 2016 snapshot: good enough for the long-established names the taxonomy
 * misses (measured: it supplies 115 of the 466 names our catalogue references
 * but cannot verify), and it will not carry anything newer. Re-run with a fresh
 * export path when one is to hand.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY unless --dry-run.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SOURCE =
  "https://raw.githubusercontent.com/openfoodfacts/openbeautyfacts/develop/cosing/COSING_Ingredients-Fragrance.Inventory_v2.csv";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FILE = args.find((a) => !a.startsWith("--")) ?? DEFAULT_SOURCE;

async function read(source) {
  if (!/^https?:\/\//.test(source)) return readFileSync(source, "utf8");
  const res = await fetch(source);
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

  const byName = new Map();
  let skipped = 0;

  for (const row of rows.slice(headerRow + 1)) {
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

  const parsed = [...byName.values()];
  console.log(
    `${rows.length - headerRow - 1} rows → ${parsed.length} distinct names (${skipped} skipped)`
  );

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!DRY_RUN && (!url || !key)) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run)");
    process.exit(1);
  }

  // Rows already verified by another source are left exactly as they are.
  // A blind upsert would relabel every one of the taxonomy's names as
  // `cosing` and overwrite its functions — losing provenance on ~24,000 rows
  // to add a few hundred. Only genuinely new names, and names currently
  // sitting unverified, are written.
  const existing = new Map();
  if (url && key) {
    const probe = createClient(url, key, { auth: { persistSession: false } });
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await probe
        .from("ingredients")
        .select("inci_name, verified")
        .range(offset, offset + 999);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) existing.set(row.inci_name, row.verified);
      if (!data || data.length < 1000) break;
    }
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
    .filter((i) => existing.get(i.inci_name) === false)
    .map((i) => ({ ...i, note: null }));
  const untouched = parsed.length - fresh.length - promoted.length;
  const ingredients = [...fresh, ...promoted];

  console.log(
    `  ${fresh.length} new, ${promoted.length} promoted from unverified, ${untouched} left alone`
  );

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written. Sample of what would be written:");
    for (const i of ingredients.slice(0, 8)) {
      console.log(`  ${i.inci_name}${i.cas_number ? `  CAS ${i.cas_number}` : ""}`);
    }
    return;
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  for (let i = 0; i < ingredients.length; i += 500) {
    const batch = ingredients.slice(i, i + 500);
    const { error } = await db.from("ingredients").upsert(batch, { onConflict: "inci_name" });
    if (error) throw new Error(error.message);
    process.stdout.write(`\r  ${Math.min(i + 500, ingredients.length)}/${ingredients.length}`);
  }
  console.log(`\nVerified ${ingredients.length} ingredient names.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
