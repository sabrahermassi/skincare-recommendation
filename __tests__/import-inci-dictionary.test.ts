import {
  normaliseDictionaryName,
  planWrites,
  safetyFrom,
  toRows,
} from "../scripts/import-inci-dictionary.mjs";

describe("safetyFrom", () => {
  it.each<[string, string]>([
    ["II/416", "avoid"],
    ["CMR1B II/656", "avoid"],
    ["IV/66 [III/256] II/1329 as hair dye", "avoid"],
    ["III/61", "caution"],
    ["Annex III/I/257 - Directive 2012/21/EU", "caution"],
    ["V/54 III/65", "caution"],
    ["IV/125", "safe"],
    ["V/12", "safe"],
    ["VI/18", "safe"],
  ])("maps %s to %s", (restriction: string, safety: string) => {
    expect(safetyFrom({ en: restriction }).safety).toBe(safety);
  });

  it("does not invent a restriction when the source has none", () => {
    expect(safetyFrom(undefined)).toEqual({ safety: "safe", note: null });
  });
});

describe("dictionary-name normalisation", () => {
  it("keeps chemically meaningful text inside parentheses", () => {
    expect(normaliseDictionaryName("POLY(DIMER GRAPESEED OIL)")).toBe("poly dimer grapeseed oil");
    expect(normaliseDictionaryName("TRIS(NONYLPHENYL)PHOSPHITE")).toBe("tris nonylphenyl phosphite");
  });

  it("does not collapse distinct parenthesised ingredients onto a generic alias", () => {
    const rows = toRows({
      "en:poly-dimer-grapeseed-oil": {
        name: { en: "POLY(DIMER GRAPESEED OIL)" },
        inci_functions: { en: "en:film-forming" },
      },
      "en:poly-c30-45-olefin": {
        name: { en: "POLY(C30-45 OLEFIN)" },
        inci_functions: { en: "en:skin-conditioning" },
      },
    });

    const names = rows.map((row: { inci_name: string }) => row.inci_name);
    expect(names).toEqual(
      expect.arrayContaining(["poly dimer grapeseed oil", "poly c30 45 olefin", "poly c30-45 olefin"])
    );
    expect(names).not.toContain("poly");
  });

  it("rejects a conflicting alias instead of silently keeping arbitrary data", () => {
    expect(() =>
      toRows({
        "en:one": { name: { en: "shared" }, inci_functions: { en: "en:humectant" } },
        "en:two": { name: { en: "shared" }, inci_functions: { en: "en:emollient" } },
      })
    ).toThrow("Conflicting ingredient alias in taxonomy: shared");
  });
});

describe("planWrites", () => {
  const row = (inci_name: string) => ({ inci_name, source: "obf", verified: true });

  it("writes new rows, promotes stubs, refreshes OBF, and preserves other verified sources", () => {
    const rows = [row("new"), row("stub"), row("obf-owned"), row("curated-owned")];
    const existing = new Map([
      ["stub", { verified: false, source: "curated" }],
      ["obf-owned", { verified: true, source: "obf" }],
      ["curated-owned", { verified: true, source: "curated" }],
    ]);

    const plan = planWrites(rows, existing);

    expect(plan.fresh.map(({ inci_name }: { inci_name: string }) => inci_name)).toEqual(["new"]);
    expect(plan.promoted.map(({ inci_name }: { inci_name: string }) => inci_name)).toEqual(["stub"]);
    expect(plan.refreshed.map(({ inci_name }: { inci_name: string }) => inci_name)).toEqual(["obf-owned"]);
    expect(plan.untouched).toBe(1);
    expect(plan.ingredients.map(({ inci_name }: { inci_name: string }) => inci_name)).not.toContain("curated-owned");
  });
});
