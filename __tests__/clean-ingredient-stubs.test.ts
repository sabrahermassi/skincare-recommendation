import { classifyStub, planRepoints } from "../scripts/clean-ingredient-stubs.mjs";

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

  it("points a product's stub row at the real name", () => {
    const uses = [{ product_id: "p1", inci_name: "glycérine", position: 3 }];
    const { repoint, dropRow } = planRepoints(variants, uses, new Map([["p1", new Set(["glycérine"])]]));
    expect(repoint).toEqual([{ product_id: "p1", inci_name: "glycérine", position: 3, target: "glycerin" }]);
    expect(dropRow).toEqual([]);
  });

  it("drops the stub row instead when the product already lists the real name", () => {
    const uses = [{ product_id: "p1", inci_name: "glycérine", position: 3 }];
    const { repoint, dropRow } = planRepoints(variants, uses, new Map([["p1", new Set(["glycérine", "glycerin"])]]));
    expect(repoint).toEqual([]);
    expect(dropRow).toEqual(uses);
  });

  it("keeps one row when two stubs of the same ingredient sit in one product", () => {
    const both = new Map([
      ["glycérine", "glycerin"],
      ["glycerine", "glycerin"],
    ]);
    const uses = [
      { product_id: "p1", inci_name: "glycérine", position: 1 },
      { product_id: "p1", inci_name: "glycerine", position: 2 },
    ];
    const { repoint, dropRow } = planRepoints(both, uses, new Map([["p1", new Set(["glycérine", "glycerine"])]]));
    expect(repoint).toHaveLength(1);
    expect(dropRow).toHaveLength(1);
  });

  it("plans each product on its own", () => {
    const uses = [
      { product_id: "p1", inci_name: "glycérine", position: 1 },
      { product_id: "p2", inci_name: "glycérine", position: 1 },
    ];
    const names = new Map([
      ["p1", new Set(["glycérine", "glycerin"])],
      ["p2", new Set(["glycérine"])],
    ]);
    const { repoint, dropRow } = planRepoints(variants, uses, names);
    expect(dropRow.map((r) => r.product_id)).toEqual(["p1"]);
    expect(repoint.map((r) => r.product_id)).toEqual(["p2"]);
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

  it("does not call a long real name junk for its length", () => {
    const long = "acetobacter aspergillus lactobacillus leuconostoc pediococcus saccharomyces zygosaccharomyces citrus unshiu fruit ferment extract";
    expect(classifyStub(long, known, aliases)).toBeNull();
  });
});
