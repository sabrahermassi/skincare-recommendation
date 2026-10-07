/**
 * A pure parser for Annex II and Annex III of the consolidated Regulation (EC)
 * No 1223/2009 (#455), read from the XHTML file the EU Publications Office serves.
 *
 * EUR-Lex itself answers a script with an empty HTTP 202, so the text is read from the
 * Publications Office (see `scripts/import-eu-annexes.mjs`). The file is "a documentation
 * tool, with no legal effect": the Official Journal text is the authentic one. This
 * reads what the consolidation prints and nothing else, so every name, number and
 * wording that comes out is the regulation's own. Nothing is inferred, repaired or
 * added from memory, and nothing here touches a database.
 *
 * What the file looks like, learned from the 18 May 2026 text (02009R1223-20260518):
 *
 * - Each annex is one `<table>` of `<tr>`/`<td>` with `rowspan` and `colspan`. A table row is
 *   not an entry: an entry can span several rows (a class entry such as 1396 lists its salts in
 *   rows of their own), so the rows are laid out on a grid first and read from there.
 * - Annex II has four columns (reference, chemical name, CAS, EC). Annex III has nine
 *   (reference, chemical name, INCI glossary name, CAS, EC, product type, maximum concentration,
 *   other, wording of conditions and warnings).
 * - An amendment mark says which act last changed the text that follows it. It comes in two
 *   shapes: a row of its own (`▼M32`, `▼B` for the original text, `▼C6` for a corrigendum) that
 *   holds until the next one, or inside the reference cell (`►M4 22`) for that one number.
 *   The acts behind the marks are listed at the top of the file.
 * - A deleted or moved entry stays in the table with the words "Moved or deleted". It is kept here,
 *   marked, never dropped: a number that has gone is still a number a source may cite. A few rows print
 *   the number with nothing beside it; those are kept as "blank". Some numbers are not printed at all
 *   (the file jumps from 381 to 383 in Annex II, say); there is nothing to keep for those, and
 *   `missingNumbers` in the result lists them.
 * - Footnote marks `[2]` and `(20)` follow names, and `-` stands for "none" in a CAS or EC cell.
 * - The last row of each table holds the footnotes. It is not an entry, and it is counted as such
 *   in `stats` rather than skipped silently.
 *
 * Every table row is accounted for: `tableRows` is exactly `headerRows + markerRows +
 * footnoteRows + entryRows + continuationRows`, and a row that cannot be read is listed in
 * `warnings` rather than dropped.
 */

/** @typedef {{ name: string, inciName: string | null, cas: string[], ec: string[] }} AnnexMember */

/**
 * @typedef {object} AnnexConditions The Annex III columns f to i, for one row of an entry.
 * @property {string} productType
 * @property {string} maxConcentration
 * @property {string} other
 * @property {string} wording
 */

/**
 * @typedef {object} AnnexEntry
 * @property {"II" | "III"} annex
 * @property {string} entry The reference number as printed: "1339", "15a".
 * @property {"active" | "moved-or-deleted" | "blank"} status "moved-or-deleted" is the file's own wording; "blank" is a number printed with nothing beside it.
 * @property {string | null} mark The amendment mark in effect for it ("B", "M32", "C6"), null before the first.
 * @property {string | null} amendedBy The act the mark names, as the file's list prints it; null for "B" and for none.
 * @property {string} name The chemical name or class, as printed.
 * @property {string | null} inciName Annex III's Common Ingredients Glossary name.
 * @property {string[]} cas CAS numbers in the entry's own row.
 * @property {string[]} ec EC numbers in the entry's own row.
 * @property {AnnexMember[]} members The rows below a class entry, each one a substance of its own.
 * @property {(AnnexConditions | { irregular: true, cells: string[] })[]} conditions Annex III only, one per row of the entry; none for a deleted one.
 * @property {{ cas?: string, ec?: string }} [unparsed] Text a CAS or EC cell held besides numbers (present only when there was some).
 */

