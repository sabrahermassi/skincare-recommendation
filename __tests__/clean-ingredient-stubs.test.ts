import { classifyStub, plannedDeletions, planRepoints, usesOf } from "../scripts/clean-ingredient-stubs.mjs";

const known = new Set(["glycerin", "sodium hydroxide", "aqua", "tocopherol"]);
const aliases = new Map([["glycérine", "glycerin"]]);

describe("classifyStub keeps short real names", () => {
  it.each(["pca", "egf", "msm", "uv"])("does not call the real short name %s junk", (name: string) => {
    expect(classifyStub(name, known, aliases)).toBeNull();
  });

  it("does not call a short Korean name junk", () => {
    expect(classifyStub("정제수", known, aliases)).toBeNull();
  });

  it.each(["xq", "---", "12345"])("still calls %s junk", (name: string) => {
    expect(classifyStub(name, known, aliases)).toEqual({ kind: "junk" });
  });
});

describe("planRepoints", () => {
  const variants = new Map([
    ["ingrédients: aqua", "aqua"],
    ["glycérine", "glycerin"],
  ]);
  /** product id → name → every position it holds, as `main` builds it from the stored formulas. */
  const namesOf = (entries: Record<string, Record<string, number | number[]>>) =>
    new Map(
      Object.entries(entries).map(([id, names]) => [
        id,
        new Map(Object.entries(names).map(([name, at]) => [name, Array.isArray(at) ? at : [at]])),
      ])
    );

  it("points a product's stub row at the real name", () => {
    const uses = [{ product_id: "p1", inci_name: "glycérine", position: 3 }];
    const { repoint, dropRow } = planRepoints(variants, uses, namesOf({ p1: { glycérine: 3 } }));
    expect(repoint).toEqual([{ product_id: "p1", inci_name: "glycérine", position: 3, target: "glycerin" }]);
    expect(dropRow).toEqual([]);
  });

  it("drops the stub row when the real name is already listed earlier", () => {
    const uses = [{ product_id: "p1", inci_name: "glycérine", position: 10 }];
    const { repoint, dropRow } = planRepoints(variants, uses, namesOf({ p1: { glycerin: 1, glycérine: 10 } }));
    expect(repoint).toEqual([]);
    expect(dropRow).toEqual(uses);
  });

  it("keeps the earlier row when the stub comes first: repoints it and drops the real name's later row", () => {
    const uses = [{ product_id: "p1", inci_name: "glycérine", position: 1 }];
    const { repoint, dropRow } = planRepoints(variants, uses, namesOf({ p1: { glycérine: 1, glycerin: 10 } }));
    expect(repoint).toEqual([{ product_id: "p1", inci_name: "glycérine", position: 1, target: "glycerin" }]);
    expect(dropRow).toEqual([{ product_id: "p1", inci_name: "glycerin", position: 10 }]);
  });

  it("drops the stub when the real name already appears at several positions, one of them earlier", () => {
    // Glycerin at 1 and 10, the stub at 5: nothing may end up listed twice.
    const uses = [{ product_id: "p1", inci_name: "glycérine", position: 5 }];
    const { repoint, dropRow } = planRepoints(variants, uses, namesOf({ p1: { glycerin: [1, 10], glycérine: 5 } }));
    expect(repoint).toEqual([]);
    expect(dropRow).toEqual(uses);
  });

  it("drops every later row of the real name when the stub comes before all of them", () => {
    const uses = [{ product_id: "p1", inci_name: "glycérine", position: 1 }];
    const { repoint, dropRow } = planRepoints(variants, uses, namesOf({ p1: { glycérine: 1, glycerin: [5, 10] } }));
    expect(repoint).toEqual([{ product_id: "p1", inci_name: "glycérine", position: 1, target: "glycerin" }]);
    expect(dropRow).toEqual([
      { product_id: "p1", inci_name: "glycerin", position: 5 },
      { product_id: "p1", inci_name: "glycerin", position: 10 },
    ]);
  });

  it("keeps one row, at the earliest position, when two stubs of the same ingredient share a product", () => {
    const both = new Map([
      ["glycérine", "glycerin"],
      ["glycerine", "glycerin"],
    ]);
    const uses = [
      { product_id: "p1", inci_name: "glycérine", position: 1 },
      { product_id: "p1", inci_name: "glycerine", position: 2 },
    ];
    const { repoint, dropRow } = planRepoints(both, uses, namesOf({ p1: { glycérine: 1, glycerine: 2 } }));
    expect(repoint).toEqual([{ product_id: "p1", inci_name: "glycérine", position: 1, target: "glycerin" }]);
    expect(dropRow).toEqual([{ product_id: "p1", inci_name: "glycerine", position: 2 }]);
  });

  it("plans each product on its own", () => {
    const uses = [
      { product_id: "p1", inci_name: "glycérine", position: 5 },
      { product_id: "p2", inci_name: "glycérine", position: 5 },
    ];
    const { repoint, dropRow } = planRepoints(
      variants,
      uses,
      namesOf({ p1: { glycerin: 1, glycérine: 5 }, p2: { glycérine: 5 } })
    );
    expect(dropRow.map((r) => r.product_id)).toEqual(["p1"]);
    expect(repoint.map((r) => r.product_id)).toEqual(["p2"]);
  });
});

