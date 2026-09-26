import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { ingredientLabel, LABEL_ORDER, sortForGlance, type IngredientLabel } from "@/lib/ingredient-labels";
import { matchProduct } from "@/lib/matching";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * #324: a word on every row of the ingredient list, from what the score
 * already worked out, never decided again — so a row is never "Good" while
 * "Why this score" counts it against the person.
 */

function profile(overrides: Partial<SkinProfile> = {}): SkinProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

function ingredient(name: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides };
}

function product(ingredients: Ingredient[]): ProductWithIngredients {
  return {
    id: "p",
    barcode: "0000000000000",
    brand: "Test",
    name: "Test",
    type: "serum",
    productType: "serum",
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    ingredientIds: ingredients.map((i) => i.id),
    inStock: true,
    ingredients,
  };
}

// Glycerin helps dehydrated skin; fragrance works against sensitive skin.
const GLYCERIN = ingredient("glycerin");
const FRAGRANCE = ingredient("parfum");
const RESTRICTED = ingredient("some restricted preservative", { safety: "caution" });
const BANNED = ingredient("some banned dye", { safety: "avoid" });
const MYSTERY = ingredient("mystery extract", { verified: false });
const PLAIN = ["water", "xanthan gum", "butylene glycol", "1,2-hexanediol"].map((name) => ingredient(name));
const ALL = [...PLAIN, GLYCERIN, FRAGRANCE, RESTRICTED, BANNED, MYSTERY];

const WITH_PROFILE = profile({ concerns: ["dehydrated"], baseSkinType: "dry", sensitivity: "high" });

describe("ingredientLabel, with a skin profile", () => {
  const match = matchProduct(product(ALL), WITH_PROFILE);
  const label = (i: Ingredient) => ingredientLabel(i, match, true);

  it("says Good only for a benefit the score counted for this person", () => {
    expect(match.reasons.some((r) => r.ingredient === "glycerin" && r.effect > 0)).toBe(true);
    expect(label(GLYCERIN)).toBe("good");
  });

  it("says Watch for what the score counted against them, and for a restricted ingredient", () => {
    expect(label(FRAGRANCE)).toBe("watch");
    expect(label(RESTRICTED)).toBe("watch");
  });

  it("says Avoid for a hazard and Unknown for a name we don't know", () => {
    expect(label(BANNED)).toBe("avoid");
    expect(label(MYSTERY)).toBe("unknown");
  });

  it("leaves a plain ingredient with no benefit for this person unlabelled", () => {
    expect(label(ingredient("xanthan gum"))).toBeNull();
  });

  it("never calls a row Good that the score explanation counts against the person", () => {
    for (const i of ALL) {
      const against = match.reasons.some((r) => r.ingredient === i.name && r.effect < 0);
      if (against) expect(label(i)).not.toBe("good");
    }
  });
});

describe("ingredientLabel, with no skin profile", () => {
  const match = matchProduct(product(ALL), EMPTY_PROFILE);
  const label = (i: Ingredient) => ingredientLabel(i, match, false);

  it("shows only what's true for everyone: Avoid, Unknown, and Watch for a restricted ingredient", () => {
    expect(label(BANNED)).toBe("avoid");
    expect(label(MYSTERY)).toBe("unknown");
    expect(label(RESTRICTED)).toBe("watch");
  });

  it("never says Good, and never a Watch that depends on the person", () => {
    expect(label(GLYCERIN)).toBeNull();
    expect(label(FRAGRANCE)).toBeNull();
    for (const i of ALL) expect(label(i)).not.toBe("good");
  });
});

describe("sortForGlance", () => {
  const match = matchProduct(product(ALL), WITH_PROFILE);

  it("puts Avoid, then Watch, then Good, then Unknown first, and folds the rest", () => {
    const { labelled, unlabelled } = sortForGlance(ALL, match, true);
    const order = labelled.map((row) => LABEL_ORDER.indexOf(row.label as IngredientLabel));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(labelled.map((row) => row.label))).toEqual(new Set(["avoid", "watch", "good", "unknown"]));
    expect(unlabelled.length).toBeGreaterThan(0);
    expect(unlabelled.every((row) => row.label === null)).toBe(true);
    expect(labelled.length + unlabelled.length).toBe(ALL.length);
  });

  it("keeps the printed order within each group", () => {
    const { labelled, unlabelled } = sortForGlance(ALL, match, true);
    const watch = labelled.filter((row) => row.label === "watch").map((row) => row.ingredient.name);
    expect(watch).toEqual(["parfum", "some restricted preservative"]);
    const unlabelledNames = unlabelled.map((row) => row.ingredient.name);
    expect(unlabelledNames).toEqual(ALL.map((i) => i.name).filter((name) => unlabelledNames.includes(name)));
  });
});
