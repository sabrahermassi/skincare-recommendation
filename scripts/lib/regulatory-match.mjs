/**
 * Ties dictionary ingredients to Annex entries (#457, step 4 of 9). Pure: the database and the files are
 * the shell around it (`scripts/match-regulatory.mjs`).
 *
 * An Annex entry names a substance; a label names an INCI ingredient. CosIng is the Commission's own
 * link between the two, so a dictionary name is looked up in the CosIng copy (`cosing_records`) and its CAS
 * and EC numbers are compared with the entries. The order is CAS, then EC, then CosIng's own annex
 * reference, then a class the entry names (borates, 1396 and 1397); `matched_by` records which one decided.
 *
 * The regulation text is the authority, not CosIng. Where CosIng disagrees with it the pair is held back
 * and goes to the owner's review list instead of `ingredient_regulatory`:
 *   - CosIng cites an entry the current text does not list (an old entry number, or one since deleted);
 *   - CosIng cites one entry and the identifiers point to another;
 *   - the CosIng record lists CAS or EC numbers the entry does not (Damascenone, #443);
 *   - the name says borate but the record's CAS is not among the entry's listed members (potassium borate).
 *
 * A match that is made but deserves a second look carries `flags`: one CAS shared by several dictionary
 * names, a match made by CosIng's link alone, an entry with no CAS or EC to check it against.
 */

/** The class entries the borate rule names: Annex II 1396 (borates and their salts and esters) and 1397 (perborates). */
export const BORATE_ENTRY = "1396";
export const PERBORATE_ENTRY = "1397";

const fold = (text) => String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const key = (annex, entry) => `${annex}/${fold(entry)}`;

/**
 * "II/1339" and "III/14" (CosIng's way of citing an entry) as { annex, entry }; null for anything else, an
 * Annex IV to VI reference included, since those are not tables this step holds.
 */
export function parseAnnexRef(ref) {
  const m = /^\s*(II|III)\s*\/\s*([0-9]+[a-z]?)\s*$/i.exec(String(ref ?? ""));
  return m ? { annex: m[1].toUpperCase(), entry: m[2].toLowerCase() } : null;
}

/** Which of the borate classes a dictionary name says it belongs to, or null. */
export function borateClass(name) {
  const n = fold(name);
  if (/perborate|perboric|peroxoborate/.test(n)) return PERBORATE_ENTRY;
  if (/borate\b|boric acid/.test(n) && !/^boric acid$/.test(n)) return BORATE_ENTRY;
  return null;
}

function index(entries) {
  const byKey = new Map();
  const cas = new Map();
  const ec = new Map();
  const memberCas = new Map();
  const memberEc = new Map();
  const add = (map, id, k) => map.set(id, (map.get(id) ?? new Set()).add(k));
  for (const entry of entries) {
    if (entry.status && entry.status !== "active") continue;
    const k = key(entry.annex, entry.entry);
    byKey.set(k, entry);
    for (const id of entry.cas_numbers ?? []) add(cas, id, k);
    for (const id of entry.ec_numbers ?? []) add(ec, id, k);
    for (const member of entry.members ?? []) {
      for (const id of member.cas ?? []) add(memberCas, id, k);
      for (const id of member.ec ?? []) add(memberEc, id, k);
    }
  }
  return { byKey, cas, ec, memberCas, memberEc };
}

const unique = (list) => [...new Set(list)];

/** The CosIng records for one dictionary name, folded into the one view the matcher reads. */
function recordFor(recordsByName, name) {
  const records = recordsByName.get(fold(name)) ?? [];
  if (records.length === 0) return null;
  return {
    refs: records.map((r) => r.cosing_ref).sort(),
    cas: unique(records.flatMap((r) => r.cas_numbers ?? [])),
    ec: unique(records.flatMap((r) => r.ec_numbers ?? [])),
    cited: unique(records.flatMap((r) => r.annex_refs ?? [])),
  };
}

