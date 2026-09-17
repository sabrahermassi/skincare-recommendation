import { ingredientGuess, nameGuess } from "../scripts/reclassify-types.mjs";

/**
 * The two passes `reclassify-types.mjs` runs over a row already typed
 * "unknown": the name first, the formula only if the name gives nothing.
 * Both return null rather than "unknown", which is what keeps the caller
 * from ever writing a row back to the state it was already in.
 *
 * The rule these encode — a row only moves OUT of "unknown", never between
 * two real types — exists because the products table stores no category
 * tags, so a name-only re-guess knows strictly less than the import did. A
 * first dry run that ignored this regressed ~200 correctly-typed rows.
 */

describe("nameGuess", () => {
  it("returns a type when the name carries one", () => {
    expect(nameGuess("Gentle Foaming Cleanser")).toBe("cleanser");
    expect(nameGuess("Avon Dudak Balmı")).toBe("lip-balm");
  });

  it("returns null rather than 'unknown' when the name says nothing", () => {
    expect(nameGuess("Brand X 30ml")).toBeNull();
  });
});

describe("ingredientGuess", () => {
  const ingredient = (inci_name: string, position: number) => ({ inci_name, position });

  it("reads a type out of the formula when the name gave nothing", () => {
    expect(
      ingredientGuess("Brand X 30ml", [ingredient("aqua", 0), ingredient("lactic acid", 1)]),
    ).toBe("serum");
  });

  it("returns null when the formula says nothing either", () => {
    expect(ingredientGuess("Brand X 30ml", [ingredient("aqua", 0), ingredient("glycerin", 1)])).toBeNull();
  });

  it("returns null for an empty formula rather than guessing", () => {
    expect(ingredientGuess("Brand X 30ml", [])).toBeNull();
  });
});