const MARK_ROW = /^[▼►]\s*(B|M\d+|C\d+)\s*[—–-]*\s*◄?$/;
const MARK_ANYWHERE = /[▼►]\s*(B|M\d+|C\d+)/g;
const CAS = /\b\d{2,7}-\d{2}-\d\b/g;
const EC = /\b\d{3}-\d{3}-\d\b/g;
const ENTRY_NUMBER = /^\d+[a-z]?$/;

/** The text of one cell: paragraphs and breaks become lines, tags go, entities are decoded. */
export function cellText(html) {
  const withBreaks = html.replace(/<\/p>|<\/div>|<br\s*\/?>/gi, "\n");
  const bare = withBreaks.replace(/<[^>]+>/g, "");
  const decoded = bare
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/ /g, " ");
  return decoded
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * A table as a grid: one array per `<tr>`, each cell `{ text, own }`, where `own` is false for a
 * cell that is only a `rowspan` carried down from the row above. A row can end up wider than
 * the table's columns when the file lays a cell over one that is still spanning; the cell is
 * pushed to the right, as a browser does, and the row is longer.
 *
 * A few `rowspan`s in the file run past the entry they belong to (Annex III entry 73's
 * glossary name covers entry 74's row as well, which shifts every cell of 74 one column to
 * the right). `startsEntry` is asked for each row with its first cell's text; when it says
 * yes, nothing is carried into that row, because an entry never inherits from the one above.
 *
 * @param {string} tableHtml
 * @param {(firstCellText: string) => boolean} [startsEntry]
 * @returns {{ text: string, own: boolean }[][]}
 */
export function tableGrid(tableHtml, startsEntry = () => false) {
  if (/<table/i.test(tableHtml.slice(5))) throw new Error("a nested table: this parser reads flat tables only");
  const rows = [];
  /** @type {Map<number, { left: number, text: string }>} */
  const carried = new Map();
  for (const tr of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = [];
    let col = 0;
    const firstCell = /<td[^>]*>([\s\S]*?)<\/td>/.exec(tr[1]);
    if (firstCell && startsEntry(cellText(firstCell[1]))) carried.clear();
    const fillCarried = () => {
      for (let held = carried.get(col); held && held.left > 0; held = carried.get(col)) {
        row[col] = { text: held.text, own: false };
        held.left -= 1;
        col += 1;
      }
    };
    for (const td of tr[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)) {
      fillCarried();
      const rowspan = Number(/rowspan="(\d+)"/.exec(td[1])?.[1] ?? 1);
      const colspan = Number(/colspan="(\d+)"/.exec(td[1])?.[1] ?? 1);
      const text = cellText(td[2]);
      for (let k = 0; k < colspan; k += 1) {
        row[col + k] = { text, own: true };
        if (rowspan > 1) carried.set(col + k, { left: rowspan - 1, text });
      }
      col += colspan;
    }
    fillCarried();
    rows.push(row);
  }
  return rows;
}

/** Every amendment mark in a piece of text, and the text without them and their closing arrows. */
function withoutMarks(text) {
  const marks = [...text.matchAll(MARK_ANYWHERE)].map((m) => m[1]);
  const bare = text.replace(MARK_ANYWHERE, "").replace(/[◄▲]/g, "");
  return { marks, text: bare.split("\n").map((line) => line.trim()).filter(Boolean).join("\n") };
}

/** A footnote mark at the end of a value: "[2]", " [3]". */
const FOOTNOTE_MARK = /\s*\[\d+\]/g;

/**
 * The CAS or EC numbers in a cell, and anything else the cell held. A cell that says nothing is
 * `-`, and a number may carry a footnote mark; anything left over is returned so a caller can
 * report it instead of losing it.
 *
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {{ numbers: string[], leftover: string }}
 */
