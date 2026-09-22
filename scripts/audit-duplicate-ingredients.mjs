/**
 * Find verified dictionary ingredients that look like the same ingredient
 * stored twice, and say whether the two rows disagree.
 *
 * Two kinds of duplicate:
 *
 *   - spelling: names that differ only by case, spaces, hyphens or other
 *     punctuation ("peg-40 stearate" / "peg 40 stearate");
 *   - cas: different names sharing a CAS number, which is a chemical identity.
 *     Some are legitimate (a blend, an extract listed under two names), so a
 *     shared CAS is a lead to read, not proof.
 *
 * A group is a *conflict* when its rows disagree on `safety` or `functions`,
 * because then the app gives a different answer depending on which spelling a
 * label happens to use; when two rows carry CAS numbers that share nothing —
 * a spelling group can collide two real, distinct substances (optical isomers
 * such as "(+)-limonene" / "(-)-limonene" normalise to the same spelling key;
 * their CAS numbers do not); or when a CAS number is on file for some of the
 * group's rows but not all of them — nothing then confirms the ones missing
 * it are the same substance as the ones that have it, rather than another
 * case exactly like the limonene one that simply has not been matched to a
 * CAS number yet. Conflicts are listed first.
 *
 * Read only: it never writes. Reads need `SUPABASE_URL` and
 * `SUPABASE_SERVICE_ROLE_KEY` in the shell.
 *
 *   npm run audit:duplicate-ingredients
 *   npm run audit:duplicate-ingredients -- --limit=200   # list more groups
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { connect } from "./lib/db.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const DEFAULT_LIMIT = 50;

/**
 * A name with case, spacing and punctuation removed, so spellings compare equal.
 * Letters with accents are kept, so names that differ only by one stay apart.
 */
