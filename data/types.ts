/**
 * Domain types. These describe the shape a real API is expected to return,
 * so swapping `data/api.ts` from mocks to HTTP should not touch anything else.
 */

export type SkinType = "oily" | "dry" | "combination" | "normal" | "sensitive";

/** Skin type minus the "sensitive" modifier — see `SkinProfile.sensitive`. */
export type BaseSkinType = Exclude<SkinType, "sensitive">;

export type Concern =
  | "dehydrated"
  | "acne-prone"
  | "redness"
  | "dullness"
  | "fine-lines"
  | "large-pores"
  | "hyperpigmentation";

export type Gender = "female" | "male" | "nonbinary" | "undisclosed";

export type AgeGroup = "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+";

export type BodyArea = "face" | "body";

export type RoutineLength = "minimal" | "balanced" | "full";

/**
 * The onboarding quiz's answers. `gender` and `ageGroup` are stored for
 * copy/personalisation but deliberately do not affect `matchProduct` —
 * inventing a scoring rule for them would be fabricating dermatology.
 */
export type SkinProfile = {
  gender: Gender | null;
  ageGroup: AgeGroup | null;
  area: BodyArea | null;
  concerns: Concern[];
  baseSkinType: BaseSkinType | null;
  sensitive: boolean;
  routineLength: RoutineLength | null;
};

export type ProductType =
  | "cleanser"
  | "toner"
  | "essence"
  | "serum"
  | "ampoule"
  | "moisturizer"
  | "sunscreen"
  | "body-wash"
  | "body-lotion"
  | "hand-cream";

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
  /**
   * EAN-13 printed on the packaging, and the key the scanner looks up.
   * Synthetic in the sample catalog — these are checksum-valid but invented,
   * so scanning a real bottle will legitimately miss until a real catalog
   * with real GTINs replaces `data/products.ts`.
   */
  barcode: string;
  brand: string;
  name: string;
  type: ProductType;
  /** Face or body — matches the quiz's area question. */
  area: BodyArea;
  /** Price in KRW. */
  price: number;
  volume: string;
  /** Skin types this product is formulated for. */
  suitableFor: SkinType[];
  /** Concerns this product claims to target. */
  targets: Concern[];
  description: string;
  /** Exactly 3 short marketing-style bullets, shown on the browse card. */
  benefits: [string, string, string];
  /** Ordered INCI list — references `Ingredient.id`. */
  ingredientIds: string[];
  inStock: boolean;
};

/** A product with its ingredients resolved, as a detail screen needs it. */
export type ProductWithIngredients = Product & {
  ingredients: Ingredient[];
};
