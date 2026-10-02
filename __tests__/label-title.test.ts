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

it("fills up with the first ingredients when it has fewer than three actives, water left out", () => {
  expect(labelHighlights(["aqua", "glycerin", "niacinamide", "butylene glycol"])).toEqual(["Niacinamide", "Glycerin", "Butylene Glycol"]);
  expect(labelHighlights(["Water", "glycerin", "dimethicone", "panthenol", "parfum"])).toEqual(["Glycerin", "Dimethicone", "Panthenol"]);
});

it("has just its number when nothing was read, and its old name when it was never numbered", () => {
  expect(labelTitle([], 4)).toBe("Product 4");
  expect(labelTitle(["aqua"], 1)).toBe("Product 1");
  expect(labelName(undefined)).toBe("Label photo");
  expect(labelTitle(["aqua", "glycerin"], undefined)).toBe("Label photo: Glycerin");
});
