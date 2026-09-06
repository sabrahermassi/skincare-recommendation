import { normaliseFunction, parseFunctions } from "../scripts/lib/normalise-function.mjs";
import { normaliseFunction as readSide } from "@/lib/rules";

/**
 * The two dictionary importers each had their own splitting logic and wrote
 * the same CosIng role two different ways — `import-cosing` lowercased but
 * kept the CSV's spaces, `import-inci-dictionary` passed the OBF taxonomy's
 * hyphens and casing straight through. Both spellings are in the live
 * `ingredients.functions` column, and the scoring layer's Layer 2 lookup has
 * to resolve either.
 */
describe("normaliseFunction", () => {
  it("collapses the two spellings the importers used to produce", () => {
    expect(normaliseFunction("skin conditioning")).toBe("skin-conditioning");
    expect(normaliseFunction("Skin-Conditioning")).toBe("skin-conditioning");
    expect(normaliseFunction("SKIN CONDITIONING")).toBe("skin-conditioning");
  });

  it("strips the taxonomy's language prefix", () => {
    expect(normaliseFunction("en:skin-protecting")).toBe("skin-protecting");
  });

  /**
   * The whole point of extracting this: the write side and the read side must
   * agree, or Layer 2 silently stops matching rows written by one importer.
   */
  it("agrees with the read-side normaliser in lib/rules", () => {
    for (const raw of [
      "Skin conditioning",
      "skin-conditioning",
      "UV Filter",
      "emulsion stabilising",
      "Foam boosting",
    ]) {
      expect(normaliseFunction(raw)).toBe(readSide(raw));
    }
  });
});

describe("parseFunctions", () => {
  it("splits a CosIng cell on both delimiters it uses", () => {
    expect(parseFunctions("Humectant, Skin conditioning/Emollient")).toEqual([
      "humectant",
      "skin-conditioning",
      "emollient",
    ]);
  });

  it("dedupes roles that differ only in spelling", () => {
    expect(parseFunctions("humectant, Humectant, en:humectant")).toEqual(["humectant"]);
  });

  it("returns nothing for an absent or empty cell", () => {
    expect(parseFunctions("")).toEqual([]);
    expect(parseFunctions(null)).toEqual([]);
    expect(parseFunctions(undefined)).toEqual([]);
  });
});
