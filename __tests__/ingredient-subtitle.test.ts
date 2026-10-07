import type { Ingredient } from "@/data/types";
import { EU_ALLERGEN_COPY } from "@/lib/eu-allergens";
import { ingredientSubtitle } from "@/lib/ingredient-subtitle";

const ing = (name: string, overrides: Partial<Ingredient> = {}): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides });

describe("the line under an ingredient's name in the list (#407)", () => {
  it("names an EU allergen with no rule of its own, not the import's citation", () => {
    expect(ingredientSubtitle(ing("vanillin", { safety: "caution", note: "Restricted use (EU Annex III/346)" }), "watch")).toBe(EU_ALLERGEN_COPY.subtitle.fragrance);
    expect(ingredientSubtitle(ing("m-aminophenol", { safety: "caution" }), "watch")).toBe(EU_ALLERGEN_COPY.subtitle["allergy-warning"]);
  });

  it("does not print 'Restricted use (EU Annex III/N)' for an ingredient that is only restricted", () => {
    const row = ing("triethanolamine", { safety: "caution", note: "Restricted use (EU Annex III/62)", functions: ["Buffering"] });
    expect(ingredientSubtitle(row, null)).toBe("Buffering");
    expect(ingredientSubtitle({ ...row, functions: [] }, null)).toBe("No known concerns");
  });

  it("keeps a prohibited ingredient's note, and a rule's sentence over both", () => {
    const banned = ing("some banned dye", { safety: "avoid", note: "Prohibited in cosmetics (EU Annex II/1339)" });
    expect(ingredientSubtitle(banned, "avoid")).toBe("Prohibited in cosmetics (EU Annex II/1339)");
    expect(ingredientSubtitle(ing("limonene", { safety: "caution" }), "watch")).toMatch(/fragrance allergen/i);
  });
});
