import { partitionGroups, pickCanonical, planMerge, planSynonymRepoints } from "../scripts/fix-duplicate-ingredients.mjs";

const row = (
  inci_name: string,
  extra: Partial<{ cas_number: string | null; functions: string[]; safety: string; source: string }> = {}
) => ({ inci_name, cas_number: null, functions: [], safety: "safe", source: "cosing", ...extra });

const spellingGroup = (rows: ReturnType<typeof row>[], conflicts: string[] = []) => ({
  kind: "spelling" as const,
  key: "k",
  rows,
  conflicts,
});
const casGroup = (rows: ReturnType<typeof row>[], conflicts: string[] = []) => ({
  kind: "cas" as const,
  key: "123-45-6",
  rows,
  conflicts,
});

describe("partitionGroups", () => {
  it("keeps a conflict-free spelling group as mergeable", () => {
    const group = spellingGroup([row("PEG-40 Stearate"), row("peg 40 stearate")]);
    expect(partitionGroups([group])).toEqual({ mergeable: [group], skipped: [] });
  });

  it("never merges a CAS group, even with no conflict", () => {
    const group = casGroup([row("a"), row("b")]);
    expect(partitionGroups([group])).toEqual({ mergeable: [], skipped: [group] });
  });

  it("never merges a group with a conflict, spelling or CAS", () => {
    const spelling = spellingGroup([row("a", { safety: "safe" }), row("A", { safety: "caution" })], ["safety differs"]);
    const cas = casGroup([row("c"), row("d")], ["functions differ"]);
    expect(partitionGroups([spelling, cas])).toEqual({ mergeable: [], skipped: [spelling, cas] });
  });
});

describe("pickCanonical", () => {
  it("keeps the name more products use", () => {
    const group = spellingGroup([row("PEG-40 Stearate"), row("peg 40 stearate")]);
    const useCount = new Map([
      ["PEG-40 Stearate", 3],
      ["peg 40 stearate", 40],
    ]);
    expect(pickCanonical(group, useCount)).toEqual({ keep: "peg 40 stearate", retire: ["PEG-40 Stearate"] });
  });

  it("breaks a tie by locale order (localeCompare, not plain code points)", () => {
    const group = spellingGroup([row("Water"), row("water")]);
    const useCount = new Map([
      ["Water", 5],
      ["water", 5],
    ]);
    expect(pickCanonical(group, useCount)).toEqual({ keep: "water", retire: ["Water"] });
  });

  it("treats an unread name as zero uses", () => {
    const group = spellingGroup([row("a"), row("b")]);
    expect(pickCanonical(group, new Map([["b", 1]]))).toEqual({ keep: "b", retire: ["a"] });
  });

  it("retires every other name in a group of three", () => {
    const group = spellingGroup([row("a"), row("b"), row("c")]);
    const useCount = new Map([
      ["a", 1],
      ["b", 9],
      ["c", 2],
    ]);
    expect(pickCanonical(group, useCount)).toEqual({ keep: "b", retire: ["c", "a"] });
  });
});

describe("planMerge", () => {
  it("maps every retired name across several groups to its kept name", () => {
    const groups = [
      spellingGroup([row("PEG-40 Stearate"), row("peg 40 stearate")]),
      spellingGroup([row("Aqua"), row("AQUA"), row("aqua ")]),
    ];
    const useCount = new Map([
      ["peg 40 stearate", 10],
      ["AQUA", 2],
      ["aqua ", 1],
    ]);
    expect(planMerge(groups, useCount)).toEqual(
      new Map([
        ["PEG-40 Stearate", "peg 40 stearate"],
        ["aqua ", "AQUA"],
        ["Aqua", "AQUA"],
      ])
    );
  });
});

describe("planSynonymRepoints", () => {
  const variants = new Map([
    ["PEG-40 Stearate", "peg 40 stearate"],
    ["Aqua", "AQUA"],
  ]);

  it("repoints a synonym row onto the kept name", () => {
    const rows = [{ synonym: "peg-40-stearate", inci_name: "PEG-40 Stearate" }];
    expect(planSynonymRepoints(rows, variants)).toEqual({
      drop: [],
      repoint: new Map([["peg 40 stearate", ["peg-40-stearate"]]]),
    });
  });

  it("groups several repointed synonyms by their kept name", () => {
    const rows = [
      { synonym: "peg-40-stearate", inci_name: "PEG-40 Stearate" },
      { synonym: "polyethylene glycol 40 stearate", inci_name: "PEG-40 Stearate" },
      { synonym: "water fr", inci_name: "Aqua" },
    ];
    expect(planSynonymRepoints(rows, variants)).toEqual({
      drop: [],
      repoint: new Map([
        ["peg 40 stearate", ["peg-40-stearate", "polyethylene glycol 40 stearate"]],
        ["AQUA", ["water fr"]],
      ]),
    });
  });

  it("drops a synonym whose text already equals the kept name, instead of repointing it onto itself", () => {
    // synonym_is_not_its_own_target would refuse an update that left this
    // row with synonym === inci_name.
    const rows = [{ synonym: "AQUA", inci_name: "Aqua" }];
    expect(planSynonymRepoints(rows, variants)).toEqual({ drop: ["AQUA"], repoint: new Map() });
  });

  it("ignores a row whose target is not one of the retired names", () => {
    const rows = [{ synonym: "glycérine", inci_name: "glycerin" }];
    expect(planSynonymRepoints(rows, variants)).toEqual({ drop: [], repoint: new Map() });
  });
});
