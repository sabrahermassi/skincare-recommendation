import { borateClass, matchRegulatory, parseAnnexRef, planRegulatoryWrites, pruneIsSane, toCsv, usableRecords } from "../scripts/lib/regulatory-match.mjs";

/**
 * #457: which dictionary ingredient an Annex entry is about. The order is CAS, EC, CosIng's own link, a named
 * class; the regulation text is the authority, so where CosIng disagrees with it the pair is held back for the
 * owner instead of matched. Each trap in the issue has a case here. The entries are shaped like the staging
 * `regulatory_entries` rows; the CosIng records are fixtures, not a claim about what CosIng says today.
 */

type Entry = { annex: string; entry: string; wording: string; cas_numbers: string[]; ec_numbers: string[]; members: { cas: string[]; ec: string[] }[]; status: string };
const entry = (annex: string, no: string, wording: string, cas: string[] = [], ec: string[] = [], members: Entry["members"] = []): Entry => ({
  annex, entry: no, wording, cas_numbers: cas, ec_numbers: ec, members, status: "active",
});
const record = (ref: string, inci: string, cas: string[] = [], ec: string[] = [], refs: string[] = []) => ({
  cosing_ref: ref, kind: "ingredient", inci_name: inci, cas_numbers: cas, ec_numbers: ec, annex_refs: refs,
});

const ENTRIES = [
  entry("II", "1339", "Hydroquinone", ["123-31-9"], ["204-617-8"]),
  entry("III", "14", "Hydroquinone", ["123-31-9"], ["204-617-8"]),
  entry("II", "1375", "Isobutylparaben", ["4247-02-3"], ["224-208-8"], [{ cas: ["84930-15-4"], ec: ["284-595-4"] }]),
  entry("II", "1380", "HICC", ["51414-25-6", "31906-04-4"], ["257-187-9", "250-863-4"]),
  entry("II", "1394", "Diboron trioxide", ["1303-86-2"], ["215-125-8"]),
  entry("II", "1395", "Boric acid", ["10043-35-3", "11113-50-1"], ["233-139-2", "234-343-4"]),
  entry("II", "1396", "Borates, tetraborates, octaborates and boric acid salts and esters", [], [], [
    { cas: ["1330-43-4"], ec: ["215-540-4"] },
    { cas: ["12008-41-2"], ec: ["234-541-0"] },
  ]),
  entry("II", "1397", "Perborates and peroxoborates", ["13517-20-9"], ["239-172-9"], [{ cas: ["37244-98-7"], ec: ["234-390-0"] }]),
  entry("II", "1389", "Dichloromethane", ["75-09-2"], ["200-838-9"]),
  entry("II", "1666", "Butylphenyl methylpropional", ["80-54-6"], ["201-289-8"]),
  // An entry with no CAS or EC to check anything against.
  entry("II", "5001", "A substance known only by name"),
  // Two entries that share a CAS for no good reason, and an entry a record lists extra numbers against.
  entry("II", "6001", "Damascenone", ["23696-85-7"], []),
];

const run = (records: ReturnType<typeof record>[], ingredients: string[], productCounts = new Map<string, number>()) =>
  matchRegulatory({ entries: ENTRIES, records, ingredients, productCounts });
const pairs = (r: ReturnType<typeof run>) => r.matches.map((m) => `${m.inci_name} -> ${m.annex}/${m.entry} (${m.matched_by})`).sort();

describe("the order of the match", () => {
  it("matches by CAS first, and a substance in two entries is matched to both", () => {
    const r = run([record("1", "Hydroquinone", ["123-31-9"], ["204-617-8"], ["II/1339", "III/14"])], ["Hydroquinone"]);
    expect(pairs(r)).toEqual(["Hydroquinone -> II/1339 (cas)", "Hydroquinone -> III/14 (cas)"]);
    expect(r.held).toEqual([]);
  });

  it("falls to EC when the record has no CAS", () => {
    const r = run([record("2", "Isobutylparaben", [], ["224-208-8"])], ["Isobutylparaben"]);
    expect(pairs(r)).toEqual(["Isobutylparaben -> II/1375 (ec)"]);
  });

  it("falls to CosIng's own link for an entry with no numbers, and says so", () => {
    const r = run([record("3", "Mystery Extract", [], [], ["II/5001"])], ["Mystery Extract"]);
    expect(pairs(r)).toEqual(["Mystery Extract -> II/5001 (cosing)"]);
    expect(r.matches[0].flags).toEqual(["matched by CosIng's link alone", "the entry has no CAS or EC to check it against"]);
  });

  it("then to a class the entry names: a CAS that is one of its listed members", () => {
    const r = run([record("4", "Sodium Borate", ["1330-43-4"], ["215-540-4"])], ["Sodium Borate"]);
    expect(pairs(r)).toEqual(["Sodium Borate -> II/1396 (class)"]);
  });

  it("looks a name up without caring about case or spacing", () => {
    const r = run([record("5", "Boric  Acid", ["10043-35-3"])], ["boric acid"]);
    expect(pairs(r)).toEqual(["boric acid -> II/1395 (cas)"]);
  });

  it("matches nothing for an ingredient CosIng does not know, and counts it", () => {
    const r = run([], ["Aqua"]);
    expect(r.matches).toEqual([]);
    expect(r.ingredientsWithRecord).toBe(0);
    expect(r.ingredientsWithoutRecord).toBe(1);
  });
});

