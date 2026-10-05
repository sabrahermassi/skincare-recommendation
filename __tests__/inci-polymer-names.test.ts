import { parseIngredientBlock } from "@/lib/inci";
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

  it("doesn't join a lone 'copolymer' to a token with no slash in it", () => {
    const names = parse("Aqua, Glycerin, Dimethicone, Silica, Copolymer");
    expect(names).not.toContain("silica copolymer");
  });

  it("leaves a blend alone when one part is not a known name", () => {
    const names = parse("Aqua, Glycerin, Dimethicone, Enzoate & Potassium Sorbate");
    expect(names).not.toContain("potassium sorbate");
  });
});
