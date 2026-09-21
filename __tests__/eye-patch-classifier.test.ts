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
});
