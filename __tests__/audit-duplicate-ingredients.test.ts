import { casNumbers, findDuplicates, nameKey } from "../scripts/audit-duplicate-ingredients.mjs";

const row = (
  inci_name: string,
  extra: Partial<{ cas_number: string | null; functions: string[]; safety: string; source: string }> = {}
) => ({ inci_name, cas_number: null, functions: [], safety: "safe", source: "cosing", ...extra });

describe("nameKey", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(nameKey("PEG-40 Stearate")).toBe(nameKey("peg 40 stearate"));
    expect(nameKey("ci 77891")).toBe(nameKey("ci77891"));
  });

  it("keeps accented letters, so names that differ by one stay apart", () => {
    expect(nameKey("glycérine")).not.toBe(nameKey("glycrine"));
    expect(nameKey("Glycérine")).toBe(nameKey("glycérine"));
  });

  it("keeps digits, so different numbers stay different", () => {
    expect(nameKey("peg-4")).not.toBe(nameKey("peg-40"));
  });
});

describe("casNumbers", () => {
  it("reads every number in a blend cell, once each", () => {
    expect(casNumbers("8001-79-4 / 8002-13-9 ; 8001-79-4")).toEqual(["8001-79-4", "8002-13-9"]);
  });

  it("returns nothing for an empty or missing field", () => {
    expect(casNumbers(null)).toEqual([]);
    expect(casNumbers("")).toEqual([]);
  });
});

describe("findDuplicates", () => {
  it("groups names that differ only by spelling", () => {
    const groups = findDuplicates([row("peg-40 stearate"), row("peg 40 stearate"), row("glycerin")]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "spelling" });
    expect(groups[0].rows.map((r: { inci_name: string }) => r.inci_name)).toEqual(["peg 40 stearate", "peg-40 stearate"]);
  });

  it("groups different names that share a CAS number", () => {
    const groups = findDuplicates([
      row("vitamin c", { cas_number: "50-81-7" }),
      row("ascorbic acid", { cas_number: "50-81-7" }),
      row("glycerin", { cas_number: "56-81-5" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "cas", key: "50-81-7" });
  });

  it("puts a row with a blend of CAS numbers in each number's group", () => {
    const groups = findDuplicates([
      row("blend", { cas_number: "111-11-1 / 222-22-2" }),
      row("first", { cas_number: "111-11-1" }),
      row("second", { cas_number: "222-22-2" }),
    ]);

    expect(groups.map((g: { key: string }) => g.key).sort()).toEqual(["111-11-1", "222-22-2"]);
  });

  it("says when two rows disagree on safety or functions", () => {
    const [group] = findDuplicates([
      row("peg-40 stearate", { safety: "safe", functions: ["emulsifying"] }),
      row("peg 40 stearate", { safety: "caution", functions: ["cleansing"] }),
    ]);

    expect(group.conflicts).toHaveLength(2);
    expect(group.conflicts[0]).toMatch(/safety differs/);
    expect(group.conflicts[1]).toMatch(/functions differ/);
  });

  it("does not call rows a conflict when they agree, whatever order the functions are in", () => {
    const [group] = findDuplicates([
      row("peg-40 stearate", { functions: ["emulsifying", "cleansing"] }),
      row("peg 40 stearate", { functions: ["cleansing", "emulsifying"] }),
    ]);

    expect(group.conflicts).toEqual([]);
  });

  it("lists conflicts before agreeing groups, whatever the input order", () => {
    const groups = findDuplicates([
      row("aa b"),
      row("aa-b"),
      row("cc d", { safety: "safe" }),
      row("cc-d", { safety: "avoid" }),
    ]);

    expect(groups.map((g: { key: string }) => g.key)).toEqual(["ccd", "aab"]);
  });

  it("finds nothing when every name is distinct", () => {
    expect(findDuplicates([row("glycerin"), row("niacinamide")])).toEqual([]);
  });

  it("flags a spelling group as a conflict when the rows' CAS numbers share nothing", () => {
    // Optical isomers: "(+)-limonene" and "(-)-limonene" normalise to the
    // same spelling key but are distinct substances with distinct CAS numbers.
    const [group] = findDuplicates([
      row("(+)-limonene", { cas_number: "5989-27-5" }),
      row("(-)-limonene", { cas_number: "5989-54-8" }),
    ]);

    expect(group.conflicts).toHaveLength(1);
    expect(group.conflicts[0]).toMatch(/CAS numbers contradict/);
  });

  it("flags a spelling group as a conflict when only one row carries a CAS number", () => {
    // Nothing confirms the row with no CAS is the same substance as the one
    // that has it, rather than another case like (+)/(-)-limonene that
    // simply hasn't been matched to a CAS number yet.
    const [group] = findDuplicates([row("peg-40 stearate", { cas_number: "9004-99-3" }), row("peg 40 stearate")]);
    expect(group.conflicts).toHaveLength(1);
    expect(group.conflicts[0]).toMatch(/CAS number on file for some rows but not all/);
  });

  it("does not call a spelling group a conflict when neither row has a CAS number on file", () => {
    const [group] = findDuplicates([row("peg-40 stearate"), row("peg 40 stearate")]);
    expect(group.conflicts).toEqual([]);
  });

  it("does not call a spelling group a conflict when the rows share a CAS number, or share one in a blend", () => {
    const [same] = findDuplicates([
      row("peg-40 stearate", { cas_number: "9004-99-3" }),
      row("peg 40 stearate", { cas_number: "9004-99-3" }),
    ]);
    expect(same.conflicts).toEqual([]);

    const [blend] = findDuplicates([
      row("aa b", { cas_number: "111-11-1 / 222-22-2" }),
      row("aa-b", { cas_number: "222-22-2" }),
    ]);
    expect(blend.conflicts).toEqual([]);
  });

  it("flags incomplete CAS coverage in a group of three, even though most rows agree", () => {
    const [group] = findDuplicates([
      row("aa b", { cas_number: "111-11-1" }),
      row("aa-b", { cas_number: "111-11-1" }),
      row("aa.b"),
    ]);
    expect(group.conflicts).toHaveLength(1);
    expect(group.conflicts[0]).toMatch(/CAS number on file for some rows but not all/);
  });

  it("reports only the contradiction, not incomplete coverage too, when both are true", () => {
    const [group] = findDuplicates([
      row("(+)-limonene", { cas_number: "5989-27-5" }),
      row("(-)-limonene", { cas_number: "5989-54-8" }),
      row("Limonene."), // same spelling key ("limonene"), no CAS on file
    ]);
    expect(group.conflicts).toHaveLength(1);
    expect(group.conflicts[0]).toMatch(/CAS numbers contradict/);
  });
});
