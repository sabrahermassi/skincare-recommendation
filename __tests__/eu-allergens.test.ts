import { COSING_SPELLINGS, EU_ALLERGEN_CONDITION, EU_ALLERGEN_COSING_SOURCE, EU_ALLERGEN_ENTRIES, EU_ALLERGEN_SOURCE, euAllergenEntry } from "@/lib/eu-allergens";

/**
 * #407: the Annex III allergen and allergy-warning entries, read off the
 * consolidated regulation. These tests keep the constant well-formed; what is
 * in it was read from the regulation, not decided here.
 */

const names = EU_ALLERGEN_ENTRIES.flatMap((entry) => entry.names);

describe("the EU allergen list", () => {
  it("holds the fragrance entries the regulation labels, the 45 that 2023/1545 added, and the allergy warnings", () => {
    const fragrance = EU_ALLERGEN_ENTRIES.filter((e) => e.kind === "fragrance");
    expect(fragrance).toHaveLength(81);
    expect(fragrance.filter((e) => e.regulation === "Regulation (EU) 2023/1545")).toHaveLength(45);
    // The 24 entries that stand within 45 and 67 to 92 (68, 79 and 83 no longer exist).
    const original = fragrance.map((e) => Number(e.entry)).filter((n) => n === 45 || (n >= 67 && n <= 92));
    expect(original).toHaveLength(24);
    expect([68, 79, 83].filter((n) => original.includes(n))).toEqual([]);
    expect(EU_ALLERGEN_ENTRIES.filter((e) => e.kind === "allergy-warning").length).toBeGreaterThan(90);
  });

  it("keeps every name as the regulation prints it: no fragments, no padding", () => {
    for (const name of names) {
      expect(name).toBe(name.trim());
      expect(name).not.toMatch(/%|^\([a-z]\)|;|\n| \+ |^and |[a-z0-9]- [A-Za-z]/);
      expect(name.length).toBeGreaterThan(2);
    }
  });

  it("looks a name up by its lower-case form, once", () => {
    const lower = names.map((name) => name.toLowerCase());
    // p-phenylenediamine is printed under both 8a and 8b; any other repeat would be a mistake.
    const repeats = lower.filter((name, i) => lower.indexOf(name) !== i);
    expect([...new Set(repeats)].sort()).toEqual(["p-phenylenediamine", "p-phenylenediamine hcl", "p-phenylenediamine sulphate"]);
    // A name is never both a fragrance allergen and an allergy warning.
    for (const name of new Set(lower)) {
      expect(new Set(EU_ALLERGEN_ENTRIES.filter((e) => e.names.some((n) => n.toLowerCase() === name)).map((e) => e.kind)).size).toBe(1);
    }
  });

  it("finds a name from the original list, a 2023 addition and a hair-dye warning, exactly", () => {
    expect(euAllergenEntry("Limonene")).toMatchObject({ entry: "88", kind: "fragrance" });
    expect(euAllergenEntry("  HEXYL CINNAMAL ")).toMatchObject({ entry: "87", kind: "fragrance" });
    expect(euAllergenEntry("linalyl acetate")).toMatchObject({ entry: "337", regulation: "Regulation (EU) 2023/1545" });
    expect(euAllergenEntry("rose ketone 4 (damascenone)")).toMatchObject({ entry: "157" });
    expect(euAllergenEntry("resorcinol")).toMatchObject({ entry: "22", kind: "allergy-warning" });
  });

  it("never matches a pattern, a plural or a different oil", () => {
    expect(euAllergenEntry("parfum")).toBeUndefined();
    expect(euAllergenEntry("fragrance")).toBeUndefined();
    expect(euAllergenEntry("limonenes")).toBeUndefined();
    expect(euAllergenEntry("rosa canina fruit oil")).toBeUndefined();
    expect(euAllergenEntry("pinus pinaster bark extract")).toBeUndefined();
    expect(euAllergenEntry("sodium hydroxide")).toBeUndefined();
  });

  it("marks benzyl alcohol, and only benzyl alcohol, as exempt, and says why", () => {
    const exempt = EU_ALLERGEN_ENTRIES.filter((e) => e.exempt);
    expect(exempt.map((e) => e.entry)).toEqual(["45"]);
    expect(euAllergenEntry("benzyl alcohol")?.exempt).toMatch(/preservative/);
  });

  it("says where every name came from and when", () => {
    expect(EU_ALLERGEN_SOURCE.url).toMatch(/^https:\/\/eur-lex\.europa\.eu\//);
    expect(EU_ALLERGEN_SOURCE.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(EU_ALLERGEN_SOURCE.text).toMatch(/18\.05\.2026/);
    expect(Object.keys(EU_ALLERGEN_CONDITION).sort()).toEqual(["allergy-warning", "fragrance"]);
  });
});

/**
 * #439: the dictionary is keyed on CosIng's INCI names, with brackets written as
 * spaces. A printed name that differs from CosIng's only in spelling used to match nothing.
 */
describe("a name the dictionary holds under CosIng's spelling", () => {
  const printed = new Set(names.map((name) => name.toLowerCase()));

  it("lists each spelling once, against an entry on the list, with the CosIng record it was read from", () => {
    const seen = new Set<string>();
    for (const spelling of COSING_SPELLINGS) {
      expect(EU_ALLERGEN_ENTRIES.some((e) => e.entry === spelling.entry)).toBe(true);
      expect(spelling.cosing).toBeGreaterThan(0);
      expect(spelling.cas === null || /^\d{2,7}-\d{2}-\d$/.test(spelling.cas)).toBe(true);
      expect(spelling.name).toBe(spelling.name.trim());
      // A spelling the regulation already prints needs no row here.
      expect(printed.has(spelling.name.toLowerCase())).toBe(false);
      expect(seen.has(spelling.name.toLowerCase())).toBe(false);
      seen.add(spelling.name.toLowerCase());
      expect(euAllergenEntry(spelling.name)?.entry).toBe(spelling.entry);
    }
    // Only the one record with no CAS number of its own.
    expect(COSING_SPELLINGS.filter((s) => s.cas === null).map((s) => s.name)).toEqual(["Hydroxypropyl-p-Phenylenediamine HCl"]);
    expect(EU_ALLERGEN_COSING_SOURCE.url).toMatch(/^https:\/\/ec\.europa\.eu\//);
    expect(EU_ALLERGEN_COSING_SOURCE.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches the dictionary's row for it, and keeps the entry's kind", () => {
    expect(euAllergenEntry("acetylcedrene")).toMatchObject({ entry: "327", kind: "fragrance", regulation: "Regulation (EU) 2023/1545" });
    expect(euAllergenEntry("rose ketone-4")).toMatchObject({ entry: "157", kind: "fragrance" });
    // CosIng's Damascenone record also covers a CAS number entry 157 does not print.
    expect(euAllergenEntry("damascenone")).toBeUndefined();
    expect(euAllergenEntry("p-phenylenediamine sulfate")).toMatchObject({ entry: "8a", kind: "allergy-warning" });
    expect(euAllergenEntry("phenyl methyl pyrazolone")).toMatchObject({ entry: "228", kind: "allergy-warning" });
  });

  it("reads brackets the way the dictionary stores them", () => {
    // What `normaliseDictionaryName` makes of the printed names.
    expect(euAllergenEntry("hydroxypropyl bis n-hydroxyethyl-p-phenylenediamine hcl")).toMatchObject({ entry: "239" });
    expect(euAllergenEntry("1,3-bis- 2,4-diaminophenoxy propane hcl")).toMatchObject({ entry: "226" });
    expect(euAllergenEntry("n,n-bis 2-hydroxyethyl -p-phenylenediamine sulfate")).toMatchObject({ entry: "198" });
    expect(euAllergenEntry("2,6-diamino-3- pyridin-3-yl azo pyridine")).toMatchObject({ entry: "277" });
    expect(euAllergenEntry("Hydroxypropyl bis(N-hydroxyethyl-p-phenylenediamine) HCl")).toMatchObject({ entry: "239" });
  });

  it("still never matches a relative of a listed name", () => {
    for (const name of ["cedrene", "alpha-cedrene", "rose ketones", "rose ketone", "phenylenediamine", "m-phenylenediamine sulfate"]) {
      expect(euAllergenEntry(name)).toBeUndefined();
    }
  });
});

