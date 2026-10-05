import { parseIngredientBlock, rejoinSplitNames, splitBlend } from "@/lib/inci";
import { parseInci } from "../scripts/lib/inci-parse.mjs";

/**
 * A copolymer's name must reach the dictionary whole. Four staging products carried
 * `acrylamide` or `acrylonitrile` (Annex II) only because the parser read a polymer name as
 * several ingredients and folded the first half into its first word. The labels below are the
 * real Open Beauty Facts text of those four products, each wrong in a different way: a slash
 * name with a typo in its tail, a stray comma inside the name, a comma before its last word,
 * and a blend joined with an ampersand.
 */

const DICTIONARY = new Set([
  "aqua",
  "water",
  "glycerin",
  "dimethicone",
  "silica",
  "sodium",
  "cetyl alcohol",
  "benzyl alcohol",
  "dicaprylyl carbonate",
  "phenyl trimethicone",
  "soybean oil peg-8 esters",
  "trideceth-6",
  "potassium sorbate",
  "prunus armeniaca kernel oil",
  "acrylamide",
  "acrylonitrile",
  "acrylamide/sodium acryloyldimethyltaurate copolymer",
  "acrylamide/sodium acrylate copolymer",
  "acrylamide/ammonium acrylate copolymer",
  "acrylonitrile/methyl methacrylate/vinylidene chloride copolymer",
]);

const parsers: [string, (text: string) => string[]][] = [
  ["lib/inci.ts", (text) => parseIngredientBlock(text, DICTIONARY).map((p) => p.inci_name)],
  ["scripts/lib/inci-parse.mjs", (text) => parseInci(text, DICTIONARY, [], undefined).map((p: { inci_name: string }) => p.inci_name)],
];

describe.each(parsers)("%s", (_file: string, parse: (text: string) => string[]) => {
  it("keeps a slash name with a typo in its tail whole, and corrects it", () => {
    const names = parse("Dicaprylyl Carbonate, Acrylamide/Ammonium Acrylate Copolymere, Aqua, Glycerin, Benzyl Alcohol");
    expect(names).toContain("acrylamide/ammonium acrylate copolymer");
    expect(names).not.toContain("acrylamide");
  });

  it("puts a name back together when a stray comma cut it in the middle", () => {
    const names = parse("Aqua/Water, Dimethicone, Glycerin, Silica, Acrylamide/Sodium, Acryloyldimethyltaurate Copolymer, Cetyl alcohol");
    expect(names).toContain("acrylamide/sodium acryloyldimethyltaurate copolymer");
    expect(names).not.toContain("acrylamide");
    expect(names).not.toContain("sodium");
  });

  it("puts a name back together when a comma split off its last word", () => {
    const names = parse("Polysorbate 80, Acrylonitrile/Methyl Ethacrylate/Vinylidene Chloride, Copolymer, Cetyl Alcohol, Glycerin, Aqua");
    expect(names).toContain("acrylonitrile/methyl methacrylate/vinylidene chloride copolymer");
    expect(names).not.toContain("acrylonitrile");
    expect(names).not.toContain("copolymer");
  });

  it("splits an ampersand blend into its known names", () => {
    const names = parse("Phenyl Trimethicone, ACRYLAMIDE/SODIUM ACRYLATE COPOLYMER & TRIDECETH-6, SOYBEAN OIL PEG-8 ESTERS, WATER");
    expect(names).toEqual(["phenyl trimethicone", "acrylamide/sodium acrylate copolymer", "trideceth-6", "soybean oil peg-8 esters", "water"]);
  });

  it("still reads a bare acrylamide or acrylonitrile as itself", () => {
    expect(parse("Aqua, Glycerin, Acrylamide, Dimethicone, Silica")).toContain("acrylamide");
    expect(parse("Aqua, Glycerin, Acrylonitrile, Dimethicone, Silica")).toContain("acrylonitrile");
  });

  it("leaves a plain slash pair and a slash list as they were read before", () => {
    expect(parse("Aqua/Water, Glycerin, Dimethicone, Silica")).toEqual(["aqua", "glycerin", "dimethicone", "silica"]);
    expect(parse("Aqua / Glycerin, Dimethicone, Silica, Cetyl Alcohol")).toEqual(["aqua", "glycerin", "dimethicone", "silica", "cetyl alcohol"]);
  });

  it("keeps a slash list of known names whole of a following lone 'polymer'", () => {
    // Joining it would write the unknown "aqua / glycerin polymer" and lose both recognised names.
    const names = parse("Aqua / Glycerin, Polymer, Dimethicone, Silica");
    expect(names).toEqual(expect.arrayContaining(["aqua", "glycerin", "dimethicone", "silica"]));
    expect(names).not.toContain("aqua / glycerin polymer");
  });

  it("doesn't join a lone 'copolymer' to a token with no slash in it", () => {
    const names = parse("Aqua, Glycerin, Dimethicone, Silica, Copolymer");
    expect(names).not.toContain("silica copolymer");
  });

  it("leaves a blend alone when one part is not a known name", () => {
    const names = parse("Aqua, Glycerin, Dimethicone, Enzoate & Potassium Sorbate");
    expect(names).not.toContain("potassium sorbate");
  });
});

