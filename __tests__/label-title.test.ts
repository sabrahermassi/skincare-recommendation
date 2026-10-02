import { labelHighlights, labelName, labelTitle } from "@/lib/label-title";

/**
 * What a label photo is called in History (owner, 2 October 2026): numbered,
 * and named by its top three actives, with no name asked for.
 */

it("names a label by its actives, in printed order, three at most", () => {
  const label = ["aqua", "glycerin", "niacinamide", "butylene glycol", "salicylic acid", "retinol", "ascorbic acid"];
  expect(labelHighlights(label)).toEqual(["Niacinamide", "Salicylic Acid", "Retinol"]);
  expect(labelTitle(label, 2)).toBe("Product 2: Niacinamide, Salicylic Acid, Retinol");
});

it("fills up, with fewer than three actives, from what our rules credit most, then what is printed first, water left out", () => {
  // Ceramides say more about a product than butylene glycol does.
  expect(labelHighlights(["aqua", "glycerin", "niacinamide", "butylene glycol", "panthenol", "ceramide np"])).toEqual(["Niacinamide", "Ceramide NP", "Glycerin"]);
  expect(labelHighlights(["Water", "xanthan gum", "glycerin", "carbomer"])).toEqual(["Glycerin", "Xanthan Gum", "Carbomer"]);
});

it("leaves water out however the pack prints it", () => {
  for (const water of ["Aqua/Water/Eau", "Water (Aqua)", "Purified Water", "AQUA"]) {
    expect(labelHighlights([water, "glycerin", "xanthan gum", "carbomer"])).toEqual(["Glycerin", "Xanthan Gum", "Carbomer"]);
  }
  // A name that only contains the word is not water.
  expect(labelHighlights(["aqua", "rosa damascena flower water"])).toEqual(["Rosa Damascena Flower Water"]);
});

it("has just its number when nothing was read, and its old name when it was never numbered", () => {
  expect(labelTitle([], 4)).toBe("Product 4");
  expect(labelTitle(["aqua"], 1)).toBe("Product 1");
  expect(labelName(undefined)).toBe("Label photo");
  expect(labelTitle(["aqua", "glycerin"], undefined)).toBe("Label photo: Glycerin");
});
