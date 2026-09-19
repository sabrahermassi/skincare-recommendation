import { classifyStub } from "../scripts/clean-ingredient-stubs.mjs";

const known = new Set(["glycerin", "sodium hydroxide", "aqua", "tocopherol"]);
const aliases = new Map([["glycérine", "glycerin"]]);

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
