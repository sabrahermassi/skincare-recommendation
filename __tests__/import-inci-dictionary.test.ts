import {
  normaliseDictionaryName,
  planPrune,
  planWrites,
  safetyFrom,
  toRows,
} from "../scripts/import-inci-dictionary.mjs";

describe("safetyFrom", () => {
  it.each<[string, string]>([
    ["II/416", "avoid"],
    ["CMR1B II/656", "avoid"],
    // An allowed colourant banned for one use is not "prohibited in cosmetics".
    ["IV/66 [III/256] II/1329 as hair dye", "caution"],
    ["II/1136 -when used as a fragrance ingredient-", "avoid"],
    // Hydroquinone: banned everywhere but nail products. Annex III beside
    // Annex II must not soften it.
    ["II/1339 III/14", "avoid"],
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

  it("gives a name two entries print differently to neither, reports it, and carries on", () => {
    const conflicts: string[] = [];
    const rows = toRows(
      {
        "en:one": { name: { en: "shared" }, inci_functions: { en: "en:humectant" } },
        "en:two": { name: { en: "shared" }, inci_functions: { en: "en:emollient" } },
        "en:three": { name: { en: "shared" }, inci_functions: { en: "en:solvent" } },
      },
      conflicts
    );

    expect(conflicts).toEqual(["shared"]);
    expect(rows.map((row: { inci_name: string }) => row.inci_name).sort()).toEqual(["one", "three", "two"]);
  });

  it("lets the taxonomy's own key keep a name another entry merely prints", () => {
    const rows = toRows({
      "en:other": { name: { en: "glycerin" }, inci_functions: { en: "en:solvent" } },
      "en:glycerin": { name: { en: "Glycerin" }, inci_functions: { en: "en:humectant" } },
    });
    const glycerin = rows.find((row: { inci_name: string }) => row.inci_name === "glycerin");
    expect(glycerin.functions).toEqual(["humectant"]);
  });

  it.each([
    ["alias first", ["en:parfum", "en:fragrance"]],
    ["real entry first", ["en:fragrance", "en:parfum"]],
  ])("keeps a real entry's data over a hand-written alias for it (%s)", (_label: string, order: string[]) => {
    const entries: Record<string, object> = {
      "en:parfum": { name: { en: "Parfum" }, inci_functions: { en: "en:perfuming" } },
      "en:fragrance": { name: { en: "Fragrance" }, inci_functions: { en: "en:masking" } },
    };
    const rows = toRows(Object.fromEntries(order.map((key) => [key, entries[key]])));
    const fragrance = rows.find((row: { inci_name: string }) => row.inci_name === "fragrance");
    expect(fragrance.functions).toEqual(["masking"]);
  });
});

describe("planWrites", () => {
  const row = (inci_name: string, safety = "safe") => ({ inci_name, source: "obf", verified: true, safety, note: "n" });

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

  it("never drops a stricter rating silently: CosIng rows take it, hand-set rows are listed", () => {
    const rows = [row("banned", "avoid"), row("limited", "caution"), row("same", "caution"), row("fine")];
    const existing = new Map([
      ["banned", { verified: true, source: "cosing", safety: "safe" }],
      ["limited", { verified: true, source: "curated", safety: "safe" }],
      ["same", { verified: true, source: "curated", safety: "caution" }],
      ["fine", { verified: true, source: "cosing", safety: "safe" }],
    ]);

    const plan = planWrites(rows, existing);

    expect(plan.ingredients).toEqual([]);
    expect(plan.safetyOnly).toEqual([{ inci_name: "banned", safety: "avoid", note: "n", owner: "cosing" }]);
    expect(plan.reviewByHand.map((r: { inci_name: string }) => r.inci_name)).toEqual(["limited"]);
  });
});

describe("planPrune", () => {
  const existing = new Map(
    [
      { inci_name: "kept", verified: true, source: "obf" },
      { inci_name: "poly", verified: true, source: "obf" },
      { inci_name: "tris phosphite", verified: true, source: "obf" },
      { inci_name: "from cosing", verified: true, source: "cosing" },
      { inci_name: "a stub", verified: false, source: "unmatched" },
    ].map((r) => [r.inci_name, r])
  );
  const rows = [{ inci_name: "kept" }];

  it("deletes stale names nothing uses and returns used ones to unverified, touching only its own rows", () => {
    const plan = planPrune(rows, existing, new Set(["poly"]));
    expect(plan.stale.sort()).toEqual(["poly", "tris phosphite"]);
    expect(plan.remove).toEqual(["tris phosphite"]);
    expect(plan.demote).toEqual(["poly"]);
  });

  it("flags a run where most of the dictionary looks stale, which is a bad download", () => {
    expect(planPrune(rows, existing, new Set()).tooMany).toBe(true);
    const healthy = new Map(existing);
    for (let i = 0; i < 200; i += 1) healthy.set(`n${i}`, { inci_name: `n${i}`, verified: true, source: "obf" });
    const produced = [...healthy.keys()].filter((n) => n !== "poly").map((inci_name) => ({ inci_name }));
    expect(planPrune(produced, healthy, new Set()).tooMany).toBe(false);
  });
});
