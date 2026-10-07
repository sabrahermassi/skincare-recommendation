import { ATTRIBUTION, assertTrustworthy, diffEntries, MAX_DROP, MIN_ENTRIES, newestVersion, nextHop, planWrites, toDocument, toRow } from "../scripts/import-eu-annexes.mjs";

/**
 * #455: `import:eu-annexes` reads the newest consolidated text from the Publications Office and writes a JSON
 * file. The network and the file are the thin shell; what decides whether a run may write is pure, and is
 * pinned here: which version is newest, where a redirect may go, and the checks that stop a run with
 * the reason instead of writing something wrong.
 */

const binding = (celex: string, id = "9382f98e-9b27-11f1-b25c-01aa75ed71a1") => ({
  w: { value: `http://publications.europa.eu/resource/cellar/${id}` },
  celex: { value: celex },
});

describe("the newest consolidated version", () => {
  it("is the one with the latest date in its CELEX, whatever order the answer came in", () => {
    const answer = {
      results: {
        bindings: [
          binding("02009R1223-20250901", "ae5a2381-9368-11f0-97c8-01aa75ed71a1"),
          binding("02009R1223-20260518"),
          binding("02009R1223-20260501", "c27f93f3-279f-11f1-a7dd-01aa75ed71a1"),
        ],
      },
    };
    expect(newestVersion(answer, "2026-10-07")).toEqual({ celex: "02009R1223-20260518", cellarId: "9382f98e-9b27-11f1-b25c-01aa75ed71a1", consolidatedOn: "2026-05-18", upcoming: [] });
  });

  it("skips a version published before it applies, and names it as upcoming", () => {
    const answer = {
      results: {
        bindings: [
          binding("02009R1223-20261201", "11111111-2222-3333-4444-555555555555"),
          binding("02009R1223-20260518"),
          binding("02009R1223-20261101", "66666666-7777-8888-9999-000000000000"),
        ],
      },
    };
    expect(newestVersion(answer, "2026-10-07")).toEqual({
      celex: "02009R1223-20260518",
      cellarId: "9382f98e-9b27-11f1-b25c-01aa75ed71a1",
      consolidatedOn: "2026-05-18",
      upcoming: ["02009R1223-20261101", "02009R1223-20261201"],
    });
  });

  it("takes a version on the day it starts to apply", () => {
    const answer = { results: { bindings: [binding("02009R1223-20260518"), binding("02009R1223-20261007", "11111111-2222-3333-4444-555555555555")] } };
    expect(newestVersion(answer, "2026-10-07")).toMatchObject({ celex: "02009R1223-20261007", upcoming: [] });
  });

  it("refuses when every version it was given applies later", () => {
    const answer = { results: { bindings: [binding("02009R1223-20261201")] } };
    expect(() => newestVersion(answer, "2026-10-07")).toThrow(/applies after 2026-10-07/);
  });

  it("ignores anything that is not a dated consolidation of this regulation", () => {
    const answer = { results: { bindings: [binding("32009R1223"), binding("02009R1223"), binding("02011R0001-20260101"), binding("02009R1223-20260518", "not-a-cellar-id")] } };
    expect(() => newestVersion(answer)).toThrow(/named no consolidated version/);
  });

  it("says so when the service answers with nothing", () => {
    expect(() => newestVersion({})).toThrow(/named no consolidated version/);
    expect(() => newestVersion({ results: { bindings: [] } })).toThrow(/named no consolidated version/);
  });
});

describe("where a redirect may go", () => {
  const from = "https://publications.europa.eu/resource/cellar/9382f98e-9b27-11f1-b25c-01aa75ed71a1";

  it("upgrades the Publications Office's own http address to https, and never fetches plain http", () => {
    expect(nextHop(from, "http://publications.europa.eu/resource/cellar/abc.0001.02/DOC_1")).toBe("https://publications.europa.eu/resource/cellar/abc.0001.02/DOC_1");
  });

  it("follows a relative redirect on the same host", () => {
    expect(nextHop(from, "/resource/cellar/abc/DOC_1")).toBe("https://publications.europa.eu/resource/cellar/abc/DOC_1");
  });

  it("refuses to follow a redirect to another host, over https or not", () => {
    expect(() => nextHop(from, "https://example.com/text.xhtml")).toThrow(/refusing to follow/);
    expect(() => nextHop(from, "http://example.com/text.xhtml")).toThrow(/refusing to follow/);
    expect(() => nextHop(from, "http://publications.europa.eu.evil.example/x")).toThrow(/refusing to follow/);
  });
});

