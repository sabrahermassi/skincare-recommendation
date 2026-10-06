import { nonSkincareReason } from "../scripts/lib/non-skincare.mjs";

/**
 * The rule that decides which catalogue rows are deleted and which imports
 * are refused (#299). Too wide deletes good products, so the "kept" cases
 * matter as much as the "removed" ones.
 */
describe("nonSkincareReason", () => {
  // Real names seen in the staging catalogue during device QA.
  it.each([
    "Dissolvant pour les ongles",
    "Dissolvant express",
    "Dissolvant douceur",
    "Murphy Oil Soap Multi-use Wood Cleaning Spray",
    "Nail Polish Remover Acetone Free",
    "Nagellackentferner",
    "Kruidvat Nagellakremover", // Dutch, kept by the first import over the whole export
    "Dentifrice blancheur",
    "Faux ongles adhésifs",
    "Multi-Surface Cleaner",
    "Glass Cleaning Wipes",
    // Hair dye (#420): named for what is sold.
    "Permanent Hair Colour Kit 4.0 Brown",
    "Garnier Hair Dye Cream",
    "Coloration permanente Blond Clair",
    "Teinture pour cheveux",
    "Schwarzkopf Haarfarbe Natur",
    "Tinte para el cabello castaño",
    "Saç boyası kiti",
  ])("removes %p", (name: string) => {
    expect(nonSkincareReason({ name })).not.toBeNull();
  });

  it.each([
    "Nutri Specific Démaquillant Lacté", // make-up remover — skincare
    "Garnier Nem Bombası Canlandırıcı Kağıt Maske 28 gr", // non-English name — kept by decision
    "Aveeno ultra-calming sensitive skin foaming cleanser",
    "Palmer's Cocoa Butter Formula Geconcentreerde Crème",
    "Hand & Nail cream", // hand care
    "Crème Mains et Ongles", // French hand & nail cream (#312 review)
    "Soin fortifiant ongles et cuticules", // nail care, not polish
    "Gentle Exfoliating SA Cleanser",
    "Shampooing douceur", // hair is scored on purpose
    "Glass Skin Cleansing Oil", // K-beauty "glass skin" (#312 review)
    "Glass Skin Refining Cleanser",
    "Cedar Wood Face Cleanser",
    "Skin Surface Cleansing Foam",
    // Hair care for coloured hair is hair care (#420): kept, as #299 keeps hair.
    "Elvital Mask Color Vive Silver 150ml",
    "Hair Colour Protect Shampoo",
    "Color Protect Conditioner",
    "Hair Serum with Argan Oil",
    "Scalp Scrub Exfoliator",
    "Dye-free Mineral Sunscreen SPF 50",
    "Tinted Moisturizer SPF 30", // a tint is not a dye
  ])("keeps %p", (name: string) => {
    expect(nonSkincareReason({ name })).toBeNull();
  });

  it("uses OBF categories when the import has them", () => {
    expect(nonSkincareReason({ name: "Express", categories: ["en:cleansers", "en:nail-polish-removers"] })).toMatch(
      /category/
    );
    expect(nonSkincareReason({ name: "Gentle Wash", categories: ["en:face", "en:cleansers"] })).toBeNull();
  });
});

/**
 * A hair-dye kit is named by its shade, so its formula is what shows (#420).
 * Names below are the INCI names as the consolidated regulation prints them;
 * the first list is the shape of the real staging rows (an Excellence-style
 * permanent colour, a toner kit).
 */
describe("nonSkincareReason on the ingredient list (hair dye)", () => {
  const kit = ["aqua", "cetearyl alcohol", "ammonium hydroxide", "toluene-2,5-diamine", "resorcinol", "2,4-diaminophenoxyethanol hcl", "m-aminophenol", "parfum"];

  it("removes an oxidation-dye kit whatever it is named or typed as", () => {
    expect(nonSkincareReason({ name: "Excellence Creme Ultra 4.11 Ash Brown", ingredients: kit })).toMatch(/hair dye ingredients/);
    expect(nonSkincareReason({ name: "Blonde It Up Toner", ingredients: ["aqua", "toluene-2,5-diamine sulfate", "resorcinol", "m-aminophenol"] })).toMatch(/hair dye/);
  });

  it("removes a kit on one primary intermediate alone, or on two couplers", () => {
    expect(nonSkincareReason({ name: "Lash tint", ingredients: ["aqua", "p-phenylenediamine"] })).toMatch(/hair dye/);
    expect(nonSkincareReason({ name: "Colour", ingredients: ["aqua", "resorcinol", "m-aminophenol"] })).toMatch(/hair dye/);
  });

  it("reads a salt spelt either way, and any case", () => {
    expect(nonSkincareReason({ name: "x", ingredients: ["Aqua", "P-Phenylenediamine Sulphate"] })).toMatch(/hair dye/);
  });

  it("counts m-aminophenol and its salt once, so two spellings of one dye are not a kit", () => {
    expect(nonSkincareReason({ name: "x", ingredients: ["aqua", "m-aminophenol", "m-aminophenol hcl"] })).toBeNull();
  });

  it.each([
    ["resorcinol on its own (an acne or dandruff wash)", ["aqua", "resorcinol", "salicylic acid"]],
    ["a skin lightener that shares the stem", ["aqua", "phenylethyl resorcinol", "hexylresorcinol", "4-butylresorcinol"]],
    ["a moisturiser with ethoxydiglycol, a solvent also in hair dye", ["aqua", "ethoxydiglycol", "glycerin"]],
    ["a colour-depositing hair mask's direct dyes", ["aqua", "acid violet 43", "basic yellow 87", "hc blue no 15"]],
    ["no list at all", []],
  ])("keeps %s", (_label: string, ingredients: string[]) => {
    expect(nonSkincareReason({ name: "Gentle Cream", ingredients })).toBeNull();
  });

  it("still judges by name alone when no ingredients are given", () => {
    expect(nonSkincareReason({ name: "Excellence Creme Ultra 4.11 Ash Brown" })).toBeNull();
  });

  it("uses OBF's hair-dye category", () => {
    expect(nonSkincareReason({ name: "Shade 4", categories: ["en:hair", "en:hair-dyes"] })).toMatch(/category/);
    expect(nonSkincareReason({ name: "Shade 4", categories: ["en:hair", "en:hair-care"] })).toBeNull();
  });
});
