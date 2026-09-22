import { safetyFrom } from "../scripts/import-inci-dictionary.mjs";
import { annexCited, checkSafetyLabels } from "../scripts/audit-safety-labels.mjs";

const row = (inci_name: string, safety: string, note: string | null = null, source = "obf") => ({
  inci_name,
  safety,
  note,
  source,
});

describe("annexCited", () => {
  it("reads the annex text back out of every note shape the importer writes", () => {
    for (const restriction of ["II/416", "III/61", "IV/66 [III/256] II/1329", "V/54"]) {
      const { note } = safetyFrom(restriction);
      expect(annexCited(note)).toBe(restriction);
    }
  });

  it("returns null for a note that cites no annex, or no note", () => {
    expect(annexCited("Hand-set after a dermatologist review")).toBeNull();
    expect(annexCited(null)).toBeNull();
    expect(annexCited("")).toBeNull();
  });
});

describe("checkSafetyLabels", () => {
  it("counts labels by level", () => {
    const result = checkSafetyLabels([row("a", "safe"), row("b", "safe"), row("c", "caution", safetyFrom("III/1").note)]);
    expect(result.total).toBe(3);
    expect(result.bySafety).toEqual({ safe: 2, caution: 1 });
  });

  it("counts a safe label with no note as a default, per source", () => {
    const result = checkSafetyLabels([
      row("a", "safe", null, "cosing"),
      row("b", "safe", null, "cosing"),
      row("c", "safe", null, "obf"),
      row("d", "safe", safetyFrom("V/54").note, "obf"),
    ]);
    expect(result.defaultSafe).toEqual({ cosing: 2, obf: 1 });
  });

  it("accepts labels that match their own citation", () => {
    const result = checkSafetyLabels([
      row("banned", "avoid", safetyFrom("II/416").note),
      row("restricted", "caution", safetyFrom("III/61").note),
      row("allowed colourant", "safe", safetyFrom("IV/66").note),
      row("banned for some uses only", "caution", safetyFrom("IV/66 II/1329").note),
    ]);
    expect(result.mismatches).toEqual([]);
    expect(result.unexplained).toEqual([]);
  });

  it("finds a safe label whose note cites a prohibition", () => {
    const note = safetyFrom("II/416").note;
    const result = checkSafetyLabels([row("banned but marked safe", "safe", note)]);
    expect(result.mismatches).toEqual([
      { inci_name: "banned but marked safe", source: "obf", stored: "safe", expected: "avoid", note },
    ]);
  });

  it("finds a label softer than its citation, and one stricter than it", () => {
    const result = checkSafetyLabels([
      row("softened", "caution", safetyFrom("II/1").note),
      row("hardened", "avoid", safetyFrom("III/1").note),
    ]);
    expect(result.mismatches.map((m) => [m.inci_name, m.stored, m.expected])).toEqual([
      ["hardened", "avoid", "caution"],
      ["softened", "caution", "avoid"],
    ]);
  });

  it("lists an avoid or caution label that has no note, but not a safe one", () => {
    const result = checkSafetyLabels([
      row("no reason", "avoid"),
      row("also no reason", "caution", null, "curated"),
      row("fine", "safe"),
      row("hand reason", "avoid", "Banned by the owner after review", "curated"),
    ]);
    expect(result.unexplained.map((r) => r.inci_name)).toEqual(["also no reason", "no reason"]);
  });
});
