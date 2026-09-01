/**
 * Domain types. These describe the shape a real API is expected to return,
 * so swapping `data/api.ts` from mocks to HTTP should not touch anything else.
 */

export type SkinType = "oily" | "dry" | "combination" | "normal" | "sensitive";

/** Skin type minus the "sensitive" modifier — see `SkinProfile.sensitive`. */
export type BaseSkinType = Exclude<SkinType, "sensitive">;

/**
 * `atopic` is eczema-prone skin, not a severity of "dry". Both La Roche-Posay
 * and Avène build a flagship range for it alone (Lipikar, XeraCalm A.D)
 * because it wants different things from a formula than dry skin does —
 * barrier lipids and near-zero sensitisers, rather than humectants — and it is
 * the state most likely to react badly to a product that suits everyone else.
 */
export type Concern =
  | "dehydrated"
  | "acne-prone"
  | "redness"
  | "dullness"
  | "fine-lines"
  | "large-pores"
  | "hyperpigmentation"
  | "atopic";

export type Gender = "female" | "male" | "nonbinary" | "undisclosed";

export type AgeGroup = "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+";

export type BodyArea = "face" | "body";

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
  /**
   * Whether this name was matched against an authoritative dictionary
   * (CosIng / MFDS) rather than merely parsed off a product label.
   *
   * Open Beauty Facts ingredient text is crowdsourced and often OCR-mangled —
   * live records contain fused entries like "Ulmus Davidiana Root raria Lobata
   * Root". Under a safety verdict, an unrecognised name has to look
   * unrecognised rather than authoritative. Optional so the sample catalogue,
   * which is hand-written and therefore trusted, needn't set it.
   */
  verified?: boolean;
  /**
   * CosIng functional roles ("humectant", "solvent", "emollient"). Populated
   * for ~98% of the dictionary and used as the subtitle when no curated rule
   * applies — a real fact about the ingredient rather than filler.
   */
  functions?: string[];
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
  /**
   * Short marketing-style bullets for the browse card. Empty for anything
   * pulled from a real source: Open Beauty Facts and INCI API return a formula
   * and a label, not copywriting. The card falls back to the description.
   */
  benefits: string[];
  /**
   * Packaging photo from the source, or `null` when there isn't one — which is
   * common. `ProductIllustration` renders the pastel vessel in that case.
   */
  imageUrl: string | null;
  /**
   * Licence credit to render beside the product, e.g. "Data from Open Beauty
   * Facts, ODbL". Null for curated rows we wrote ourselves. Stored per product
   * because the obligation travels with the row, not with the catalogue.
   */
  attribution: string | null;
  /**
   * When this row's label data was last read, ISO-8601. Shown to the user
   * because formulas change and a two-year-old INCI list is a claim, not data.
   */
  fetchedAt?: string;
  /** Ordered INCI list — references `Ingredient.id`. */
  ingredientIds: string[];
  inStock: boolean;
};

/** A product with its ingredients resolved, as a detail screen needs it. */
export type ProductWithIngredients = Product & {
  ingredients: Ingredient[];
};
