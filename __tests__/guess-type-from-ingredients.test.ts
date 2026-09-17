import { guessTypeFromIngredients } from "../scripts/lib/guess-type-from-ingredients.mjs";

/**
 * The ingredient-based fallback tried once `guessType` (name/tags) already
 * returned "unknown" — see that module's own header for why only these two
 * rules, why titanium dioxide/zinc oxide are deliberately excluded from the
 * sunscreen rule, why a mask-named product never gets the acid rule, and why
 * the acid rule must resolve to "serum" rather than "exfoliator".
 */

function ingredient(inci_name: string, position: number) {
  return { inci_name, position };
}

describe("guessTypeFromIngredients", () => {
  it("types a formula containing an organic UV filter as sunscreen", () => {
    const ingredients = [
      ingredient("aqua", 0),
      ingredient("ethylhexyl methoxycinnamate", 1),
      ingredient("glycerin", 2),
    ];
    expect(guessTypeFromIngredients("Day Cream", ingredients)).toBe("sunscreen");
  });

  it("does NOT type a formula as sunscreen just for containing titanium dioxide or zinc oxide", () => {
    // The bug a first version had: CosIng tags both as UV filters even though
    // they're just as often a plain pigment/opacifier — a lip balm or a clay
    // mask, not a sunscreen. Real mineral sunscreens still stay honestly
    // "unknown" here rather than risk this false positive; see the file header.
    const lipBalm = [ingredient("ricinus communis seed oil", 0), ingredient("titanium dioxide", 1)];
    expect(guessTypeFromIngredients("Tinted Lip Balm", lipBalm)).toBe("unknown");

    const clayMask = [ingredient("kaolin", 0), ingredient("zinc oxide", 1)];
    expect(guessTypeFromIngredients("Purifying Clay Mask", clayMask)).toBe("unknown");
  });

  it("types a short, leading-acid formula as serum, not exfoliator", () => {
    // "Lactic Acid 10%"-style: a short list, the acid near the front.
    const ingredients = [
      ingredient("aqua", 0),
      ingredient("lactic acid", 1),
      ingredient("glycerin", 2),
      ingredient("phenoxyethanol", 3),
    ];
    expect(guessTypeFromIngredients("Lactic Acid 10% + HA", ingredients)).toBe("serum");
  });

  it("ignores a trailing acid on a long ingredient list (a pH adjuster, not a treatment)", () => {
    const long = Array.from({ length: 24 }, (_, i) => ingredient(`filler-${i}`, i));
    const withTrailingAcid = [...long, ingredient("lactic acid", 24)];
    expect(guessTypeFromIngredients("Everyday Moisturizer", withTrailingAcid)).toBe("unknown");
  });

  it("ignores an acid that isn't near the front, even on a short list", () => {
    const ingredients = [
      ingredient("aqua", 0),
      ingredient("glycerin", 1),
      ingredient("butylene glycol", 2),
      ingredient("panthenol", 3),
      ingredient("niacinamide", 4),
      ingredient("lactic acid", 5),
    ];
    expect(guessTypeFromIngredients("Everyday Moisturizer", ingredients)).toBe("unknown");
  });

  it("does not mistake maskara (Turkish for mascara) for a mask-named product", () => {
    // A bare `mask` prefix also matches inside this real word — the acid
    // rule must still apply normally here, not get suppressed by the guard
    // meant for actual masks.
    const ingredients = [
      ingredient("aqua", 0),
      ingredient("lactic acid", 1),
      ingredient("glycerin", 2),
    ];
    expect(guessTypeFromIngredients("Maskara Siyah", ingredients)).toBe("serum");
  });

  it("never applies the acid rule to a product whose name says mask, in any of the languages seen so far", () => {
    // A leading acid in a clay/mud mask is a real, common combination — but
    // there's no ProductType for a generic mask yet (issue #105), so the
    // honest answer is "unknown", not a wrong specific guess of "serum".
    const ingredients = [ingredient("aqua", 0), ingredient("salicylic acid", 1), ingredient("kaolin", 2)];
    for (const name of [
      "Purifying Clay Mask",
      "Reinigende Tonerde-Maske",
      "Maschera Viso Purificante",
      "Masque à l'argile",
      "Mascarilla de arcilla",
      "Arındırıcı Kil Maskesi",
    ]) {
      expect(guessTypeFromIngredients(name, ingredients)).toBe("unknown");
    }
  });

  it("returns unknown when nothing matches either rule", () => {
    const ingredients = [ingredient("aqua", 0), ingredient("glycerin", 1)];
    expect(guessTypeFromIngredients("Everyday Moisturizer", ingredients)).toBe("unknown");
  });

  it("prefers the sunscreen rule over the acid rule when both would match", () => {
    const ingredients = [
      ingredient("aqua", 0),
      ingredient("salicylic acid", 1),
      ingredient("ethylhexyl methoxycinnamate", 2),
    ];
    expect(guessTypeFromIngredients("Daily Defense Fluid", ingredients)).toBe("sunscreen");
  });
});
