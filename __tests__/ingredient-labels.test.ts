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

describe("ingredientLabel, while pregnant or breastfeeding", () => {
  // A pregnancy hit is an "irritant" warning to the score, never a hazard, and
  // a pregnancy answer alone is not a skin profile.
  const RETINOL = ingredient("retinol");
  const UNREAD_RETINOL = ingredient("retinol", { id: "retinol-unread", verified: false });

  it("says Avoid with no skin profile, where nothing else person-specific is shown", () => {
    const match = matchProduct(product([...PLAIN, RETINOL]), profile({ pregnancyStatus: "pregnant" }));
    expect(match.warnings.some((w) => w.origin === "pregnancy" && w.severity === "irritant")).toBe(true);
    expect(ingredientLabel(RETINOL, match, false)).toBe("avoid");
  });

  it("says Avoid, not Watch, with a skin profile", () => {
    const match = matchProduct(product([...PLAIN, RETINOL]), profile({ ...WITH_PROFILE, pregnancyStatus: "breastfeeding" }));
    expect(ingredientLabel(RETINOL, match, true)).toBe("avoid");
  });

  it("says Avoid even when the label read left the name unrecognised", () => {
    const match = matchProduct(product([...PLAIN, UNREAD_RETINOL]), profile({ pregnancyStatus: "pregnant" }));
    expect(ingredientLabel(UNREAD_RETINOL, match, false)).toBe("avoid");
  });

  it("leaves the same ingredient alone for someone who isn't pregnant", () => {
    const match = matchProduct(product([...PLAIN, RETINOL]), EMPTY_PROFILE);
    expect(ingredientLabel(RETINOL, match, false)).not.toBe("avoid");
  });
});

describe("ingredientLabel, for a name on the pore-clogging lists", () => {
  // The row wears a CLOGGING tag whoever you are, so it is never Good and
  // never folded under "no known concerns" (#290), even when the score didn't
  // charge it and a declared function counted for this person.
  const LANOLIN = ingredient("lanolin", { functions: ["emollient", "skin conditioning"] });
  const DRY = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });

  it("says Watch, not Good, when its benefit counted for this person", () => {
    const match = matchProduct(product([...PLAIN, LANOLIN]), DRY);
    expect(match.cloggersCharged).toEqual([]);
    expect(match.reasons.some((r) => r.ingredient === "lanolin" && r.effect > 0)).toBe(true);
    expect(ingredientLabel(LANOLIN, match, true)).toBe("watch");
  });

  it("says Watch, not Unknown, for a misread name that is on the lists and cost the score", () => {
    // Pore-clogging matching fires on an unrecognised name, and charges it.
    const MISREAD = ingredient("isopropyl myristate", { verified: false });
    const match = matchProduct(product([...PLAIN, GLYCERIN, MISREAD]), profile({ concerns: ["acne-prone"] }));
    expect(match.cloggersCharged).toContain("isopropyl myristate");
    expect(ingredientLabel(MISREAD, match, true)).toBe("watch");
    const noProfile = matchProduct(product([...PLAIN, MISREAD]), EMPTY_PROFILE);
    expect(ingredientLabel(MISREAD, noProfile, false)).toBe("watch");
  });

  it("says Watch with no skin profile, and stays out of the fold", () => {
    const match = matchProduct(product([...PLAIN, LANOLIN]), EMPTY_PROFILE);
    expect(ingredientLabel(LANOLIN, match, false)).toBe("watch");
    const { labelled } = sortForGlance([...PLAIN, LANOLIN], match, false);
    expect(labelled.map((row) => row.ingredient.name)).toEqual(["lanolin"]);
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
