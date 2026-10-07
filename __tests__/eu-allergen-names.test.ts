import { readFileSync } from "fs";
import { join } from "path";

import type { Ingredient, SkinProfile } from "@/data/types";
import { EU_ALLERGEN_COSING_SOURCE, euAllergenEntry } from "@/lib/eu-allergens";
import { ALLERGEN_CHARGE, matchProduct, resetScoreCache } from "@/lib/matching";
import { euAllergenFor } from "@/lib/safety";
import { EMPTY_PROFILE } from "@/store/useAppStore";
import { toIngredients } from "../scripts/import-cosing.mjs";

/**
 * #439: the EU allergen names the dictionary did not hold. `scripts/data/eu-allergen-names.csv`
 * is what `import:cosing` is run on; every row was read off its CosIng record, and
 * the entry number is the one Annex III prints the name under.
 */

const FILE = join(__dirname, "..", "scripts", "data", "eu-allergen-names.csv");

/** The file's rows as objects keyed by its header. Fields with a comma are quoted; none holds a quote. */
function rows(): Record<string, string>[] {
  const [header, ...lines] = readFileSync(FILE, "utf8").trim().split("\n").map((line) => line.match(/("[^"]*"|[^,]*)(,|$)/g)!.slice(0, -1).map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "")));
  return lines.map((cells) => Object.fromEntries(header.map((column, i) => [column, cells[i] ?? ""])));
}

const written = (row: Record<string, string>): { inci_name: string; cas_number: string | null; functions: string[] } =>
  toIngredients([{ name: row["INCI name"], cas: row["CAS No"], functions: row.Function }]).parsed[0];

describe("the EU allergen names file", () => {
  const file = rows();

  it("has the columns the CosIng import reads, and a source for every row", () => {
    expect(file).toHaveLength(11);
    for (const row of file) {
      expect(row["INCI name"]).toMatch(/^[A-Z0-9][A-Z0-9 ,'()/-]+$/);
      expect(row["COSING Ref No"]).toMatch(/^\d+$/);
      expect(row.Source).toBe(`${EU_ALLERGEN_COSING_SOURCE.url}/details/${row["COSING Ref No"]}`);
      expect(row["CAS No"]).toMatch(/^$|^\d{2,7}-\d{2}-\d( \/ \d{2,7}-\d{2}-\d)*$/);
      expect(row["Printed in the regulation as"].length).toBeGreaterThan(2);
    }
    expect(new Set(file.map((row) => row["INCI name"])).size).toBe(file.length);
  });

  it("writes each row under a name the allergen list recognises, at the entry the file states", () => {
    for (const row of file) {
      const { inci_name } = written(row);
      expect(euAllergenEntry(inci_name)?.entry).toBe(row["Annex III entry"]);
      // The regulation's own printing of it is the same entry.
      expect(euAllergenEntry(row["Printed in the regulation as"])?.entry).toBe(row["Annex III entry"]);
    }
  });

  it("never invents a rating: the import writes the name, CAS number and CosIng's functions only", () => {
    for (const row of file) expect(Object.keys(written(row)).sort()).toEqual(["cas_number", "functions", "inci_name", "source", "verified"]);
    expect(written(file.find((row) => row["INCI name"] === "POGOSTEMON CABLIN OIL")!)).toMatchObject({ inci_name: "pogostemon cablin oil", cas_number: "8014-09-3", functions: ["fragrance"] });
  });
});

describe("a newly added fragrance name", () => {
  const ing = (name: string, verified = true): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified });
  const filler = ["water", "glycerin", "propanediol", "carbomer", "xanthan gum", "panthenol"].map((name) => ing(name));
  const profile = (sensitivity: SkinProfile["sensitivity"]): SkinProfile => ({ ...EMPTY_PROFILE, concerns: ["dullness"], baseSkinType: "normal", sensitivity });
  const result = (target: Ingredient, sensitivity: SkinProfile["sensitivity"]) => {
    resetScoreCache();
    return matchProduct({ type: "serum", ingredients: [...filler.slice(0, 3), target, ...filler.slice(3)] }, profile(sensitivity));
  };

  it("is an EU allergen once the dictionary verifies it, and not before", () => {
    expect(euAllergenFor(ing("pogostemon cablin oil"))).toMatchObject({ entry: "365", kind: "fragrance" });
    expect(euAllergenFor(ing("pogostemon cablin oil", false))).toBeNull();
    expect(euAllergenFor(ing("dimethyl phenethyl acetate"))).toMatchObject({ entry: "334" });
  });

  it("charges sensitive skin the allergen charge, and nobody else", () => {
    const patchouli = ing("pogostemon cablin oil");
    expect(result(patchouli, "none").irritants).toEqual([]);
    for (const sensitivity of ["some", "high", null] as const) {
      const scored = result(patchouli, sensitivity);
      expect(scored.irritants).toEqual(["pogostemon cablin oil"]);
      expect(scored.breakdown.irritationPenalty).toBeGreaterThan(0);
      expect(scored.breakdown.irritationPenalty).toBeLessThanOrEqual(ALLERGEN_CHARGE * 1.6);
    }
    // As an unverified stub, which is what it was, it cost nothing.
    expect(result(ing("pogostemon cablin oil", false), "high").irritants).toEqual([]);
  });

  it("charges a product that lists CosIng's spelling of a printed name", () => {
    expect(result(ing("acetylcedrene"), "some").irritants).toEqual(["acetylcedrene"]);
    expect(result(ing("alpha-cedrene"), "some").irritants).toEqual([]);
  });
});
