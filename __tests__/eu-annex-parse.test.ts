import { readFileSync } from "fs";
import { join } from "path";

import { SAFETY_NOTICE_ENTRIES } from "@/lib/safety";
import { cellText, identifiers, parseAmendments, parseAnnexes, parseVersion, tableGrid } from "../scripts/lib/eu-annex-parse.mjs";

/**
 * #455: the parser for Annex II and Annex III of the consolidated Regulation (EC) No 1223/2009.
 *
 * `fixtures/eu-annex-sample.xhtml` is a trimmed copy of the Publications Office's file
 * 02009R1223-20260518: its header, the amending acts the rows below name, and 15 rows of Annex II and 8 of
 * Annex III, each copied exactly as the real file prints it (only the footnote list at the end of Annex II
 * is cut to its first five). The entries were picked to cover what the parser has to get right: a plain
 * entry, one with several CAS numbers, a botanical with none, a deleted entry, a class entry (borates), Annex III
 * entry 14 (hydroquinone in nail products), the two ways an amendment mark appears, a blank row, a stray
 * space inside a CAS number, an index number printed in the EC column, and an Annex III row the file lays one
 * column too far right.
 *
 * Set EU_ANNEX_FILE to a saved copy of the whole file to also check the full counts (skipped otherwise: the
 * file is 3.7 MB and not in the repository).
 */

const FIXTURE = readFileSync(join(__dirname, "fixtures", "eu-annex-sample.xhtml"), "utf8");
const parsed = parseAnnexes(FIXTURE);
const entry = (annex: "II" | "III", number: string) => {
  const found = parsed.entries.find((e) => e.annex === annex && e.entry === number);
  if (!found) throw new Error(`the fixture has no Annex ${annex} entry ${number}`);
  return found;
};

describe("the entries of Annex II", () => {
  it("reads a plain entry", () => {
    expect(entry("II", "1")).toMatchObject({
      status: "active",
      name: "N-(5-Chlorobenzoxazol-2-yl)acetamide",
      cas: ["35783-57-4"],
      ec: [],
      mark: null,
      amendedBy: null,
      members: [],
    });
  });

  it("reads several CAS and EC numbers from one entry", () => {
    expect(entry("II", "1395")).toMatchObject({ cas: ["10043-35-3", "11113-50-1"], ec: ["233-139-2", "234-343-4"] });
  });

  it("reads a botanical, which has no CAS number", () => {
    expect(entry("II", "106")).toMatchObject({ name: "Anamirta cocculus L. (fruit)", cas: [], ec: [], status: "active" });
  });

  it("keeps a deleted entry, marked, instead of dropping it", () => {
    expect(entry("II", "80")).toMatchObject({ status: "moved-or-deleted", name: "Moved or deleted", cas: [], ec: [] });
    expect(parsed.stats.II.deleted).toBe(1);
  });

  it("reads a class entry with the substances listed under it (borates, 1396), footnote marks removed", () => {
    const borates = entry("II", "1396");
    expect(borates.name).toMatch(/^Borates, tetraborates, octaborates and boric acid salts and esters, including:/);
    expect(borates.cas).toEqual([]);
    expect(borates.members).toHaveLength(12);
    expect(borates.members.map((m) => m.name)).toContain("Zinc borate");
    expect(borates.members.find((m) => m.name === "Zinc borate")).toMatchObject({ cas: ["1332-07-6"], ec: ["215-566-6"] });
    // "-" is the file's way of saying there is none.
    expect(borates.members.find((m) => m.name === "Trioctyldodecyl borate")).toMatchObject({ cas: [], ec: [] });
    expect(entry("II", "1397").members.length).toBeGreaterThan(5);
  });

  it("keeps hydroquinone's reference to Annex III in its wording", () => {
    expect(entry("II", "1339").name).toBe("1,4-Dihydroxybenzene (Hydroquinone), with the exception of entry 14 in Annex III");
    expect(entry("II", "1339")).toMatchObject({ cas: ["123-31-9"], ec: ["204-617-8"] });
  });

  it("reads a CAS number the regulation prints with a stray space", () => {
    expect(entry("II", "797").cas).toEqual(["72623-86-0"]);
  });

  it("does not read an index number in the EC column as an EC number, and does not lose it", () => {
    const veratrine = entry("II", "331");
    expect(veratrine.ec).toEqual([]);
    expect(veratrine.unparsed).toEqual({ ec: "613062004" });
    expect(parsed.warnings.some((w) => w.includes("entry 331") && w.includes("613062004"))).toBe(true);
  });
});