export function identifiers(text, pattern) {
  const { text: bare } = withoutMarks(text);
  // The regulation sometimes prints a stray space inside a number: "72623- 86-0".
  const squeezed = bare.replace(/(\d)\s*-\s*(?=\d)/g, "$1-");
  const numbers = [...new Set(squeezed.match(pattern) ?? [])];
  const leftover = squeezed
    .replace(pattern, "")
    .replace(FOOTNOTE_MARK, "")
    .replace(/[\s/,;+()–—-]+/g, "")
    .trim();
  return { numbers, leftover };
}

/**
 * The acts the marks stand for, from the list at the top of the file: `►M1` followed by the
 * act's title on the next line.
 *
 * @param {string} xhtml
 * @returns {Record<string, string>} mark → title, e.g. `M1: "COMMISSION REGULATION (EU) No 344/2013 of 4 April 2013"`.
 */
export function parseAmendments(xhtml) {
  const start = xhtml.indexOf("Amended by");
  if (start < 0) return {};
  const firstAnnex = xhtml.search(/<p class="title-annex-1"/);
  const lines = cellText(xhtml.slice(start, firstAnnex < 0 ? undefined : firstAnnex)).split("\n");
  /** @type {Record<string, string>} */
  const acts = {};
  for (let i = 0; i < lines.length - 1; i += 1) {
    const mark = /^►([MC]\d+)$/.exec(lines[i])?.[1];
    if (mark && !acts[mark]) acts[mark] = lines[i + 1];
    // The list ends where the regulation's own text begins.
    if (/^(CHAPTER|Article) /.test(lines[i])) break;
  }
  return acts;
}

/**
 * Which consolidated text this is, from its header: `<title>Consolidated TEXT: 32009R1223 — EN —
 * 18.05.2026</title>` and the reference line `02009R1223 — EN — 18.05.2026 — 041.001`.
 *
 * @param {string} xhtml
 * @returns {{ celex: string, consolidatedOn: string, edition: string } | null}
 */
export function parseVersion(xhtml) {
  const m = /<p class="reference">\s*(\d{5}R\d{4})\s*—\s*EN\s*—\s*(\d{2})\.(\d{2})\.(\d{4})\s*—\s*([\d.]+)/.exec(xhtml);
  return m ? { celex: m[1], consolidatedOn: `${m[4]}-${m[3]}-${m[2]}`, edition: m[5] } : null;
}

/** The `<table>` that follows an annex's heading, or null. */
function annexTable(xhtml, annex) {
  const heading = new RegExp(`<p class="title-annex-1"[^>]*>\\s*ANNEX ${annex}\\s*</p>`).exec(xhtml);
  if (!heading) return null;
  const from = heading.index + heading[0].length;
  const open = xhtml.indexOf("<table", from);
  const close = xhtml.indexOf("</table>", open);
  return open < 0 || close < 0 ? null : xhtml.slice(open, close + "</table>".length);
}

const NEW_COUNTS = () => ({ tableRows: 0, headerRows: 0, markerRows: 0, footnoteRows: 0, entryRows: 0, continuationRows: 0 });

/**
 * Reads one annex's table into entries.
 *
 * @param {"II" | "III"} annex
 * @param {string} tableHtml
 * @param {Record<string, string>} amendments
 */
