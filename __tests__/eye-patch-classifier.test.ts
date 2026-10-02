import { guessType } from "../supabase/functions/_shared/product-type-classifier.mjs";

const typeOf = (name: string) => guessType([], name);

describe("eye-patch classification", () => {
  it.each([
    "Dear Klairs Blue Caffeine Full Cover Eye patch",
    "Abib PDRN retinal eye patch Glow jelly",
    "Eye Pad Mask Paradise Punch",
    "Eye_patch",
    "EYE-PATCH",
    "EyePatch",
    "Eye Patches",
    "eye  mask",
    "Under Eye Mask",
    "Hydrogel eye_mask",
    "Eye Pads",
    "Soothing Eye Pads",
  ])("puts %p under eye-patch", (name: string) => {
    expect(typeOf(name)).toBe("eye-patch");
  });

  it.each([
    "Micellar Eye Pads",
    "Eye Cleansing Pads",
    "Eye Pads Cleanser",
    "Simple Eye Make Up Remover Pads",
    "Marcelle Oil-Free Eye-Makeup Remover Pads",
    "Mizellen Augen Make-Up Entferner Pads",
    "Cotton Eye Pads",
    "Eye Remover Pads",
    "Micellar Eye Mask",
    "Micellar Eyemask",
    "Micellar Eye Pad Mask",
    "Cleansing Eye Mask",
  ])("keeps %p out of eye-patch", (name: string) => {
    expect(typeOf(name)).not.toBe("eye-patch");
  });

  it("still calls a patch a patch, whatever else the name says", () => {
    expect(typeOf("Cleansing Eye Patch")).toBe("eye-patch");
  });

  it("does not turn an eye cream into a patch", () => {
    expect(typeOf("Eye Cream")).toBe("eye-cream");
  });

  it("knows an eye cream in German, Italian, Spanish, French and Dutch", () => {
    // Each read as a moisturiser by its "creme", and could be offered as one.
    for (const name of ["Augencreme Vital", "Contorno occhi", "Crema contorno de ojos", "Soin contour des yeux", "Oogcrème Q10"]) {
      expect({ name, type: typeOf(name) }).toEqual({ name, type: "eye-cream" });
    }
  });

  it("knows an eye cream however English names it", () => {
    // Real names from staging; the first was the routine's top "moisturiser".
    for (const name of [
      "Abib Collagen Eye Creme Jericho Rose",
      "Neutrogena Collagen Bank Eye Gel Cream 14g",
      "Neutrogena Hydro Boost Gel-Cream Eye",
      "CeraVe Eye Repair Cream",
      "Creamy Eye Treatment with Avocado",
      "Active Botanical Eye Contour (15ml)",
      "AYZ ooglid crème",
      "Augen Roll-On Aqua",
      "Soin anti-âge yeux rechargeur jeunesse et perfection",
    ]) {
      expect({ name, type: typeOf(name) }).toEqual({ name, type: "eye-cream" });
    }
  });

  it("knows a hand, body or foot cream in the catalogue's languages, even under a face tag", () => {
    // Real names from staging; each showed as "Moisturizer" on its own page.
    const cases: [string, string][] = [
      ["Ombia Med Hand Creme 5% Urea", "hand-cream"],
      ["Crema Manos", "hand-cream"],
      ["Mains à Croquer", "hand-cream"],
      ["Yesto Coconut - Hand & Cuticule Cream (crème pour les mains)", "hand-cream"],
      ["Bodycreme Vitamin E", "body-lotion"],
      ["Dove Nourishing Body Care Intensiva Piel Extra Seca", "body-lotion"],
      ["Bálsamo Corporal Aloe", "body-lotion"],
      ["Dermasel Fusscreme Happy Moments", "foot-cream"],
    ];
    for (const [name, type] of cases) expect({ name, type: guessType(["en:face", "en:creams"], name) }).toEqual({ name, type });
    // A cream for face and body is still a moisturiser.
    expect(guessType(["en:creams"], "Crème hydratante visage et corps")).toBe("moisturizer");
    expect(typeOf("mama bear face & body cream")).toBe("moisturizer");
    expect(typeOf("Handmade day cream")).toBe("moisturizer");
  });

  it("leaves what only mentions the eyes as it was", () => {
    for (const name of ["Démaquillant yeux waterproof", "Eye Make-up Remover", "Beauty of Joseon Revive Eye Serum", "Eau micellaire visage & yeux", "Creamy Eyeshadow"]) {
      expect({ name, type: typeOf(name) }).not.toEqual({ name, type: "eye-cream" });
    }
  });
});
