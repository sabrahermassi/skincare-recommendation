import { displayIngredientName } from "@/lib/ingredient-name";

// #294: a `capitalize` transform wrote "Glyceryl Stearate Se" and "Disodium Edta".
describe("displayIngredientName", () => {
  it.each([
    ["glyceryl stearate se", "Glyceryl Stearate SE"],
    ["disodium edta", "Disodium EDTA"],
    ["peg-100 stearate", "PEG-100 Stearate"],
    ["ci 77891", "CI 77891"],
    ["ceramide np", "Ceramide NP"],
    ["1,2-hexanediol", "1,2-Hexanediol"],
    ["c12-15 alkyl benzoate", "C12-15 Alkyl Benzoate"],
    ["butyrospermum parkii butter", "Butyrospermum Parkii Butter"],
  ])("writes %s as %s", (stored: string, shown: string) => {
    expect(displayIngredientName(stored)).toBe(shown);
  });

  it("leaves an ordinary word that is also an abbreviation alone", () => {
    expect(displayIngredientName("melaleuca alternifolia (tea tree) leaf oil")).toBe(
      "Melaleuca Alternifolia (Tea Tree) Leaf Oil"
    );
  });
});