function parseAnnexTable(annex, tableHtml, amendments) {
  const grid = tableGrid(tableHtml, (first) => ENTRY_NUMBER.test(withoutMarks(first).text.replace(/\.$/, "")));
  const stats = NEW_COUNTS();
  /** @type {AnnexEntry[]} */
  const entries = [];
  const warnings = [];
  let mark = null;
  /** @type {AnnexEntry | null} */
  let current = null;
  const at = (row, col) => row[col]?.text ?? "";
  /** A cell's text only if this row wrote it: a cell carried down by a `rowspan` belongs to the row above. */
  const ownAt = (row, col) => (row[col]?.own ? row[col].text : "");

  grid.forEach((row, index) => {
    stats.tableRows += 1;
    const own = row.filter((cell) => cell?.own);
    const label = `Annex ${annex}, table row ${index + 1}`;

    if (own.length > 0 && own.every((cell) => MARK_ROW.test(cell.text))) {
      stats.markerRows += 1;
      mark = MARK_ROW.exec(own[0].text)[1];
      return;
    }
    const first = at(row, 0);
    if (first === "Reference number" || (first === "a" && at(row, 1) === "b") || at(row, 1) === "Chemical name/INN") {
      stats.headerRows += 1;
      return;
    }

    const { marks: refMarks, text: ref } = withoutMarks(first);
    const number = ref.replace(/\.$/, "");

    // A row that opens an entry has a reference number of its own.
    if (row[0]?.own && ENTRY_NUMBER.test(number)) {
      stats.entryRows += 1;
      const rowMark = refMarks.at(-1) ?? mark;
      const name = withoutMarks(at(row, 1)).text;
      const wording = annex === "III" ? withoutMarks(at(row, 2)).text : "";
      const idCol = annex === "III" ? 3 : 2;
      const deleted = /^moved or deleted$/i.test(name);
      // A few rows print the number and nothing else: Annex III's 10, 68, 104 and 120 were emptied by
      // Regulation (EU) No 344/2013. They are kept, as blank, so the number is still accounted for.
      const blank = !deleted && row.every((cell, col) => col === 0 || !cell?.text);
      const cas = identifiers(deleted ? "" : at(row, idCol), CAS);
      const ec = identifiers(deleted ? "" : at(row, idCol + 1), EC);
      const unparsed = unparsedOf(cas, ec, `${label} (entry ${number})`, warnings);
      current = {
        annex,
        entry: number,
        status: deleted ? "moved-or-deleted" : blank ? "blank" : "active",
        mark: rowMark,
        amendedBy: rowMark && rowMark !== "B" ? (amendments[rowMark] ?? null) : null,
        name: name.replace(FOOTNOTE_MARK, ""),
        inciName: annex === "III" && !deleted ? wording || null : null,
        cas: cas.numbers,
        ec: ec.numbers,
        members: [],
        conditions: [],
        ...(unparsed ? { unparsed } : {}),
      };
      if (annex === "III" && current.status === "active") current.conditions.push(conditionsOf(row));
      entries.push(current);
      return;
    }

    // The footnotes close the table: one row holding the whole list.
    if (/^\(\d+\)/.test(first)) {
      stats.footnoteRows += 1;
      return;
    }

    // Anything else under an entry belongs to it: a class entry's substances, a second set of
    // conditions, a list of CAS numbers on a row with no reference of its own.
    if (current) {
      stats.continuationRows += 1;
      const idCol = annex === "III" ? 3 : 2;
      const name = withoutMarks(ownAt(row, 1)).text.replace(FOOTNOTE_MARK, "");
      const inci = annex === "III" ? withoutMarks(ownAt(row, 2)).text : "";
      const cas = identifiers(ownAt(row, idCol), CAS);
      const ec = identifiers(ownAt(row, idCol + 1), EC);
      if (name || inci || cas.numbers.length > 0 || ec.numbers.length > 0) {
        current.members.push({ name: name || inci, inciName: inci || null, cas: cas.numbers, ec: ec.numbers });
        unparsedOf(cas, ec, `${label} (entry ${current.entry}, member)`, warnings);
      }
      if (annex === "III" && current.status === "active") current.conditions.push(conditionsOf(row));
      return;
    }

    warnings.push(`${label}: a row before any entry, not read ("${first.slice(0, 60)}")`);
  });

  const accounted = stats.headerRows + stats.markerRows + stats.footnoteRows + stats.entryRows + stats.continuationRows;
  if (accounted !== stats.tableRows) warnings.push(`Annex ${annex}: ${stats.tableRows - accounted} table row(s) are not accounted for`);
  return { entries, stats, warnings };
}