const sharesAny = (a, b) => a.some((x) => b.has(x));

/** The records the matcher reads: ingredient records that have an INCI name. A substance record is not a dictionary lookup. */
export const usableRecords = (records) => records.filter((r) => r.inci_name && (!r.kind || r.kind === "ingredient"));

/** A prune that would delete more than this share of the automatic rows stored is a bad read, not a change. */
export const MAX_STALE_SHARE = 0.5;

/** Whether `--prune` may go ahead: not when it would delete most of the automatic rows there are. */
export function pruneIsSane(stored, plan) {
  const automatic = stored.filter((r) => !r.reviewed_by && r.matched_by !== "manual").length;
  return automatic < 20 || plan.stale.length <= automatic * MAX_STALE_SHARE;
}

/** The numbers of `kind` ("cas" or "ec") in `own` that neither the entry nor any of its listed members carries. */
function unlisted(entry, kind, own) {
  const listed = new Set([...(entry[kind === "cas" ? "cas_numbers" : "ec_numbers"] ?? []), ...(entry.members ?? []).flatMap((m) => m[kind] ?? [])]);
  return own.filter((id) => !listed.has(id));
}

/**
 * @param {{
 *   entries: Array<{ annex: string, entry: string, wording?: string, cas_numbers?: string[], ec_numbers?: string[], members?: Array<{ cas?: string[], ec?: string[] }>, status?: string }>,
 *   records: Array<{ cosing_ref: string, kind?: string, inci_name: string | null, cas_numbers?: string[], ec_numbers?: string[], annex_refs?: string[] }>,
 *   ingredients: string[],
 *   productCounts?: Map<string, number>,
 * }} input
 */
