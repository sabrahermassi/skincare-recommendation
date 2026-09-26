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
    "Dentifrice blancheur",
    "Faux ongles adhésifs",
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
