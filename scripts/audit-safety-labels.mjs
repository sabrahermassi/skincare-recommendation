/**
 * Check that the `safety` label on every verified dictionary ingredient can be
 * traced to something.
 *
 * The only regulator-backed ratings in the dictionary are the EU annex ones the
 * importers write: Annex II (prohibited) is `avoid`, Annex III (restricted) is
 * `caution`, and the row's `note` carries the annex text. Every other row is
 * `safe` by column default, which says "no annex lists this", not "someone
 * judged this safe". This script reports, read only:
 *
 *   - how many `safe` labels are only that default, per source;
 *   - rows whose label disagrees with the annex citation in their own note
 *     (re-derived with the importer's own `safetyFrom`), so a stored label the
 *     current rule would not produce is found;
 *   - `avoid` / `caution` rows with no note, a warning shown with no reason.
 *
 * Reads need `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the shell.
 *
 *   npm run audit:safety-labels
 *   npm run audit:safety-labels -- --limit=200   # list more rows per problem
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { safetyFrom } from "./import-inci-dictionary.mjs";
import { connect } from "./lib/db.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const DEFAULT_LIMIT = 25;

// The four shapes `safetyFrom` writes into `note`; the annex text is what it was given.
// The refined-grade exemption (`safetyFor`, #354, #361) writes a fifth on purpose,
// which this doesn't match: its `safe` would otherwise read as disagreeing with its ban.
const ANNEX_NOTE =
  /^(?:(?:Prohibited in cosmetics|Prohibited for some uses, allowed for others|Restricted use) \(EU Annex ([\s\S]*)\)|EU Annex ([\s\S]*))$/;

/**
 * The annex text a note cites, or null when the note cites none.
 *
 * @param {string | null | undefined} note
 * @returns {string | null}
 */
export function annexCited(note) {
  const match = ANNEX_NOTE.exec(note ?? "");
  return match ? (match[1] ?? match[2]).trim() || null : null;
}

/**
 * @typedef {{ inci_name: string, safety: string, note: string | null, source: string }} Row
 * @typedef {{ inci_name: string, source: string, stored: string, expected: string, note: string }} Mismatch
 */

/**
 * @param {Row[]} rows verified rows only
 * @returns {{
 *   total: number,
 *   bySafety: Record<string, number>,
 *   defaultSafe: Record<string, number>,
 *   mismatches: Mismatch[],
 *   unexplained: Row[],
 * }}
 */
export function checkSafetyLabels(rows) {
  const bySafety = {};
  const defaultSafe = {};
  const mismatches = [];
  const unexplained = [];

  for (const row of rows) {
    bySafety[row.safety] = (bySafety[row.safety] ?? 0) + 1;

    if (row.safety === "safe" && !row.note) {
      defaultSafe[row.source] = (defaultSafe[row.source] ?? 0) + 1;
    }

    const cited = annexCited(row.note);
    if (cited) {
      const expected = safetyFrom(cited).safety;
      if (expected !== row.safety) {
        mismatches.push({
          inci_name: row.inci_name,
          source: row.source,
          stored: row.safety,
          expected,
          note: /** @type {string} */ (row.note),
        });
      }
    } else if (row.safety !== "safe" && !row.note) {
      unexplained.push(row);
    }
  }

  const byName = (a, b) => a.inci_name.localeCompare(b.inci_name);
  return { total: rows.length, bySafety, defaultSafe, mismatches: mismatches.sort(byName), unexplained: unexplained.sort(byName) };
}

function listSome(title, items, limit, line) {
  console.log(`\n${title}`);
  for (const item of items.slice(0, limit)) console.log(`  ${line(item)}`);
  if (items.length > limit) console.log(`  … ${items.length - limit} more; pass --limit=${items.length} to list them all.`);
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a whole number, 1 or more.");

  const { db } = connect({ write: false });
  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name,safety,note,source",
    cursorColumn: "inci_name",
    filter: (query) => query.eq("verified", true),
  });

  const result = checkSafetyLabels(rows);
  const counts = Object.entries(result.bySafety)
    .map(([level, n]) => `${n} ${level}`)
    .join(", ");
  console.log(`Read ${result.total} verified ingredient names: ${counts}.`);

  const defaults = Object.entries(result.defaultSafe).sort((a, b) => b[1] - a[1]);
  const defaultTotal = defaults.reduce((sum, [, n]) => sum + n, 0);
  console.log(
    `${defaultTotal} "safe" labels are only the default (no annex lists them, no note): ` +
      (defaults.map(([source, n]) => `${n} ${source}`).join(", ") || "none") +
      "."
  );

  console.log(`${result.mismatches.length} label(s) disagree with their own annex citation.`);
  console.log(`${result.unexplained.length} avoid/caution label(s) have no note.`);

  listSome("Label disagrees with its annex citation:", result.mismatches, limit, (m) =>
    `${m.inci_name}  [${m.source}] stored ${m.stored}, the citation gives ${m.expected}: ${m.note}`
  );
  listSome("Warning with no reason attached:", result.unexplained, limit, (r) => `${r.inci_name}  [${r.source}, ${r.safety}]`);
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

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