describe("the entries of Annex III", () => {
  it("reads hydroquinone's entry 14, with its nail-product conditions in their columns", () => {
    const hydroquinone = entry("III", "14");
    expect(hydroquinone).toMatchObject({ status: "active", name: "Hydroquinone", inciName: "Hydroquinone", cas: ["123-31-9"], ec: ["204-617-8"] });
    expect(hydroquinone.conditions).toHaveLength(1);
    expect(hydroquinone.conditions[0]).toMatchObject({
      productType: "Artificial nail systems",
      maxConcentration: "0,02 % (after mixing for use)",
      other: "Professional use only",
    });
    expect(hydroquinone.conditions[0]).toHaveProperty("wording", expect.stringContaining("For professional use only"));
  });

  it("gives an entry written over several rows one set of conditions per row", () => {
    expect(entry("III", "22").conditions).toHaveLength(3);
    expect(entry("III", "9").conditions).toHaveLength(3);
  });

  it("is not thrown off by a rowspan that runs past its entry (73's glossary name covers 74's row in the file)", () => {
    expect(entry("III", "73")).toMatchObject({ inciName: "Isoeugenol", cas: ["97-54-1"] });
    expect(entry("III", "74")).toMatchObject({ inciName: "Amylcinnamyl alcohol", cas: ["101-85-9"], ec: ["202-982-8"] });
    expect(parsed.stats.III.irregularRows).toBe(0);
  });

  it("keeps a number the text prints with nothing beside it, as blank", () => {
    expect(entry("III", "10")).toMatchObject({ status: "blank", name: "", cas: [], conditions: [] });
  });

  it("keeps a moved or deleted entry with no conditions", () => {
    expect(entry("III", "19")).toMatchObject({ status: "moved-or-deleted", inciName: null, conditions: [] });
  });

  it("reads a CAS cell that lists two numbers joined by +", () => {
    expect(entry("III", "250").cas).toEqual(["95576-89-9", "95576-92-4"]);
  });
});

describe("amendment marks", () => {
  it("takes the mark from the row of its own that comes before an entry, until the next one", () => {
    expect(entry("II", "1380")).toMatchObject({ mark: "M23", amendedBy: expect.stringContaining("2017/1410") });
    expect(entry("II", "1339")).toMatchObject({ mark: "M1", amendedBy: expect.stringContaining("No 344/2013") });
  });

  it("takes the mark from the reference cell when it is there (22 is printed as '►M4 22')", () => {
    const resorcinol = entry("III", "22");
    expect(resorcinol.entry).toBe("22");
    expect(resorcinol).toMatchObject({ mark: "M4", amendedBy: expect.stringContaining("No 1197/2013") });
  });

  it("reads ▼B as the original text, which no amending act changed", () => {
    expect(entry("II", "331")).toMatchObject({ mark: "B", amendedBy: null });
  });

  it("has no mark for an entry before the first marker row", () => {
    expect(entry("II", "1").mark).toBeNull();
  });

  it("lists the amending acts from the head of the file", () => {
    const acts = parseAmendments(FIXTURE);
    expect(acts.M1).toBe("COMMISSION REGULATION (EU) No 344/2013 of 4 April 2013");
    expect(acts.M32).toBe("COMMISSION REGULATION (EU) 2019/831 of 22 May 2019");
    expect(acts.M36).toBe("COMMISSION REGULATION (EU) 2019/1966 of 27 November 2019");
    expect(parsed.amendments).toEqual(acts);
  });

  it("lists a corrigendum under its own mark", () => {
    const head = "<p>Amended by:</p><table><tr><td><p>►M1</p></td><td><p>COMMISSION REGULATION (EU) No 344/2013 of 4 April 2013</p></td></tr><tr><td><p>►C1</p></td><td><p>Corrigendum, OJ L 142, 29.5.2013, p. 10 (344/2013)</p></td></tr></table>";
    expect(parseAmendments(head)).toEqual({ M1: "COMMISSION REGULATION (EU) No 344/2013 of 4 April 2013", C1: "Corrigendum, OJ L 142, 29.5.2013, p. 10 (344/2013)" });
  });
});

