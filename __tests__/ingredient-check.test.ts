import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import {
  ingredientCheck,
  ingredientCheckLine,
  ingredientCheckTone,
  ingredientLabel,
  type IngredientCheck,
} from "@/lib/ingredient-labels";
import { matchProduct } from "@/lib/matching";
import { isPersonalized } from "@/lib/profile";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * #345: one line at the top of every result, the same for everyone. It is
 * the ingredient list's own labels with no profile, so the check, the rows
 * and "Why this score" can't disagree.
 */

function ingredient(name: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides };
}

function product(ingredients: Ingredient[]): Pick<ProductWithIngredients, "type" | "ingredients"> {
  return { type: "serum", ingredients };
}

const PLAIN = ["water", "glycerin", "xanthan gum", "butylene glycol", "1,2-hexanediol"].map((name) => ingredient(name));
const BANNED = ingredient("some banned dye", { safety: "avoid" });
const BANNED_2 = ingredient("another banned dye", { safety: "avoid" });
const RESTRICTED = ingredient("linalool", { safety: "caution" });
const FRAGRANCE = ingredient("parfum");
const CLOGGER = ingredient("isopropyl myristate");
const MYSTERY = ingredient("mystery extract", { verified: false });
const RETINOL = ingredient("retinol");
const TEA_TREE = ingredient("tea tree oil");

const PROFILES: SkinProfile[] = [
  EMPTY_PROFILE,
  { concerns: ["dehydrated"], baseSkinType: "dry", sensitivity: "high", pregnancyStatus: null },
  { concerns: ["acne-prone", "large-pores"], baseSkinType: "oily", sensitivity: "none", pregnancyStatus: "pregnant" },
  { concerns: [], baseSkinType: null, sensitivity: null, pregnancyStatus: "breastfeeding" },
];

const checked = (avoid: number, watch: number, unrecognised = 0): IngredientCheck => ({
  kind: "checked",
  avoid,
  watch,
  unrecognised,
});

describe("ingredientCheck", () => {
  it("finds nothing of concern in a plain formula", () => {
    const check = ingredientCheck(PLAIN);
    expect(check).toEqual(checked(0, 0));
    expect(ingredientCheckLine(check)).toBe("No ingredients of concern found");
    expect(ingredientCheckTone(check)).toBe("good");
  });

  it("counts a hazard to avoid", () => {
    const check = ingredientCheck([...PLAIN, BANNED]);
    expect(ingredientCheckLine(check)).toBe("1 ingredient to avoid");
    expect(ingredientCheckTone(check)).toBe("avoid");
    expect(ingredientCheckLine(ingredientCheck([...PLAIN, BANNED, BANNED_2]))).toBe("2 ingredients to avoid");
  });

  it("counts what is flagged for everyone to watch: restricted, fragrance, a listed pore-clogger", () => {
    const check = ingredientCheck([...PLAIN, RESTRICTED, FRAGRANCE, CLOGGER]);
    expect(check).toEqual(checked(0, 3));
    expect(ingredientCheckLine(check)).toBe("3 ingredients to watch");
    expect(ingredientCheckTone(check)).toBe("watch");
    expect(ingredientCheckLine(ingredientCheck([...PLAIN, FRAGRANCE]))).toBe("1 ingredient to watch");
  });

  it("leaves out what only matters to some skin: an active that stings, a pregnancy caution", () => {
    expect(ingredientCheck([...PLAIN, TEA_TREE, RETINOL])).toEqual(checked(0, 0));
  });

  it("puts avoid first when both apply", () => {
    const check = ingredientCheck([...PLAIN, BANNED, FRAGRANCE, CLOGGER]);
    expect(ingredientCheckLine(check)).toBe("1 to avoid · 2 to watch");
    expect(ingredientCheckTone(check)).toBe("avoid");
  });

  it("adds a quiet count of names it didn't recognise", () => {
    expect(ingredientCheckLine(ingredientCheck([...PLAIN, MYSTERY]))).toBe("No ingredients of concern found · 1 not recognised");
    expect(ingredientCheckLine(ingredientCheck([...PLAIN, FRAGRANCE, MYSTERY, ingredient("x", { verified: false })]))).toBe(
      "1 ingredient to watch · 2 not recognised",
    );
  });

  it("refuses by the score's own rule: fewer than 3 recognised, or under a quarter", () => {
    const tooFew = ingredientCheck([ingredient("water"), ingredient("glycerin"), MYSTERY]);
    expect(tooFew).toEqual({ kind: "unreadable" });
    expect(ingredientCheckLine(tooFew)).toBe("Not enough ingredients recognised to check");
    expect(ingredientCheckTone(tooFew)).toBe("neutral");
    const mostlyUnknown = [...PLAIN.slice(0, 3), ...Array.from({ length: 10 }, (_, n) => ingredient(`unread ${n}`, { verified: false }))];
    expect(ingredientCheck(mostlyUnknown)).toEqual({ kind: "unreadable" });
    expect(ingredientCheck([])).toEqual({ kind: "unreadable" });
  });

  it("never says safe, clean, non-toxic or healthy", () => {
    const lines = [
      [...PLAIN],
      [...PLAIN, BANNED],
      [...PLAIN, FRAGRANCE],
      [...PLAIN, BANNED, FRAGRANCE, MYSTERY],
      [MYSTERY],
    ].map((list) => ingredientCheckLine(ingredientCheck(list)));
    for (const line of lines) expect(line).not.toMatch(/\b(safe|clean|non-toxic|healthy)\b/i);
  });

  it("agrees with every profile's row labels: what it counts is Avoid or Watch for everyone", () => {
    const all = [...PLAIN, BANNED, RESTRICTED, FRAGRANCE, CLOGGER, MYSTERY, RETINOL, TEA_TREE];
    const profileFree = matchProduct(product(all), EMPTY_PROFILE);
    for (const profile of PROFILES) {
      const match = matchProduct(product(all), profile);
      const personalized = isPersonalized(profile);
      for (const i of all) {
        const everyone = ingredientLabel(i, profileFree, false);
        const theirs = ingredientLabel(i, match, personalized);
        if (everyone === "avoid") expect(theirs).toBe("avoid");
        if (everyone === "watch") expect(["watch", "avoid"]).toContain(theirs);
      }
    }
  });

  it("doesn't replace the person's own cached score for the product", () => {
    const p = product([...PLAIN, FRAGRANCE]);
    const profile = PROFILES[1];
    const before = matchProduct(p, profile);
    ingredientCheck(p.ingredients);
    expect(matchProduct(p, profile)).toBe(before);
  });
});