export function nameKey(name) {
  return name.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Every CAS number in a field. CosIng writes blends as several numbers in one
 * cell ("8001-79-4 / 8002-13-9"), so a row can belong to several CAS groups.
 *
 * @param {string | null | undefined} field
 * @returns {string[]}
 */
export function casNumbers(field) {
  return [...new Set((field ?? "").match(/\b\d{2,7}-\d{2}-\d\b/g) ?? [])];
}

/**
 * @typedef {{ inci_name: string, cas_number: string | null, functions: string[] | null, safety: string, source: string }} Row
 * @typedef {{ kind: "spelling" | "cas", key: string, rows: Row[], conflicts: string[] }} Group
 */

/**
 * Whether the rows' CAS numbers actively contradict each other: at least two
 * rows each carry a CAS number, and the two share none. A row with no CAS
 * number says nothing either way, and a shared number in a blend is not a
 * contradiction — only a pair with nothing in common means the two rows name
 * different substances, not the same one spelled two ways.
 *
 * @param {Row[]} rows
 * @returns {boolean}
 */
function casesContradict(rows) {
  const casSets = rows.map((row) => new Set(casNumbers(row.cas_number))).filter((set) => set.size > 0);
  for (let i = 0; i < casSets.length; i++) {
    for (let j = i + 1; j < casSets.length; j++) {
      if ([...casSets[i]].every((cas) => !casSets[j].has(cas))) return true;
    }
  }
  return false;
}

/**
 * Whether the group's CAS coverage is too thin to confirm every row names the
 * same substance: at least one row carries a CAS number and at least one row
 * does not. A group where every row lacks a CAS number says nothing about
 * identity either way, and is not flagged — the spelling match is the only
 * evidence there ever was for those, same as before this check existed.
 *
 * @param {Row[]} rows
 * @returns {boolean}
 */
function casCoverageIncomplete(rows) {
  const withCas = rows.filter((row) => casNumbers(row.cas_number).length > 0).length;
  return withCas > 0 && withCas < rows.length;
}

/**
 * How the rows of one group disagree, as plain sentences. Empty when they agree.
 *
 * @param {Row[]} rows
 * @returns {string[]}
 */
function disagreements(rows) {
  const found = [];

  const safeties = new Set(rows.map((row) => row.safety));
  if (safeties.size > 1) {
    found.push(`safety differs (${rows.map((row) => `${row.inci_name}: ${row.safety}`).join("; ")})`);
  }

  const functionSets = new Set(rows.map((row) => [...(row.functions ?? [])].sort().join(",")));
  if (functionSets.size > 1) {
    found.push(
      `functions differ (${rows.map((row) => `${row.inci_name}: ${(row.functions ?? []).join(", ") || "none"}`).join("; ")})`
    );
  }

  if (casesContradict(rows)) {
    found.push(`CAS numbers contradict (${rows.map((row) => `${row.inci_name}: ${row.cas_number || "none"}`).join("; ")})`);
  } else if (casCoverageIncomplete(rows)) {
    found.push(
      `CAS number on file for some rows but not all, so identity is unconfirmed (${rows
        .map((row) => `${row.inci_name}: ${row.cas_number || "none"}`)
        .join("; ")})`
    );
  }

  return found;
}

/**
 * Group rows that look like the same ingredient. One row can appear in several
 * groups (a spelling group and a CAS group), and each group is reported once.
 *
 * Sorted with conflicts first, then largest group first, then by key, so the
 * output is the same on every run.
 *
 * @param {Row[]} rows
 * @returns {Group[]}
 */
export function findDuplicates(rows) {
  /** @type {Map<string, { kind: "spelling" | "cas", key: string, rows: Map<string, Row> }>} */
  const buckets = new Map();

  const add = (kind, key, row) => {
    if (!key) return;
    const id = `${kind}:${key}`;
    const bucket = buckets.get(id) ?? { kind, key, rows: new Map() };
    bucket.rows.set(row.inci_name, row);
    buckets.set(id, bucket);
  };

  for (const row of rows) {
    add("spelling", nameKey(row.inci_name), row);
    for (const cas of casNumbers(row.cas_number)) add("cas", cas, row);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.rows.size > 1)
    .map((bucket) => {
      const members = [...bucket.rows.values()].sort((a, b) => a.inci_name.localeCompare(b.inci_name));
      return { kind: bucket.kind, key: bucket.key, rows: members, conflicts: disagreements(members) };
    })
    .sort(
      (a, b) =>
        Number(b.conflicts.length > 0) - Number(a.conflicts.length > 0) ||
        b.rows.length - a.rows.length ||
        a.kind.localeCompare(b.kind) ||
        a.key.localeCompare(b.key)
    );
}

/** @param {Group} group */
function describe(group) {
  const label = group.kind === "cas" ? `CAS ${group.key}` : "same name, different spelling";
  const lines = [`- ${label}`, ...group.rows.map((row) => `    ${row.inci_name}  [${row.source}, ${row.safety}]`)];
  for (const conflict of group.conflicts) lines.push(`    ! ${conflict}`);
  return lines.join("\n");
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a whole number, 1 or more.");

  const { db } = connect({ write: false });
  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name,cas_number,functions,safety,source",
    cursorColumn: "inci_name",
    filter: (query) => query.eq("verified", true),
  });
  console.log(`Read ${rows.length} verified ingredient names.`);

  const groups = findDuplicates(rows);
  const conflicts = groups.filter((group) => group.conflicts.length > 0);
  const bySpelling = groups.filter((group) => group.kind === "spelling").length;

  console.log(
    `${groups.length} possible duplicate group(s): ${bySpelling} by spelling, ${groups.length - bySpelling} by CAS number; ` +
      `${conflicts.length} disagree on safety, functions, or CAS number.`
  );

  for (const group of groups.slice(0, limit)) console.log(`\n${describe(group)}`);
  if (groups.length > limit) console.log(`\n… ${groups.length - limit} more; pass --limit=${groups.length} to list them all.`);
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