describe("usesOf", () => {
  /** A stand-in for supabase-js's builder over a fixed list of rows, honouring `.in` and `.range`. */
  function fakeDb(rows: { product_id: string; inci_name: string; position: number }[]) {
    return {
      from: () => {
        let names: string[] = [];
        const builder = {
          select: () => builder,
          in: (_col: string, values: string[]) => {
            names = values;
            return builder;
          },
          order: () => builder,
          range: async (from: number, to: number) => ({
            data: rows.filter((r) => names.includes(r.inci_name)).slice(from, to + 1),
            error: null,
          }),
        };
        return builder;
      },
    };
  }

  it("reads past the 1000-row page limit instead of silently truncating", async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => ({ product_id: `p${i}`, inci_name: "glycérine", position: 1 }));
    expect(await usesOf(fakeDb(rows), ["glycérine"])).toHaveLength(2300);
  });

  it("throws rather than returning a partial read when the query fails", async () => {
    const failing = {
      from: () => {
        const b = { select: () => b, in: () => b, order: () => b, range: async () => ({ data: null, error: { message: "boom" } }) };
        return b;
      },
    };
    await expect(usesOf(failing, ["glycérine"])).rejects.toThrow(/boom/);
  });
});

describe("plannedDeletions", () => {
  it("deletes every variant and every unused stub, but keeps unresolved names a product uses", () => {
    const stubs = ["glycérine", "old unknown", "used unknown"];
    const variants = new Map([["glycérine", "glycerin"]]);
    const uses = [
      { product_id: "p1", inci_name: "glycérine", position: 1 },
      { product_id: "p1", inci_name: "used unknown", position: 2 },
    ];

    expect([...plannedDeletions(stubs, variants, uses)].sort()).toEqual(["glycérine", "old unknown"]);
  });

  it("also deletes a confirmed non-ingredient a product still carries", () => {
    const stubs = ["ingredients", "used unknown"];
    const uses = [
      { product_id: "p1", inci_name: "ingredients", position: 0 },
      { product_id: "p1", inci_name: "used unknown", position: 1 },
    ];
    expect([...plannedDeletions(stubs, new Map(), uses, new Set(["ingredients"]))]).toEqual(["ingredients"]);
  });
});