export function matchRegulatory({ entries, records, ingredients, productCounts = new Map() }) {
  const idx = index(entries);
  const recordsByName = new Map();
  for (const record of usableRecords(records)) {
    const name = fold(record.inci_name);
    recordsByName.set(name, [...(recordsByName.get(name) ?? []), record]);
  }

  const matches = [];
  const held = [];

  const hold = (name, k, reason, rec) => {
    const entry = idx.byKey.get(k);
    held.push({ inci_name: name, annex: entry?.annex ?? k.split("/")[0], entry: entry?.entry ?? k.split("/")[1], reason, cosing_ref: rec?.refs[0] ?? null, cas: rec?.cas ?? [] });
  };

  for (const name of ingredients) {
    const rec = recordFor(recordsByName, name);
    const candidates = new Map(); // entry key -> Set of "cas" | "ec" | "cosing" | "class"
    const blocked = new Map(); // entry key -> reason
    const note = (k, how) => candidates.set(k, (candidates.get(k) ?? new Set()).add(how));

    if (rec) {
      // CAS and EC. A record that lists numbers the entry does not is a disagreement, not a match.
      for (const [how, own, byId] of [
        ["cas", rec.cas, idx.cas],
        ["ec", rec.ec, idx.ec],
      ]) {
        const hits = unique(own.flatMap((id) => [...(byId.get(id) ?? [])]));
        for (const k of hits) {
          const extra = unlisted(idx.byKey.get(k), how, own);
          if (extra.length > 0) blocked.set(k, `CosIng lists ${how.toUpperCase()} numbers the entry does not: ${extra.join(", ")}`);
          else note(k, how);
        }
      }
      // A class the entry names: the record's CAS or EC is one of the entry's listed members, and every
      // number the record lists is one the entry (or a member) lists.
      const viaMembers = new Set([...rec.cas.flatMap((id) => [...(idx.memberCas.get(id) ?? [])]), ...rec.ec.flatMap((id) => [...(idx.memberEc.get(id) ?? [])])]);
      for (const k of viaMembers) {
        const extra = [...unlisted(idx.byKey.get(k), "cas", rec.cas), ...unlisted(idx.byKey.get(k), "ec", rec.ec)];
        if (extra.length > 0) blocked.set(k, `CosIng lists CAS or EC numbers the entry and its members do not: ${extra.join(", ")}`);
        else note(k, "class");
      }
    }

    // CosIng's own annex references.
    const cited = new Set();
    const missing = [];
    for (const ref of rec?.cited ?? []) {
      const parsed = parseAnnexRef(ref);
      if (!parsed) continue;
      const k = key(parsed.annex, parsed.entry);
      if (idx.byKey.has(k)) cited.add(k);
      else missing.push(k);
    }
    const derived = new Set(candidates.keys());
    // An old entry number: CosIng cites an entry the current text no longer lists. Whatever the numbers say,
    // the two sources disagree, so the pair is held back, the cited number included.
    for (const k of missing) {
      const [annex, entry] = k.split("/");
      held.push({ inci_name: name, annex: annex, entry, reason: `CosIng cites ${annex}/${entry}, which the current text does not list (renumbered or deleted)`, cosing_ref: rec.refs[0], cas: rec.cas });
      for (const d of derived) blocked.set(d, `CosIng cites ${k}, which the current text does not list; the identifiers point to ${d}`);
    }
    if (derived.size > 0 && cited.size > 0 && !sharesAny([...cited], derived)) {
      for (const k of [...derived, ...cited]) blocked.set(k, `CosIng cites ${[...cited].join(", ")}; the identifiers point to ${[...derived].join(", ")}`);
    }
    for (const k of cited) {
      if (derived.has(k) || blocked.has(k)) continue;
      const entry = idx.byKey.get(k);
      const entryHasIds = (entry.cas_numbers ?? []).length + (entry.ec_numbers ?? []).length + (entry.members ?? []).length > 0;
      const recHasIds = rec.cas.length + rec.ec.length > 0;
      // Both sides have numbers and they do not meet: CosIng cites an entry that is not this ingredient.
      if (entryHasIds && recHasIds) blocked.set(k, `CosIng cites ${k}, whose CAS and EC numbers are not this ingredient's`);
      else note(k, "cosing");
    }

    // The named borate class, for a name that says so. A record that has numbers of its own must show them
    // among the entry's members (it did above); otherwise the name is not enough.
    const klass = borateClass(name);
    if (klass) {
      const k = key("II", klass);
      if (idx.byKey.has(k) && !candidates.has(k) && !blocked.has(k)) {
        if (rec && rec.cas.length + rec.ec.length > 0) blocked.set(k, `the name says ${k}, but CosIng's CAS and EC numbers are not among the entry's listed members`);
        else note(k, "class");
      }
    }

    for (const [k, reason] of blocked) hold(name, k, reason, rec);
    for (const [k, hows] of candidates) {
      if (blocked.has(k)) continue;
      const entry = idx.byKey.get(k);
      const matchedBy = ["cas", "ec", "cosing", "class"].find((how) => hows.has(how));
      const flags = [];
      if (matchedBy === "cosing") flags.push("matched by CosIng's link alone");
      if (matchedBy === "class" && !rec) flags.push("matched by the class name alone");
      if ((entry.cas_numbers ?? []).length + (entry.ec_numbers ?? []).length + (entry.members ?? []).length === 0) flags.push("the entry has no CAS or EC to check it against");
      matches.push({ inci_name: name, annex: entry.annex, entry: entry.entry, matched_by: matchedBy, cosing_ref: rec?.refs[0] ?? null, cas: rec?.cas ?? [], flags });
    }
  }

  // One CAS under several dictionary names: each match made through it is worth a look.
  const namesByCas = new Map();
  for (const m of matches) for (const id of m.cas) namesByCas.set(id, (namesByCas.get(id) ?? new Set()).add(m.inci_name));
  for (const m of matches) {
    const shared = unique(m.cas.filter((id) => (namesByCas.get(id)?.size ?? 0) > 1));
    if (shared.length > 0) m.flags.push(`CAS ${shared.join(", ")} is shared by ${unique(shared.flatMap((id) => [...namesByCas.get(id)])).length} dictionary names`);
  }

  const counts = { cas: 0, ec: 0, cosing: 0, class: 0, held: held.length };
  for (const m of matches) counts[m.matched_by] += 1;

  const wording = (annex, entry) => idx.byKey.get(key(annex, entry))?.wording ?? "";
  const reviewRows = [
    ...matches.map((m) => ({ ...m, why: m.flags.join("; "), how: m.matched_by })),
    ...held.map((h) => ({ ...h, why: h.reason, how: "held back" })),
  ]
    .filter((row) => row.annex === "II" && (productCounts.get(row.inci_name) ?? 0) > 0)
    .map((row) => ({
      entry: row.entry,
      wording: wording(row.annex, row.entry),
      ingredient: row.inci_name,
      cas: row.cas.join(" "),
      matched_by: row.how,
      products: productCounts.get(row.inci_name) ?? 0,
      cosing_ref: row.cosing_ref ?? "",
      why: row.why,
    }))
    .sort((a, b) => Number(a.entry.replace(/\D/g, "")) - Number(b.entry.replace(/\D/g, "")) || a.entry.localeCompare(b.entry) || b.products - a.products || a.ingredient.localeCompare(b.ingredient));

  const withoutIds = entries
    .filter((e) => (!e.status || e.status === "active") && (e.cas_numbers ?? []).length + (e.ec_numbers ?? []).length + (e.members ?? []).length === 0)
    .map((e) => ({ annex: e.annex, entry: e.entry, wording: e.wording ?? "" }));

  const haveRecord = ingredients.filter((name) => recordsByName.has(fold(name))).length;
  return { matches, held, counts, reviewRows, entriesWithoutIds: withoutIds, ingredientsWithRecord: haveRecord, ingredientsWithoutRecord: ingredients.length - haveRecord };
}

