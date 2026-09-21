import { toIngredients } from "../scripts/import-cosing.mjs";

const record = (name: string, functions = "SKIN CONDITIONING") => ({ name, cas: "", functions });
const names = (records: ReturnType<typeof record>[]) =>
  toIngredients(records).parsed.map((row: { inci_name: string }) => row.inci_name);

describe("toIngredients", () => {
  it("keeps bracketed chemistry, so different ingredients never share the false name 'poly'", () => {
    const produced = names([
      record("POLY(C30-45 OLEFIN)", "VISCOSITY CONTROLLING"),
      record("POLY(C4-12 OLEFIN)", "FILM FORMING"),
      record("HYDROGENATED POLY(C6-12 OLEFIN)"),
      record("HYDROGENATED POLY(C6-14 OLEFIN)"),
    ]);

    expect(produced).toEqual(
      expect.arrayContaining(["poly c30-45 olefin", "poly c4-12 olefin", "hydrogenated poly c6-12 olefin"])
    );
    expect(produced).not.toContain("poly");
    expect(produced).not.toContain("hydrogenated poly");
  });

  it("adds the spelling a scanned label asks for when one ingredient alone reads that way", () => {
    // The label parser drops bracketed text: "Tris(nonylphenyl)phosphite" on a
    // label is looked up as "tris phosphite".
    const { parsed } = toIngredients([record("TRIS(NONYLPHENYL)PHOSPHITE", "ANTIOXIDANT")]);
    const byLabel = parsed.find((row: { inci_name: string }) => row.inci_name === "tris phosphite");

    expect(byLabel).toMatchObject({ functions: ["antioxidant"], source: "cosing", verified: true });
    expect(parsed.map((row: { inci_name: string }) => row.inci_name)).toContain("tris nonylphenyl phosphite");
  });

  it("never gives a label spelling to a different ingredient that really has that name", () => {
    const { parsed } = toIngredients([
      record("TRIS(NONYLPHENYL)PHOSPHITE", "ANTIOXIDANT"),
      record("TRIS PHOSPHITE", "CHELATING"),
    ]);
    const named = parsed.filter((row: { inci_name: string }) => row.inci_name === "tris phosphite");

    expect(named).toHaveLength(1);
    expect(named[0].functions).toEqual(["chelating"]);
  });

  it("leaves out a label spelling several Open Beauty Facts ingredients share", () => {
    const produced = toIngredients(
      [record("POTASSIUM OLIVOYL (HYDROLYZED OAT PROTEIN)")],
      new Set(["potassium olivoyl"])
    ).parsed.map((row: { inci_name: string }) => row.inci_name);

    expect(produced).toEqual(["potassium olivoyl hydrolyzed oat protein"]);
  });

  it("counts the same ingredient listed twice as one owner of its label spelling", () => {
    const produced = names([record("TRIS(NONYLPHENYL)PHOSPHITE"), record("TRIS(NONYLPHENYL)PHOSPHITE")]);
    expect(produced).toContain("tris phosphite");
  });

  it("skips a row with no usable name", () => {
    expect(toIngredients([record(""), record("GLYCERIN")]).skipped).toBe(1);
  });
});