describe("every table row is accounted for", () => {
  it("splits each annex's rows into headers, marker rows, footnotes, entries and continuation rows, with none left over", () => {
    for (const annex of ["II", "III"] as const) {
      const s = parsed.stats[annex];
      expect(s.headerRows + s.markerRows + s.footnoteRows + s.entryRows + s.continuationRows).toBe(s.tableRows);
      expect(s.entryRows).toBe(s.entries);
    }
    expect(parsed.stats.II).toMatchObject({ tableRows: 50, headerRows: 3, markerRows: 9, footnoteRows: 1, entries: 15 });
    expect(parsed.stats.III).toMatchObject({ tableRows: 26, headerRows: 3, markerRows: 8, footnoteRows: 0, entries: 8, blank: 1, deleted: 1 });
    expect(parsed.warnings.some((w) => /not accounted for/.test(w))).toBe(false);
  });

  it("does not fold a row with an unrecognised reference into the entry above it", () => {
    const row = '<tr><td><p class="tbl-norm">X-9</p></td><td><p class="tbl-norm">A substance under a new kind of number</p></td><td><p class="tbl-norm">1-1-1</p></td><td><p class="tbl-norm"> </p></td></tr>';
    const at = FIXTURE.lastIndexOf("<tr>", FIXTURE.indexOf('<p class="tbl-norm">1397</p>'));
    const odd = parseAnnexes(FIXTURE.slice(0, at) + row + FIXTURE.slice(at));
    expect(odd.warnings.some((w) => /"X-9" is not an entry number/.test(w))).toBe(true);
    expect(odd.warnings.some((w) => /Annex II: 1 table row\(s\) are not accounted for/.test(w))).toBe(true);
    expect(odd.entries.some((e) => JSON.stringify(e).includes("new kind of number"))).toBe(false);
  });

  it("keeps the letters a member's CAS cell prints beside the number", () => {
    const qualified = parseAnnexes(FIXTURE.replace("12008-41-2 [1]", "12008-41-2 HCl [1]"));
    const octaborate = qualified.entries.find((e) => e.annex === "II" && e.entry === "1396")!.members.find((m) => /octaborate anhydrous/.test(m.name))!;
    expect(octaborate.cas).toEqual(["12008-41-2"]);
    expect(octaborate.unparsed?.cas).toMatch(/HCl/);
  });

  it("names the numbers the text does not print, so a gap is visible", () => {
    expect(parsed.missingNumbers.II).toContain(2);
    expect(parsed.missingNumbers.II).not.toContain(1);
  });
});

describe("the file's header", () => {
  it("says which consolidated text it is", () => {
    expect(parseVersion(FIXTURE)).toEqual({ celex: "02009R1223", consolidatedOn: "2026-05-18", edition: "041.001" });
    expect(parseVersion("<html></html>")).toBeNull();
  });
});

describe("a file that is not the text", () => {
  it("is refused rather than parsed to nothing", () => {
    expect(() => parseAnnexes("")).toThrow(/Annex II: its table was not found/);
    expect(() => parseAnnexes("<html><body><p>Please verify you are human</p></body></html>")).toThrow(/Annex II/);
  });

  it("is refused when one annex is missing", () => {
    const withoutIII = FIXTURE.replace("ANNEX III</p>", "ANNEX 3</p>");
    expect(() => parseAnnexes(withoutIII)).toThrow(/Annex III: its table was not found/);
  });

  it("refuses a nested table instead of misreading it", () => {
    expect(() => tableGrid("<table><tr><td><table><tr><td>x</td></tr></table></td></tr></table>")).toThrow(/nested table/);
  });
});