describe("comparing a run with the stored file", () => {
  const e = (annex: string, entry: string, name: string) => ({ annex, entry, name });

  it("lists entries added, removed and changed", () => {
    const before = [e("II", "1", "a"), e("II", "2", "b"), e("III", "14", "Hydroquinone")];
    const after = [e("II", "1", "a"), e("II", "2", "b changed"), e("III", "14", "Hydroquinone"), e("II", "3", "c")];
    expect(diffEntries(before, after)).toEqual({ added: ["II:3"], removed: [], changed: ["II:2"] });
    expect(diffEntries(after, before)).toEqual({ added: [], removed: ["II:3"], changed: ["II:2"] });
  });

  it("finds nothing to say about two identical runs", () => {
    expect(diffEntries([e("II", "1", "a")], [e("II", "1", "a")])).toEqual({ added: [], removed: [], changed: [] });
  });
});

describe("a run that must not write", () => {
  const entries = (ii: number, iii: number) => [
    ...Array.from({ length: ii }, (_, i) => ({ annex: "II", entry: String(i + 1) })),
    ...Array.from({ length: iii }, (_, i) => ({ annex: "III", entry: String(i + 1) })),
  ];
  const good = (overrides: Record<string, unknown> = {}) =>
    ({
      version: { celex: "02009R1223", consolidatedOn: "2026-05-18", edition: "041.001" },
      warnings: [] as string[],
      entries: entries(1762, 379),
      ...overrides,
    }) as unknown as Parameters<typeof assertTrustworthy>[0];
  const named = { celex: "02009R1223-20260518", consolidatedOn: "2026-05-18" };

  it("passes the real 18 May 2026 text, with or without a stored file", () => {
    expect(() => assertTrustworthy(good(), named, null)).not.toThrow();
    expect(() => assertTrustworthy(good(), named, entries(1760, 379))).not.toThrow();
    expect(() => assertTrustworthy(good(), null, null)).not.toThrow();
  });

  it("stops on a file that is not this regulation's consolidated text", () => {
    expect(() => assertTrustworthy(good({ version: null }), named, null)).toThrow(/not the consolidated text/);
    expect(() => assertTrustworthy(good({ version: { celex: "02011R0001", consolidatedOn: "2026-05-18", edition: "1" } }), named, null)).toThrow(/not the consolidated text/);
  });

  it("stops when the file's date is not the version the Publications Office named", () => {
    expect(() => assertTrustworthy(good(), { celex: "02009R1223-20260601", consolidatedOn: "2026-06-01" }, null)).toThrow(/named 02009R1223-20260601/);
  });

  it("stops when table rows were lost in parsing", () => {
    expect(() => assertTrustworthy(good({ warnings: ["Annex II: 3 table row(s) are not accounted for"] }), named, null)).toThrow(/rows were lost/);
  });

  it("stops on an annex with fewer entries than any real text has", () => {
    expect(() => assertTrustworthy(good({ entries: entries(MIN_ENTRIES.II - 1, 379) }), named, null)).toThrow(/Annex II came out with 1499 entries/);
    expect(() => assertTrustworthy(good({ entries: entries(1762, MIN_ENTRIES.III - 1) }), named, null)).toThrow(/Annex III came out with 299 entries/);
    expect(() => assertTrustworthy(good({ entries: [] }), named, null)).toThrow(/Annex II came out with 0 entries/);
  });

  it("stops on a sharp drop against the stored file, and allows a small one", () => {
    const stored = entries(2000, 400);
    expect(() => assertTrustworthy(good(), named, stored)).toThrow(/Annex II has 1762 entries, down from 2000/);
    expect(MAX_DROP).toBe(0.9);
    expect(() => assertTrustworthy(good({ entries: entries(1762, 379) }), named, entries(1800, 400))).not.toThrow();
  });
});

describe("the file that is written", () => {
  const parsed = {
    version: { celex: "02009R1223", consolidatedOn: "2026-05-18", edition: "041.001" },
    stats: {},
    missingNumbers: {},
    warnings: [],
    amendments: {},
    entries: [{ annex: "II", entry: "1" }],
  } as unknown as Parameters<typeof toDocument>[0];

  it("carries the version, the file's hash and the credit line for the text", () => {
    const doc = toDocument(parsed, { celex: "02009R1223-20260518", url: "https://publications.europa.eu/resource/cellar/x", sha256: "ab".repeat(32), bytes: 10, fetchedAt: "2026-10-07T00:00:00.000Z" });
    expect(doc.source).toMatchObject({ celex: "02009R1223-20260518", sha256: "ab".repeat(32), bytes: 10 });
    expect(doc.source.attribution).toContain("EUR-Lex, consolidated text of Regulation (EC) No 1223/2009");
    expect(doc.source.attribution).toContain("CELEX 02009R1223-20260518");
    expect(doc.source.attribution).toContain("© European Union");
    expect(doc.source.attribution).toMatch(/1998-20\d\d\./);
    expect(doc.source.attribution).not.toContain("{");
    expect(doc.entries).toHaveLength(1);
  });

  it("keeps the credit line's template free of anything but the two slots it fills", () => {
    expect(ATTRIBUTION.match(/\{(\w+)\}/g)).toEqual(["{celex}", "{year}"]);
  });
});

