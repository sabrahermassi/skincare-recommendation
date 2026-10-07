/**
 * Reads Annex II and Annex III of the consolidated Regulation (EC) No 1223/2009 from the EU
 * Publications Office, and writes them to `regulatory_entries` (#455 parsed the text, #456 stores it).
 *
 *   npm run import:eu-annexes                        # fetch the newest text; print counts and the diff. Writes nothing, needs no database.
 *   npm run import:eu-annexes -- --apply             # ...and write .eu-annexes.json, then the entries to the database
 *   npm run import:eu-annexes -- --file ./saved.xhtml [--apply]
 *   npm run import:eu-annexes -- --out ./elsewhere.json
 *
 * `--apply` goes through `connect({ write })` in `scripts/lib/db.mjs`, so the write needs the
 * environment declared (`SUPABASE_ENV=staging`, and for production also `--prod`). It upserts only the
 * rows that differ from the table, so a second run of the same text writes nothing; an entry the new
 * text no longer lists is marked `deleted` and kept. It never touches `ingredients`, so the
 * dictionary's `updated_at` does not move.
 *
 * How it finds the text. EUR-Lex answers a script with an empty HTTP 202, so the same text is read
 * from the Publications Office instead: its SPARQL service names the newest consolidated version of
 * CELEX 02009R1223 (today 02009R1223-20260518), and that version's cellar id is fetched as XHTML.
 * The file's SHA-256, the version and the URL are written beside the entries, so a later run can say
 * exactly what changed and from which text.
 *
 * Nothing is written when anything looks wrong: a failed fetch, an empty or wrong file, a version
 * that disagrees with the one SPARQL named, rows that are not all accounted for, fewer entries than
 * the floor, or a sharp drop against the file already stored. The run stops with the reason and the
 * stored file is left alone.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { connect } from "./lib/db.mjs";
import { parseAnnexes } from "./lib/eu-annex-parse.mjs";

export const CELEX_BASE = "02009R1223";
export const SPARQL_URL = "https://publications.europa.eu/webapi/rdf/sparql";
export const CELLAR_URL = "https://publications.europa.eu/resource/cellar";
export const DEFAULT_OUT = ".eu-annexes.json";

/**
 * The credit line this assumes for the text it reads. The owner confirms the reuse terms of EUR-Lex
 * text (decided 7 October 2026); until then this is an assumption, not a finding: the EU's EUR-Lex
 * notice asks for the source to be named, and the consolidated text says of itself that it is "a
 * documentation tool with no legal effect", with the Official Journal as the authentic text.
 */
export const ATTRIBUTION =
  "Source: EUR-Lex, consolidated text of Regulation (EC) No 1223/2009 on cosmetic products (CELEX {celex}), " +
  "© European Union, https://eur-lex.europa.eu/, 1998-{year}. A documentation tool with no legal effect: only the " +
  "Official Journal text is authentic.";

/** An import with fewer entries than this has read the wrong thing (the 18 May 2026 text has 1,762 and 379). */
export const MIN_ENTRIES = { II: 1500, III: 300 };
/** A new run with fewer than this share of the stored entries is refused: a real amendment adds and moves a few. */
export const MAX_DROP = 0.9;

const SPARQL = `
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT ?w ?celex WHERE {
  ?w cdm:resource_legal_id_celex ?celex .
  FILTER(STRSTARTS(STR(?celex), "${CELEX_BASE}-"))
} ORDER BY DESC(?celex) LIMIT 20`;

/**
 * The newest consolidated version in a SPARQL answer that already applies: the one whose CELEX
 * (`02009R1223-20260518`) ends in the latest date on or before `asOf`. That date is the day the
 * version's last amendment applies, and the Publications Office can publish a version before it, so
 * the highest date alone may be a text that is not law yet. Such versions come back in `upcoming`,
 * soonest first, and are never chosen.
 *
 * @param {{ results?: { bindings?: { w?: { value?: string }, celex?: { value?: string } }[] } }} answer
 * @param {string} [asOf] A `YYYY-MM-DD` day; today in UTC when left out.
 * @returns {{ celex: string, cellarId: string, consolidatedOn: string, upcoming: string[] }}
 */