describe("the small readers", () => {
  it("turns paragraphs and breaks into lines and decodes entities", () => {
    expect(cellText('<p class="tbl-norm">Tom &amp; Jerry</p><p class="x">a&#160;b</p><br/>c&lt;d')).toBe("Tom & Jerry\na b\nc<d");
  });

  it("lays rowspans and colspans on a grid, marking what a cell only carries down", () => {
    const grid = tableGrid('<table><tr><td rowspan="2">A</td><td colspan="2">B</td></tr><tr><td>C</td><td>D</td></tr></table>');
    expect(grid[0].map((c) => [c.text, c.own])).toEqual([["A", true], ["B", true], ["B", true]]);
    expect(grid[1].map((c) => [c.text, c.own])).toEqual([["A", false], ["C", true], ["D", true]]);
  });

  it("stops carrying a rowspan into a row the caller says starts a new entry", () => {
    const html = '<table><tr><td>1</td><td rowspan="3">carried</td></tr><tr><td>2</td><td>x</td></tr></table>';
    expect(tableGrid(html)[1].map((c) => c.text)).toEqual(["2", "carried", "x"]);
    expect(tableGrid(html, (first) => /^\d+$/.test(first))[1].map((c) => c.text)).toEqual(["2", "x"]);
  });

  it("reads CAS and EC numbers, leaving anything else behind to be reported", () => {
    expect(identifiers("1310-58-3/1310-73-2", /\b\d{2,7}-\d{2}-\d\b/g)).toEqual({ numbers: ["1310-58-3", "1310-73-2"], leftover: "" });
    expect(identifiers("-", /\b\d{2,7}-\d{2}-\d\b/g)).toEqual({ numbers: [], leftover: "" });
    expect(identifiers("72623- 86-0 [3]", /\b\d{2,7}-\d{2}-\d\b/g)).toEqual({ numbers: ["72623-86-0"], leftover: "" });
    expect(identifiers("HCl\n3248-93-9", /\b\d{2,7}-\d{2}-\d\b/g)).toEqual({ numbers: ["3248-93-9"], leftover: "HCl" });
  });
});

/**
 * The entries the safety notice already speaks for were checked by hand on the consolidated text. Run through the
 * parser, each must come out as the same entry number, the same substance, and be last changed by the act the notice
 * names. If one does not, either the parser or the hand-checked list is wrong, and this says which entry.
 */
describe("the hand-verified safety-notice entries", () => {
  const SUBSTANCE: Record<number, RegExp> = {
    1339: /hydroquinone/i,
    1375: /isobutylparaben/i,
    1380: /4-\(4-hydroxy-4-methylpentyl\)\s*cyclohex-3-ene-1-carbaldehyde/i,
    1666: /2-\(4-tert-butylbenzyl\)\s*propionaldehyde/i,
    1394: /diboron trioxide/i,
    1395: /boric acid/i,
    1396: /borates, tetraborates, octaborates/i,
    1397: /perboric acid/i,
    1389: /dichloromethane/i,
  };

  it("has a substance to check for every entry on the list", () => {
    expect(Object.keys(SUBSTANCE).map(Number).sort()).toEqual(SAFETY_NOTICE_ENTRIES.map((e) => e.entry).sort());
  });

  for (const verified of SAFETY_NOTICE_ENTRIES) {
    it(`parses entry ${verified.entry} (${verified.ingredient}) to the same substance and amending act`, () => {
      const found = entry("II", String(verified.entry));
      expect(found.status).toBe("active");
      expect(found.name).toMatch(SUBSTANCE[verified.entry]);
      // "Regulation (EU) 2019/831, replaced by Regulation (EU) 2019/1966": the last one named is the one in force.
      const named = verified.regulation?.match(/\b(?:\d{4}\/\d+|\d+\/\d{4})\b/g)?.at(-1);
      expect(named).toBeDefined();
      expect(found.amendedBy).toContain(named!);
    });
  }
});

/** The whole file, when a saved copy is at hand: the counts the PR reports. */
const FULL = process.env.EU_ANNEX_FILE;
(FULL ? describe : describe.skip)("the full 18 May 2026 text (EU_ANNEX_FILE)", () => {
  const whole = FULL ? parseAnnexes(readFileSync(FULL, "utf8")) : null;

  it("returns every row of both annexes and accounts for each", () => {
    expect(whole!.stats.II).toMatchObject({ tableRows: 1945, headerRows: 3, markerRows: 47, footnoteRows: 1, entryRows: 1762, continuationRows: 132, entries: 1762, deleted: 25, blank: 0 });
    expect(whole!.stats.III).toMatchObject({ tableRows: 740, headerRows: 3, markerRows: 136, footnoteRows: 1, entryRows: 379, continuationRows: 221, entries: 379, deleted: 3, blank: 4, irregularRows: 0 });
  });

  it("lists the numbers the text does not print", () => {
    expect(whole!.missingNumbers.II).toEqual([382, 1398, 1399, 1427, 1669]);
    expect(whole!.missingNumbers.III).toEqual([1, 7, 13, 79, 83, 101, 125, 126, 158, 160, 161, 162, 163, 165, 167, 168, 311]);
  });

  it("has no duplicate entry numbers", () => {
    const keys = whole!.entries.map((e) => `${e.annex}:${e.entry}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