/**
 * What a CAS or EC cell held besides numbers, kept on the entry and reported in `warnings`. A few Annex II
 * rows print an index number (such as 613-062-00-4) in the EC column; it is not an EC number, so it is not
 * read as one, and it is not thrown away either.
 */
function unparsedOf(cas, ec, label, warnings) {
  const unparsed = {};
  for (const [what, ids] of [["cas", cas], ["ec", ec]]) {
    if (!ids.leftover) continue;
    unparsed[what] = ids.leftover;
    // Letters only ("HCl", "Na") are a qualifier the regulation prints beside a number. Digits left
    // behind are a number that was not read, and that is worth a line.
    if (/\d/.test(ids.leftover)) warnings.push(`${label}: the ${what.toUpperCase()} cell holds digits that were not read as a ${what.toUpperCase()} number: "${ids.leftover.slice(0, 60)}"`);
  }
  return Object.keys(unparsed).length > 0 ? unparsed : null;
}

/**
 * One Annex III row's restriction columns. The file lays most rows on the table's nine columns;
 * where a row is wider than that (a cell laid over one still spanning), the columns after the
 * identification no longer line up, so the cells that row holds of its own are kept in order,
 * unlabelled, and the row is marked `irregular`.
 *
 * @returns {AnnexConditions | { irregular: true, cells: string[] }}
 */
function conditionsOf(row) {
  if (row.length === 9) {
    const text = (col) => withoutMarks(row[col]?.text ?? "").text;
    return { productType: text(5), maxConcentration: text(6), other: text(7), wording: text(8) };
  }
  return { irregular: true, cells: row.slice(5).filter((cell) => cell?.own).map((cell) => withoutMarks(cell.text).text) };
}

/** The whole numbers between 1 and the highest entry that the table does not print at all. */
function missingFrom(entries) {
  const printed = new Set(entries.map((e) => Number.parseInt(e.entry, 10)));
  const highest = Math.max(0, ...printed);
  const missing = [];
  for (let n = 1; n <= highest; n += 1) if (!printed.has(n)) missing.push(n);
  return missing;
}

/**
 * Parses Annex II and Annex III.
 *
 * @param {string} xhtml The file's text.
 * @returns {{
 *   version: ReturnType<typeof parseVersion>,
 *   amendments: Record<string, string>,
 *   entries: AnnexEntry[],
 *   stats: { II: ReturnType<typeof NEW_COUNTS> & { entries: number, deleted: number, blank: number }, III: ReturnType<typeof NEW_COUNTS> & { entries: number, deleted: number, blank: number, irregularRows: number } },
 *   missingNumbers: { II: number[], III: number[] },
 *   warnings: string[],
 * }}
 */
export function parseAnnexes(xhtml) {
  const amendments = parseAmendments(xhtml);
  /** @type {AnnexEntry[]} */
  const entries = [];
  const warnings = [];
  const stats = {};
  /** @type {Record<string, number[]>} */
  const missingNumbers = {};
  for (const annex of /** @type {const} */ (["II", "III"])) {
    const table = annexTable(xhtml, annex);
    if (!table) throw new Error(`Annex ${annex}: its table was not found in the file`);
    const parsed = parseAnnexTable(annex, table, amendments);
    entries.push(...parsed.entries);
    warnings.push(...parsed.warnings);
    missingNumbers[annex] = missingFrom(parsed.entries);
    stats[annex] = {
      ...parsed.stats,
      entries: parsed.entries.length,
      deleted: parsed.entries.filter((e) => e.status === "moved-or-deleted").length,
      blank: parsed.entries.filter((e) => e.status === "blank").length,
      ...(annex === "III" ? { irregularRows: parsed.entries.flatMap((e) => e.conditions).filter((c) => "irregular" in c).length } : {}),
    };
  }
  return { version: parseVersion(xhtml), amendments, entries, stats: /** @type {any} */ (stats), missingNumbers, warnings };
}