describe("rejoinSplitNames", () => {
  it("joins a slash token to the next one when together they are a known name", () => {
    expect(rejoinSplitNames(["aqua", "acrylamide/sodium", "acryloyldimethyltaurate copolymer", "glycerin"], DICTIONARY)).toEqual([
      "aqua",
      "acrylamide/sodium acryloyldimethyltaurate copolymer",
      "glycerin",
    ]);
  });

  it("joins a slash token to a lone polymer word, known or not", () => {
    for (const word of ["copolymer", "crosspolymer", "polymer"]) {
      expect(rejoinSplitNames(["x/y chloride", word], DICTIONARY)).toEqual([`x/y chloride ${word}`]);
    }
  });

  it("leaves a slash list of known names alone, even before a lone polymer word", () => {
    expect(rejoinSplitNames(["aqua / glycerin", "polymer"], DICTIONARY)).toEqual(["aqua / glycerin", "polymer"]);
    expect(rejoinSplitNames(["aqua/water", "copolymer"], DICTIONARY)).toEqual(["aqua/water", "copolymer"]);
  });

  it("leaves tokens alone otherwise", () => {
    // No slash in the first token.
    expect(rejoinSplitNames(["silica", "copolymer"], DICTIONARY)).toEqual(["silica", "copolymer"]);
    // The slash token is already a name the dictionary holds.
    expect(rejoinSplitNames(["acrylamide/sodium acrylate copolymer", "copolymer"], DICTIONARY)).toEqual(["acrylamide/sodium acrylate copolymer", "copolymer"]);
    // What follows is not the end of a polymer name and the two together are not a known name.
    expect(rejoinSplitNames(["aqua/water", "glycerin"], DICTIONARY)).toEqual(["aqua/water", "glycerin"]);
    expect(rejoinSplitNames([], DICTIONARY)).toEqual([]);
  });
});

describe("splitBlend", () => {
  it("splits an ampersand blend when every part is a known name", () => {
    expect(splitBlend("acrylamide/sodium acrylate copolymer & trideceth-6", DICTIONARY)).toEqual(["acrylamide/sodium acrylate copolymer", "trideceth-6"]);
  });

  it("returns the token whole when a part is unknown, or there is no blend", () => {
    expect(splitBlend("enzoate & potassium sorbate", DICTIONARY)).toEqual(["enzoate & potassium sorbate"]);
    expect(splitBlend("glycerin", DICTIONARY)).toEqual(["glycerin"]);
    expect(splitBlend("glycerin & ", DICTIONARY)).toEqual(["glycerin & "]);
  });
});