export const REVIEW_COLUMNS = ["entry", "wording", "ingredient", "cas", "matched_by", "products", "cosing_ref", "why"];

/** The review list as CSV: every field quoted, and a leading = + - @ never left to be read as a formula. */
export function toCsv(rows, columns = REVIEW_COLUMNS) {
  const cell = (value) => {
    let text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [columns.map(cell).join(","), ...rows.map((row) => columns.map((column) => cell(row[column])).join(","))].join("\n") + "\n";
}

/**
 * What to write to `ingredient_regulatory` given what is stored. Rows a person has reviewed, and rows made
 * by hand, are never touched: a run that now disagrees with one only reports it. A stored automatic row the
 * new matches no longer produce is `stale`, deleted only when the caller asks.
 */
export function planRegulatoryWrites(stored, matches) {
  const k = (row) => `${row.inci_name}\u0000${row.annex}\u0000${fold(row.entry)}`;
  const have = new Map(stored.map((row) => [k(row), row]));
  const want = new Map(matches.map((m) => [k(m), m]));
  const upserts = [];
  const conflicts = [];
  let unchanged = 0;
  for (const [id, m] of want) {
    const row = have.get(id);
    if (!row) upserts.push({ inci_name: m.inci_name, annex: m.annex, entry: m.entry, matched_by: m.matched_by });
    else if (row.reviewed_by || row.matched_by === "manual") {
      if (row.matched_by !== m.matched_by && row.matched_by !== "manual") conflicts.push({ ...row, now: m.matched_by });
      else unchanged += 1;
    } else if (row.matched_by !== m.matched_by) upserts.push({ inci_name: m.inci_name, annex: m.annex, entry: m.entry, matched_by: m.matched_by });
    else unchanged += 1;
  }
  const stale = [];
  for (const [id, row] of have) {
    if (want.has(id)) continue;
    if (row.reviewed_by || row.matched_by === "manual") conflicts.push({ ...row, now: null });
    else stale.push({ inci_name: row.inci_name, annex: row.annex, entry: row.entry });
  }
  return { upserts, stale, conflicts, unchanged };
}
