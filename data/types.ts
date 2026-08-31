/**
 * Domain types. These describe the shape a real API is expected to return,
 * so swapping `data/api.ts` from mocks to HTTP should not touch anything else.
 */

export type SkinType = "oily" | "dry" | "combination" | "normal" | "sensitive";

export type Concern =
  | "dehydrated"
  | "acne-prone"
  | "redness"
  | "dullness"
  | "fine-lines"
  | "large-pores"
  | "hyperpigmentation";

export type ProductType =
  | "cleanser"
  | "toner"
  | "essence"
  | "serum"
  | "ampoule"
  | "moisturizer"
  | "sunscreen";

/** 0 = will not clog pores, 5 = highly pore-clogging. */
export type ComedogenicRating = 0 | 1 | 2 | 3 | 4 | 5;

export type SafetyLevel = "safe" | "caution" | "avoid";

export type Ingredient = {
  /** INCI name, used as the stable key. */
  id: string;
  name: string;
  comedogenic: ComedogenicRating;
  safety: SafetyLevel;
  /** Short human-readable reason shown under the ingredient. */
  note?: string;
};

export type Product = {
  id: string;
  brand: string;
  name: string;
  type: ProductType;
  /** Price in KRW. */
  price: number;
  volume: string;
  /** Skin types this product is formulated for. */
  suitableFor: SkinType[];
  /** Concerns this product claims to target. */
  targets: Concern[];
  description: string;
  /** Ordered INCI list — references `Ingredient.id`. */
  ingredientIds: string[];
  inStock: boolean;
};

/** A product with its ingredients resolved, as a detail screen needs it. */
export type ProductWithIngredients = Product & {
  ingredients: Ingredient[];
};