describe("classifyStub", () => {
  it("points a spelling variant at the verified name", () => {
    expect(classifyStub("sodium hydroxyde", known, aliases)).toEqual({ kind: "variant", target: "sodium hydroxide" });
  });

  it("points an other-language name at the verified name", () => {
    expect(classifyStub("glycérine", known, aliases)).toEqual({ kind: "variant", target: "glycerin" });
  });

  it("points a heading glued to one real ingredient at that ingredient", () => {
    expect(classifyStub("ingrédients: aqua", known, aliases)).toEqual({ kind: "variant", target: "aqua" });
    expect(classifyStub("sastojci: aqua", known, aliases)).toEqual({ kind: "variant", target: "aqua" });
  });

  it("never collapses several ingredients into one of them", () => {
    const dict = new Set(["aqua", "acrylates crosspolymer", "dimethicone crosspolymer", "tocopherol", "sodium hyaluronate", "hexanediol", "extract"]);
    expect(classifyStub("acrylates/dimethicone crosspolymer", dict, aliases)?.kind).not.toBe("variant");
    expect(classifyStub("tocopherol. sodium hyaluronate", dict, aliases)?.kind).not.toBe("variant");
    expect(classifyStub("lavandula oil/extract", dict, aliases)?.kind).not.toBe("variant");
    expect(classifyStub("2 hexanediol", dict, aliases)?.kind).not.toBe("variant");
  });

  it("collapses one ingredient written several ways, and packaging text after a name", () => {
    const dict = new Set(["aqua", "water", "phenoxyethanol"]);
    expect(classifyStub("aqua/water/eau", dict, aliases)).toEqual({ kind: "variant", target: "aqua" });
    expect(classifyStub("phenoxyethanol. tube carton", dict, aliases)).toEqual({ kind: "variant", target: "phenoxyethanol" });
  });

  it("calls a web address, a file name and a bare number junk", () => {
    expect(classifyStub("www.example.com", known, aliases)).toEqual({ kind: "junk" });
    expect(classifyStub("photo123.jpg", known, aliases)).toEqual({ kind: "junk" });
    expect(classifyStub("12345", known, aliases)).toEqual({ kind: "junk" });
  });

  it("leaves a real-looking name nobody lists alone", () => {
    expect(classifyStub("arnebia nobilis root extract", known, aliases)).toBeNull();
  });

  it("does not repoint broad names even when an alias source offers one possible target", () => {
    const dictionary = new Set(["tricaprylin", "cymbopogon schoenanthus oil"]);
    const broadAliases = new Map([
      ["caprylic triglyceride", "tricaprylin"],
      ["lemongrass oil", "cymbopogon schoenanthus oil"],
    ]);
    expect(classifyStub("caprylic triglyceride", dictionary, broadAliases)).toBeNull();
    expect(classifyStub("lemongrass oil", dictionary, broadAliases)).toBeNull();
  });

  it("marks text a person confirmed is packaging as not an ingredient, apart from rule-found junk", () => {
    expect(classifyStub("ingredients", known, aliases)).toEqual({ kind: "not-ingredient" });
    expect(classifyStub("korea distribuitor: promo plus srl", known, aliases)).toEqual({ kind: "not-ingredient" });
  });

  it("stores water written on its own under the same name as every other product's water", () => {
    // "eau" can be a verified dictionary name in its own right; the stub still
    // belongs with "aqua", like "aqua / water / eau" does.
    const dictionary = new Set([...known, "eau"]);
    expect(classifyStub("eau)", dictionary, aliases)).toEqual({ kind: "variant", target: "aqua" });
    expect(classifyStub("agua", dictionary, aliases)).toEqual({ kind: "variant", target: "aqua" });
    expect(classifyStub("eau thermale", dictionary, aliases)).toBeNull();
  });

  it("does not call a long real name junk for its length", () => {
    const long = "acetobacter aspergillus lactobacillus leuconostoc pediococcus saccharomyces zygosaccharomyces citrus unshiu fruit ferment extract";
    expect(classifyStub(long, known, aliases)).toBeNull();
  });
});