describe("where CosIng disagrees with the regulation, the pair is held back", () => {
  it("holds an old entry number, and the match the numbers alone would make (lilial)", () => {
    // CosIng still cites III/83; the current text has no such entry and lilial is II/1666.
    const r = run([record("6", "Butylphenyl Methylpropional", ["80-54-6"], ["201-289-8"], ["III/83"])], ["Butylphenyl Methylpropional"]);
    expect(r.matches).toEqual([]);
    expect(r.held.map((h) => `${h.annex}/${h.entry}`).sort()).toEqual(["II/1666", "III/83"]);
    expect(r.held.find((h) => h.entry === "1666")?.reason).toMatch(/does not list/);
  });

  it("holds a record that lists a CAS the entry does not (Damascenone, #443)", () => {
    const r = run([record("7", "Damascenone", ["23696-85-7", "23726-93-4"])], ["Damascenone"]);
    expect(r.matches).toEqual([]);
    expect(r.held).toHaveLength(1);
    expect(r.held[0].reason).toBe("CosIng lists CAS numbers the entry does not: 23726-93-4");
  });

  it("holds a record whose citation and numbers point at different entries", () => {
    const r = run([record("8", "Hydroquinone", ["123-31-9"], [], ["II/1666"])], ["Hydroquinone"]);
    expect(r.matches).toEqual([]);
    expect(r.held.map((h) => `${h.annex}/${h.entry}`).sort()).toEqual(["II/1339", "II/1666", "III/14"]);
  });

  it("holds potassium borate when its CAS is not among the entry's members, instead of matching the class by name", () => {
    const r = run([record("9", "Potassium Borate", ["1332-77-0"])], ["Potassium Borate"]);
    expect(r.matches).toEqual([]);
    expect(r.held).toHaveLength(1);
    expect(r.held[0]).toMatchObject({ annex: "II", entry: "1396" });
    expect(r.held[0].reason).toMatch(/not among the entry's listed members/);
  });

  it("holds a class match whose record lists a number no member lists (review)", () => {
    // 1330-43-4 is a member of 1396; 9999-99-9 is nobody's.
    const r = run([record("20", "Sodium Borate", ["1330-43-4", "9999-99-9"])], ["Sodium Borate"]);
    expect(r.matches).toEqual([]);
    expect(r.held).toHaveLength(1);
    expect(r.held[0]).toMatchObject({ annex: "II", entry: "1396" });
    expect(r.held[0].reason).toMatch(/9999-99-9/);
  });

  it("does not hold a record that lists the parent's number and a salt's: both are the entry's", () => {
    const r = run([record("21", "Isobutylparaben", ["4247-02-3", "84930-15-4"])], ["Isobutylparaben"]);
    expect(pairs(r)).toEqual(["Isobutylparaben -> II/1375 (cas)"]);
    expect(r.held).toEqual([]);
  });

  it("matches a borate by the class name when CosIng gives it no numbers to contradict it", () => {
    const r = run([record("10", "Sodium Borate")], ["Sodium Borate", "Sodium Perborate"]);
    expect(pairs(r)).toEqual(["Sodium Borate -> II/1396 (class)", "Sodium Perborate -> II/1397 (class)"]);
    // A name CosIng does not know is matched on the class name alone, and flagged for a look; a record with no numbers is not.
    expect(r.matches.find((m) => m.inci_name === "Sodium Borate")?.flags).toEqual([]);
    expect(r.matches.find((m) => m.inci_name === "Sodium Perborate")?.flags).toEqual(["matched by the class name alone"]);
  });

  it("does not take boric acid itself for a borate: that is entry 1395, by CAS", () => {
    expect(borateClass("Boric Acid")).toBeNull();
    expect(borateClass("Sodium Tetraborate")).toBe("1396");
    expect(borateClass("Sodium Perborate")).toBe("1397");
    expect(borateClass("Aqua")).toBeNull();
  });
});

describe("what goes to the owner besides the held rows", () => {
  it("flags one CAS shared by several dictionary names, on every match made through it", () => {
    const r = run([record("11", "Hydroquinone", ["123-31-9"]), record("12", "Hydroquinone (Cosmetic Grade)", ["123-31-9"])], ["Hydroquinone", "Hydroquinone (Cosmetic Grade)"]);
    expect(r.matches).toHaveLength(4);
    expect(r.matches.every((m) => m.flags.some((f) => /shared by 2 dictionary names/.test(f)))).toBe(true);
  });

  it("lists the entries that have no CAS or EC at all", () => {
    const r = run([], []);
    expect(r.entriesWithoutIds.map((e) => `${e.annex}/${e.entry}`)).toEqual(["II/5001"]);
  });

  it("lists, as the review rows, only Annex II matches an ingredient in at least one product is behind", () => {
    const counts = new Map([["Hydroquinone", 12], ["Boric Acid", 0]]);
    const r = run([record("1", "Hydroquinone", ["123-31-9"]), record("2", "Boric Acid", ["10043-35-3"])], ["Hydroquinone", "Boric Acid"], counts);
    // III/14 is Annex III and boric acid is in no product: neither is listed.
    expect(r.reviewRows.map((row) => `${row.entry}:${row.ingredient}:${row.products}`)).toEqual(["1339:Hydroquinone:12"]);
    expect(r.reviewRows[0]).toMatchObject({ wording: "Hydroquinone", cas: "123-31-9", matched_by: "cas", cosing_ref: "1" });
  });

  it("puts a held Annex II pair in the review rows too, with its reason", () => {
    const r = run([record("7", "Damascenone", ["23696-85-7", "23726-93-4"])], ["Damascenone"], new Map([["Damascenone", 3]]));
    expect(r.reviewRows).toHaveLength(1);
    expect(r.reviewRows[0]).toMatchObject({ matched_by: "held back", products: 3 });
    expect(r.reviewRows[0].why).toMatch(/lists CAS numbers the entry does not/);
  });

  it("counts each way a match was made, and the held rows", () => {
    const r = run(
      [record("1", "Hydroquinone", ["123-31-9"]), record("2", "Isobutylparaben", [], ["224-208-8"]), record("3", "Sodium Borate", ["1330-43-4"]), record("4", "Mystery Extract", [], [], ["II/5001"]), record("7", "Damascenone", ["23696-85-7", "23726-93-4"])],
      ["Hydroquinone", "Isobutylparaben", "Sodium Borate", "Mystery Extract", "Damascenone"],
    );
    expect(r.counts).toEqual({ cas: 2, ec: 1, cosing: 1, class: 1, held: 1 });
  });
});

describe("the entries the owner has already verified by hand", () => {
  // `SAFETY_NOTICE_ENTRIES` in lib/safety.ts: each fires today for its own ingredient. The matcher must
  // tie the same ingredient to the same entry, by the numbers CosIng gives it.
  const CASES: [string, string, string[], string[]][] = [
    ["1339", "Hydroquinone", ["123-31-9"], ["204-617-8"]],
    ["1375", "Isobutylparaben", ["4247-02-3"], ["224-208-8"]],
    ["1380", "Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde", ["51414-25-6"], ["257-187-9"]],
    ["1394", "Diboron Trioxide", ["1303-86-2"], ["215-125-8"]],
    ["1395", "Boric Acid", ["10043-35-3"], ["233-139-2"]],
    ["1396", "Sodium Borate", ["1330-43-4"], ["215-540-4"]],
    ["1397", "Sodium Perborate", ["37244-98-7"], ["234-390-0"]],
    ["1389", "Dichloromethane", ["75-09-2"], ["200-838-9"]],
    ["1666", "Butylphenyl Methylpropional", ["80-54-6"], ["201-289-8"]],
  ];

  it.each(CASES)("entry II/%s is matched to %s", (no: string, name: string, cas: string[], ec: string[]) => {
    const r = run([record(`h-${no}`, name, cas, ec)], [name]);
    const hit = r.matches.filter((m) => m.annex === "II" && m.entry === no);
    expect(hit).toHaveLength(1);
    expect(r.held).toEqual([]);
  });
});

describe("the review list as a file", () => {
  it("quotes every field and keeps a leading = + - or @ from being read as a formula", () => {
    const csv = toCsv([{ entry: "1339", wording: 'He said "no", then =cmd', ingredient: "+SUM(1)", cas: "", matched_by: "cas", products: 2, cosing_ref: "", why: "" }]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toBe('"entry","wording","ingredient","cas","matched_by","products","cosing_ref","why"');
    expect(row).toBe('"1339","He said ""no"", then =cmd","\'+SUM(1)","","cas","2","",""');
  });
});

describe("what is written", () => {
  const match = (name: string, annex: string, no: string, by: string) => ({ inci_name: name, annex, entry: no, matched_by: by });

  it("inserts a new match, rewrites an unreviewed one that changed, and leaves one that did not", () => {
    const stored = [
      { inci_name: "A", annex: "II", entry: "1", matched_by: "ec", reviewed_by: null },
      { inci_name: "B", annex: "II", entry: "2", matched_by: "cas", reviewed_by: null },
    ];
    const plan = planRegulatoryWrites(stored, [match("A", "II", "1", "cas"), match("B", "II", "2", "cas"), match("C", "II", "3", "class")] as never);
    expect(plan.upserts).toEqual([match("A", "II", "1", "cas"), match("C", "II", "3", "class")]);
    expect(plan.unchanged).toBe(1);
  });

  it("never rewrites a row a person reviewed or made by hand, and reports the disagreement", () => {
    const stored = [
      { inci_name: "A", annex: "II", entry: "1", matched_by: "ec", reviewed_by: "owner" },
      { inci_name: "B", annex: "II", entry: "2", matched_by: "manual", reviewed_by: null },
      { inci_name: "C", annex: "II", entry: "3", matched_by: "cas", reviewed_by: "owner" },
    ];
    const plan = planRegulatoryWrites(stored, [match("A", "II", "1", "cas"), match("B", "II", "2", "cas")] as never);
    expect(plan.upserts).toEqual([]);
    expect(plan.conflicts.map((c) => `${c.inci_name}:${c.now}`).sort()).toEqual(["A:cas", "C:null"]);
  });

  it("calls an automatic row the new matches no longer make stale, and does not delete it by itself", () => {
    const stored = [{ inci_name: "A", annex: "II", entry: "1", matched_by: "cas", reviewed_by: null }];
    const plan = planRegulatoryWrites(stored, []);
    expect(plan.stale).toEqual([{ inci_name: "A", annex: "II", entry: "1" }]);
    expect(plan.upserts).toEqual([]);
  });
});

describe("CosIng's way of citing an entry", () => {
  it("reads II/1339 and III/14, and nothing else", () => {
    expect(parseAnnexRef("II/1339")).toEqual({ annex: "II", entry: "1339" });
    expect(parseAnnexRef(" III / 15A ")).toEqual({ annex: "III", entry: "15a" });
    expect(parseAnnexRef("V/12")).toBeNull();
    expect(parseAnnexRef("")).toBeNull();
    expect(parseAnnexRef(null)).toBeNull();
  });
});

describe("what counts as the CosIng copy, and when a prune is a bad read", () => {
  it("counts ingredient records with an INCI name, not substance rows or nameless ones", () => {
    const rows = [record("1", "A"), { ...record("2", "B"), kind: "substance" }, { ...record("3", ""), inci_name: null }, { ...record("4", "C"), kind: undefined }];
    expect(usableRecords(rows).map((r: { cosing_ref: string }) => r.cosing_ref)).toEqual(["1", "4"]);
  });

  it("refuses a prune that would delete most of the automatic rows, and allows a small one", () => {
    const stored = Array.from({ length: 100 }, (_, i) => ({ inci_name: `n${i}`, annex: "II", entry: "1", matched_by: "cas", reviewed_by: null }));
    expect(pruneIsSane(stored, { stale: stored.slice(0, 60) } as never)).toBe(false);
    expect(pruneIsSane(stored, { stale: stored.slice(0, 5) } as never)).toBe(true);
  });

  it("does not count reviewed or hand-made rows toward the automatic ones", () => {
    const stored = [
      ...Array.from({ length: 20 }, (_, i) => ({ inci_name: `n${i}`, annex: "II", entry: "1", matched_by: "cas", reviewed_by: null })),
      ...Array.from({ length: 80 }, (_, i) => ({ inci_name: `m${i}`, annex: "II", entry: "2", matched_by: "manual", reviewed_by: null })),
    ];
    expect(pruneIsSane(stored, { stale: stored.slice(0, 15) } as never)).toBe(false);
  });
});