export function newestVersion(answer, asOf = new Date().toISOString().slice(0, 10)) {
  const cutoff = asOf.replaceAll("-", "");
  const found = (answer?.results?.bindings ?? [])
    .map((b) => ({ celex: b.celex?.value ?? "", uri: b.w?.value ?? "" }))
    .filter((v) => new RegExp(`^${CELEX_BASE}-\\d{8}$`).test(v.celex) && /\/cellar\/[0-9a-f-]{36}$/.test(v.uri))
    .sort((a, b) => b.celex.localeCompare(a.celex));
  if (found.length === 0) throw new Error(`The Publications Office named no consolidated version of CELEX ${CELEX_BASE}.`);
  const inForce = found.filter((v) => v.celex.slice(-8) <= cutoff);
  const upcoming = found.filter((v) => v.celex.slice(-8) > cutoff).map((v) => v.celex).reverse();
  if (inForce.length === 0) throw new Error(`Every consolidated version of CELEX ${CELEX_BASE} the Publications Office named applies after ${asOf}.`);
  const [{ celex, uri }] = inForce;
  const date = celex.slice(-8);
  return { celex, cellarId: uri.split("/").pop(), consolidatedOn: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`, upcoming };
}

/**
 * Where a redirect goes next. The Publications Office answers a cellar id with a 303 to an
 * `http://publications.europa.eu/...` address; the same address over https is fetched instead. Only
 * that host is upgraded, and only ever to https: nothing is ever fetched over plain http, and no
 * redirect to another host is followed on trust.
 *
 * @param {string} from The URL that was fetched.
 * @param {string} location The redirect's target.
 */
export function nextHop(from, location) {
  const target = new URL(location, from);
  if (target.protocol === "http:" && target.hostname === "publications.europa.eu") target.protocol = "https:";
  if (target.protocol !== "https:" || target.hostname !== "publications.europa.eu") {
    throw new Error(`refusing to follow a redirect to ${target.href}`);
  }
  return target.href;
}

async function fetchOffice(url, headers) {
  let current = url;
  for (let hop = 0; hop <= 5; hop += 1) {
    const res = await fetch(current, { redirect: "manual", headers });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    current = nextHop(current, location);
  }
  throw new Error(`more than 5 redirects from ${url}`);
}

async function fetchLatest() {
  const asked = await fetchOffice(`${SPARQL_URL}?query=${encodeURIComponent(SPARQL)}`, { Accept: "application/sparql-results+json" });
  if (!asked.ok) throw new Error(`The Publications Office SPARQL service answered ${asked.status}.`);
  const version = newestVersion(await asked.json());
  for (const celex of version.upcoming) console.log(`Not in force yet, skipped: ${celex} (applies from ${celex.slice(-8, -4)}-${celex.slice(-4, -2)}-${celex.slice(-2)}).`);
  const url = `${CELLAR_URL}/${version.cellarId}`;
  const res = await fetchOffice(url, { Accept: "application/xhtml+xml", "Accept-Language": "eng" });
  if (!res.ok) throw new Error(`The text of ${version.celex} answered ${res.status} (${url}).`);
  return { xhtml: await res.text(), version, url };
}

/** What the output file holds for one entry, keyed so two runs can be compared. */
const keyOf = (entry) => `${entry.annex}:${entry.entry}`;

/**
 * Entries added, removed and changed between two runs.
 *
 * @param {{ annex: string, entry: string }[]} before
 * @param {{ annex: string, entry: string }[]} after
 */
export function diffEntries(before, after) {
  const was = new Map(before.map((e) => [keyOf(e), JSON.stringify(e)]));
  const now = new Map(after.map((e) => [keyOf(e), JSON.stringify(e)]));
  return {
    added: [...now.keys()].filter((k) => !was.has(k)),
    removed: [...was.keys()].filter((k) => !now.has(k)),
    changed: [...now.keys()].filter((k) => was.has(k) && was.get(k) !== now.get(k)),
  };
}

/**
 * Stops the run, with the reason, when what was read cannot be trusted. Throws; changes nothing.
 *
 * @param {ReturnType<typeof parseAnnexes>} parsed
 * @param {{ celex?: string, consolidatedOn?: string } | null} expected The version SPARQL named, when it was asked.
 * @param {{ annex: string }[] | null} stored The entries already on disk, if any.
 */
export function assertTrustworthy(parsed, expected, stored) {
  if (!parsed.version || parsed.version.celex !== CELEX_BASE) {
    throw new Error(`The file is not the consolidated text of ${CELEX_BASE} (its header says ${parsed.version?.celex ?? "nothing"}).`);
  }
  if (expected?.consolidatedOn && parsed.version.consolidatedOn !== expected.consolidatedOn) {
    throw new Error(`The file says it is the text of ${parsed.version.consolidatedOn}, but the Publications Office named ${expected.celex} (${expected.consolidatedOn}).`);
  }
  const unaccounted = parsed.warnings.filter((w) => /not accounted for/.test(w));
  if (unaccounted.length > 0) throw new Error(`Table rows were lost in parsing: ${unaccounted.join("; ")}`);
  for (const annex of /** @type {const} */ (["II", "III"])) {
    const count = parsed.entries.filter((e) => e.annex === annex).length;
    if (count < MIN_ENTRIES[annex]) {
      throw new Error(`Annex ${annex} came out with ${count} entries, fewer than the ${MIN_ENTRIES[annex]} any real text has. Nothing was written.`);
    }
    const before = stored?.filter((e) => e.annex === annex).length ?? 0;
    if (before > 0 && count < before * MAX_DROP) {
      throw new Error(`Annex ${annex} has ${count} entries, down from ${before} in the stored file (more than ${Math.round((1 - MAX_DROP) * 100)}% fewer). Nothing was written.`);
    }
  }
}

/** The file written by `--apply`. */
export function toDocument(parsed, source) {
  return {
    source: { ...source, attribution: ATTRIBUTION.replace("{celex}", source.celex).replace("{year}", String(new Date().getUTCFullYear())) },
    version: parsed.version,
    stats: parsed.stats,
    missingNumbers: parsed.missingNumbers,
    warnings: parsed.warnings,
    amendments: parsed.amendments,
    entries: parsed.entries,
  };
}

/** What a stored row is compared on: every column the importer writes (not `updated_at`, which the table's trigger owns). */
const ROW_FIELDS = ["wording", "inci_name", "cas_numbers", "ec_numbers", "conditions", "members", "mark", "amended_by", "effective_date", "source_url", "source_version", "source_hash", "last_verified", "status"];
const PAGE = 1000;
const CHUNK = 400;

/**
 * One parsed entry as a `regulatory_entries` row. "moved-or-deleted" and "blank" (a number the regulation
 * prints with nothing beside it) are both `deleted`: neither is a rule in force.
 *
 * @param {import("./lib/eu-annex-parse.mjs").AnnexEntry} entry
 * @param {{ celex: string, url?: string, sha256: string }} source
 * @param {string} consolidatedOn the date of the consolidated text, "2026-05-18"
 */
export function toRow(entry, source, consolidatedOn) {
  return {
    annex: entry.annex,
    entry: entry.entry,
    wording: entry.name ?? "",
    inci_name: entry.inciName ?? null,
    cas_numbers: entry.cas ?? [],
    ec_numbers: entry.ec ?? [],
    conditions: entry.annex === "III" && entry.conditions.length > 0 ? entry.conditions : null,
    members: entry.members ?? [],
    mark: entry.mark ?? null,
    amended_by: entry.amendedBy ?? null,
    effective_date: null,
    source_url: source.url ?? null,
    source_version: source.celex,
    source_hash: source.sha256,
    last_verified: consolidatedOn,
    status: entry.status === "active" ? "active" : "deleted",
  };
}

/** JSON with object keys in a fixed order: the database's jsonb hands keys back in its own order, which would read as a change. */
const stable = (value) =>
  JSON.stringify(value ?? null, (_key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const sameJson = (a, b) => stable(a) === stable(b);

/**
 * What a run has to write, given the rows already stored: new entries, entries that differ, and stored
 * active entries the new text no longer lists (marked deleted, never removed). Everything else is left
 * alone, which is what makes a second run of the same text write nothing.
 *
 * @param {Record<string, any>[]} stored rows read from `regulatory_entries`
 * @param {Record<string, any>[]} rows from `toRow`
 */
export function planWrites(stored, rows) {
  const key = (r) => `${r.annex}:${r.entry}`;
  const have = new Map(stored.map((r) => [key(r), r]));
  const listed = new Set(rows.map(key));
  const insert = [];
  const update = [];
  let unchanged = 0;
  for (const row of rows) {
    const old = have.get(key(row));
    if (!old) insert.push(row);
    else if (ROW_FIELDS.some((f) => !sameJson(old[f], row[f]))) update.push(row);
    else unchanged += 1;
  }
  const markDeleted = stored.filter((r) => r.status === "active" && !listed.has(key(r))).map((r) => ({ annex: r.annex, entry: r.entry }));
  return { insert, update, markDeleted, unchanged };
}

async function readStoredRows(db) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("regulatory_entries").select("*").order("annex").order("entry").range(from, from + PAGE - 1);
    if (error) throw new Error(`read regulatory_entries: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Writes the plan. Reads `ingredients.updated_at`'s newest value before and after, so the run can say it did not move. */
async function applyToDatabase(db, plan) {
  const newest = async () => {
    const { data, error } = await db.from("ingredients").select("updated_at").order("updated_at", { ascending: false }).limit(1);
    if (error) throw new Error(`read ingredients.updated_at: ${error.message}`);
    return data[0]?.updated_at ?? null;
  };
  const before = await newest();
  for (const rows of [plan.insert, plan.update]) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db.from("regulatory_entries").upsert(rows.slice(i, i + CHUNK), { onConflict: "annex,entry" });
      if (error) throw new Error(`write regulatory_entries: ${error.message}`);
    }
  }
  for (const annex of ["II", "III"]) {
    const entries = plan.markDeleted.filter((r) => r.annex === annex).map((r) => r.entry);
    for (let i = 0; i < entries.length; i += CHUNK) {
      const { error } = await db.from("regulatory_entries").update({ status: "deleted" }).eq("annex", annex).in("entry", entries.slice(i, i + CHUNK));
      if (error) throw new Error(`mark regulatory_entries deleted: ${error.message}`);
    }
  }
  const after = await newest();
  console.log(`ingredients.updated_at, newest value: before ${before}, after ${after}${before === after ? " (unchanged)" : " (CHANGED: something else wrote to the dictionary during this run)"}.`);
}

function readStored(out) {
  if (!existsSync(out)) return null;
  try {
    return JSON.parse(readFileSync(out, "utf8"));
  } catch {
    throw new Error(`${out} exists but is not valid JSON. Move it away or pass --out.`);
  }
}

function printCounts(parsed) {
  for (const annex of /** @type {const} */ (["II", "III"])) {
    const s = parsed.stats[annex];
    console.log(
      `Annex ${annex}: ${s.tableRows} table rows = ${s.headerRows} header + ${s.markerRows} marker + ${s.footnoteRows} footnote + ` +
        `${s.entryRows} entry + ${s.continuationRows} continuation. ${s.entries} entries (${s.deleted} moved or deleted, ${s.blank} blank).`
    );
    if (parsed.missingNumbers[annex].length > 0) console.log(`  Numbers the text does not print: ${parsed.missingNumbers[annex].join(", ")}`);
  }
  console.log(`${parsed.warnings.length} warning(s)${parsed.warnings.length > 0 ? ":" : "."}`);
  for (const w of parsed.warnings.slice(0, 10)) console.log(`  ${w}`);
  if (parsed.warnings.length > 10) console.log(`  ... and ${parsed.warnings.length - 10} more (all in the output file)`);
}

function printDiff(stored, parsed) {
  if (!stored) return console.log("\nNo stored file to compare with.");
  const { added, removed, changed } = diffEntries(stored.entries ?? [], parsed.entries);
  console.log(`\nAgainst the stored file (${stored.source?.celex ?? "unknown version"}): ${added.length} added, ${removed.length} removed, ${changed.length} changed.`);
  for (const [label, keys] of [["added", added], ["removed", removed], ["changed", changed]]) {
    if (keys.length > 0) console.log(`  ${label}: ${keys.slice(0, 20).join(", ")}${keys.length > 20 ? ", ..." : ""}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const apply = argv.includes("--apply");
  const out = flag("--out") ?? DEFAULT_OUT;
  const file = flag("--file");

  const stored = readStored(out);
  let xhtml;
  let expected = null;
  let source;
  if (file) {
    xhtml = readFileSync(file, "utf8");
    source = { file, fetchedAt: new Date().toISOString() };
  } else {
    const latest = await fetchLatest();
    xhtml = latest.xhtml;
    expected = latest.version;
    source = { celex: latest.version.celex, url: latest.url, fetchedAt: new Date().toISOString() };
  }

  const parsed = parseAnnexes(xhtml);
  assertTrustworthy(parsed, expected, stored?.entries ?? null);
  source = {
    ...source,
    celex: source.celex ?? `${parsed.version.celex}-${parsed.version.consolidatedOn.replaceAll("-", "")}`,
    sha256: createHash("sha256").update(xhtml).digest("hex"),
    bytes: Buffer.byteLength(xhtml),
  };

  console.log(`Text: ${source.celex}, consolidated on ${parsed.version.consolidatedOn} (edition ${parsed.version.edition}), sha256 ${source.sha256.slice(0, 16)}...`);
  printCounts(parsed);
  printDiff(stored, parsed);

  if (!apply) return console.log("\nDry run: nothing written. Pass --apply to write the JSON file and the database.");
  const tmp = `${out}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(toDocument(parsed, source), null, 1)}\n`);
  renameSync(tmp, out);
  console.log(`\nWrote ${out}.`);

  // The database. connect() refuses the write unless the environment is declared (and --prod for production).
  const { db } = connect({ write: true });
  const rows = parsed.entries.map((entry) => toRow(entry, source, parsed.version.consolidatedOn));
  const plan = planWrites(await readStoredRows(db), rows);
  console.log(`regulatory_entries: ${plan.insert.length} to insert, ${plan.update.length} to update, ${plan.markDeleted.length} to mark deleted, ${plan.unchanged} unchanged.`);
  await applyToDatabase(db, plan);
  console.log("Done.");
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
    console.error(err.message ?? err);
    process.exit(1);
  });
}
