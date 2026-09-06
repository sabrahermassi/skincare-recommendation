/**
 * Domain types. These describe the shape a real API is expected to return,
 * so swapping `data/api.ts` from mocks to HTTP should not touch anything else.
 */

export type SkinType = "oily" | "dry" | "combination" | "normal" | "sensitive";

/** Skin type minus the "sensitive" modifier — see `SkinProfile.sensitivity`. */
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

export type BodyArea = "face" | "body";

/**
 * How reactive the user says their skin is. Three levels rather than a
 * boolean, because "stings at everything" and "occasionally tingles" want
 * different verdicts on the same fragranced formula, and the old toggle
 * collapsed them.
 */
export type Sensitivity = "none" | "some" | "high";

/**
 * The onboarding quiz's answers.
 *
 * Gender and age used to live here. Both were collected, stored, and read by
 * nothing — `matchProduct` never scored on either — so they implied a
 * personalisation the app did not deliver, and the MVP drops them.
 *
 * `area` is NOT an onboarding question any more, but the field stays: the
 * browse screen filters the catalogue on it (`app/(tabs)/browse.tsx`) and it
 * is still editable from the profile screen.
 */
export type SkinProfile = {
  area: BodyArea | null;
  concerns: Concern[];
  /** `null` is a real answer: the MVP's "I don't know" option. */
  baseSkinType: BaseSkinType | null;
  /**
   * `null` means unanswered, which is not the same as "none" — the quiz has
   * to tell "I skipped this" from "my skin is not sensitive", and a boolean
   * plus a separate answered flag would be two fields that can disagree.
   */
  sensitivity: Sensitivity | null;
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

/**
 * Which of the eight illustrated bottle shapes represents this product on
 * screen — a physical-packaging axis, not the merchandising one `type`
 * already covers. A gel cleanser and a body wash are different `type`s but
 * the same vessel, so both take `productType: "cleanser-tube"`.
 *
 * Matches `design_handoff_skintel_onboarding/bottle-set.html` exactly, one
 * value per `btl-<name>.svg` — see `components/BottleIcon.tsx`.
 */
export type PackagingType =
  | "serum"
  | "cleanser-tube"
  | "lotion-pump"
  | "cream-jar"
  | "mist"
  | "toner"
  | "ampoule"
  | "sunscreen";

/**
 * 0 = will not clog pores, 5 = highly pore-clogging.
 *
 * INTENTIONALLY UNPOPULATED for real catalogue data, and it should stay that
 * way. The published 0-5 scales come from mid-century rabbit-ear assays that
 * correlate poorly with human breakouts, and no openly licensed dataset exists
 * — so filling this column would put a fabricated rating next to a measured one
 * with nothing to tell them apart. Pore-clogging judgement lives in
 * `INGREDIENT_RULES` (`lib/rules.ts`) instead, where it covers only the handful
 * of ingredients with reasonably consistent human evidence and each claim
 * carries the sentence shown to the user.
 *
 * Only the hand-written sample catalogue in `data/ingredients.ts` sets it.
 */
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
  /** Which bottle icon to draw — see `PackagingType`. */
  productType: PackagingType;
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
   * Packaging photo from the source. Unused by every screen now —
   * `components/BottleIcon.tsx` draws every product as its `productType`'s
   * illustrated bottle instead, real photo or not (see `SHOW_SOURCE_PHOTOS`
   * in `data/api.ts` for why). Kept on the type because a real catalogue
   * endpoint will still return it.
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