// #456: what a run writes to regulatory_entries, decided from the parsed text and the rows already stored.
describe("the rows written to regulatory_entries", () => {
  const source = { celex: "02009R1223-20260518", url: "https://publications.europa.eu/resource/cellar/x", sha256: "ab".repeat(32) };
  const entry = (overrides: Record<string, unknown> = {}) =>
    ({
      annex: "III",
      entry: "14",
      status: "active",
      mark: "M32",
      amendedBy: "Regulation (EU) 2019/1966",
      name: "Hydroquinone",
      inciName: "Hydroquinone",
      cas: ["123-31-9"],
      ec: ["204-617-8"],
      members: [],
      conditions: [{ productType: "Nail products", maxConcentration: "0.02%", other: "", wording: "" }],
      ...overrides,
    }) as unknown as Parameters<typeof toRow>[0];

  it("carries the version, the hash and the consolidation date on every row", () => {
    expect(toRow(entry(), source, "2026-05-18")).toMatchObject({
      annex: "III",
      entry: "14",
      wording: "Hydroquinone",
      inci_name: "Hydroquinone",
      cas_numbers: ["123-31-9"],
      ec_numbers: ["204-617-8"],
      mark: "M32",
      amended_by: "Regulation (EU) 2019/1966",
      effective_date: null,
      source_url: source.url,
      source_version: "02009R1223-20260518",
      source_hash: source.sha256,
      last_verified: "2026-05-18",
      status: "active",
    });
  });

  it("stores an Annex II entry with no conditions, and a moved or blank number as deleted", () => {
    expect(toRow(entry({ annex: "II", conditions: [] }), source, "2026-05-18").conditions).toBeNull();
    expect(toRow(entry({ status: "moved-or-deleted", name: "Moved or deleted" }), source, "2026-05-18").status).toBe("deleted");
    expect(toRow(entry({ status: "blank", name: "" }), source, "2026-05-18")).toMatchObject({ status: "deleted", wording: "" });
  });

  const rows = [toRow(entry(), source, "2026-05-18"), toRow(entry({ annex: "II", entry: "1", name: "A", conditions: [] }), source, "2026-05-18")];

  it("inserts what is new, and writes nothing for the same text a second time", () => {
    expect(planWrites([], rows)).toMatchObject({ insert: rows, update: [], markDeleted: [], unchanged: 0 });
    const stored = rows.map((r) => ({ ...r, updated_at: "2026-10-07T00:00:00Z" }));
    expect(planWrites(stored, rows)).toEqual({ insert: [], update: [], markDeleted: [], unchanged: 2 });
  });

  it("reads jsonb handing its keys back in another order as the same row", () => {
    const stored = rows.map((r) => ({
      ...r,
      conditions: r.conditions ? [{ wording: "", other: "", productType: "Nail products", maxConcentration: "0.02%" }] : null,
    }));
    expect(planWrites(stored, rows)).toMatchObject({ update: [], unchanged: 2 });
  });

  it("updates an entry that changed, and marks one the new text no longer lists as deleted, never removed", () => {
    const changed = { ...rows[0], cas_numbers: ["123-31-9", "1-1-1"] };
    const gone = { ...toRow(entry({ entry: "99" }), source, "2026-05-18"), status: "active" };
    const plan = planWrites([rows[0], rows[1], gone], [changed, rows[1]]);
    expect(plan.update).toEqual([changed]);
    expect(plan.markDeleted).toEqual([{ annex: "III", entry: "99" }]);
    expect(plan.insert).toEqual([]);
    // A stored entry that is already deleted and still unlisted is left as it is.
    expect(planWrites([{ ...gone, status: "deleted" }], []).markDeleted).toEqual([]);
  });

  it("a new version changes the version, hash and date on a row, and nothing else", () => {
    const next = { celex: "02009R1223-20260801", url: "https://publications.europa.eu/resource/cellar/y", sha256: "cd".repeat(32) };
    const plan = planWrites(rows, rows.map((r) => ({ ...r, source_version: next.celex, source_hash: next.sha256, source_url: next.url, last_verified: "2026-08-01" })));
    expect(plan.update).toHaveLength(2);
    expect(plan.insert).toEqual([]);
  });
});
