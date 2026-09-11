import type { ProductType } from "@/data/types";

/**
 * Maps a product to a bottle illustration when it has no real photo —
 * replaces the flat-vector `BottleIcon` set (`components/BottleIcon.tsx`)
 * anywhere a product appears in a list, per the container-shape reference
 * the illustration set was drawn against. `BottleIcon` isn't deleted: the
 * ingredient-detail and other non-product surfaces still use its plain
 * shape icons, and this module is additive, not a replacement for it there.
 *
 * ## The mapping
 *
 * Keyed by `ProductType`, not by a finer merchandising category — that's
 * all the catalogue currently carries. The source table this was built from
 * groups containers by category names finer than ours ("face oil", "sleeping
 * mask", "BB cream", …) — those map onto one of the `ProductType`s below,
 * and the container groups that had no `ProductType` at all to receive them
 * (mist bottle, foil sachet, twist-up stick, roll-on) are recorded but unused
 * — ready for the day the catalogue carries a real `category` field finer
 * than `ProductType`, without reworking this file.
 *
 * | Container | ProductType(s) | Files |
 * |---|---|---|
 * | Glass dropper bottle | serum, ampoule, essence | 03, 04 |
 * | Tall pump bottle | cleanser, body-wash, body-lotion | 05, 15, 36 |
 * | Wide squat jar | moisturizer | 07 |
 * | Squeeze tube, flip cap | sunscreen, hand-cream | 12 |
 * | Flat wide-mouth bottle | toner | 14 |
 * | (unused today) Spray / mist | — | 08 |
 * | (unused today) Foil sachet | — | 18, 38 |
 * | (unused today) Twist-up stick | — | 19, 39 |
 * | (unused today) Roll-on | — | 20, 42 |
 *
 * `cleanser` is genuinely ambiguous in the source table — it's listed under
 * both the pump bottle and the squeeze-tube groups, since real cleansers ship
 * in both. Assigned to the pump-bottle group here, since that's the more
 * common shape for the liquid/gel cleansers this catalogue actually has
 * ("nettoyant moussant visage", "Low pH good morning gel cleanser") — a foam
 * cleanser specifically would want the tube, but `ProductType` doesn't
 * distinguish the two.
 *
 * `unknown` (a product whose type genuinely couldn't be determined — see
 * `data/types.ts`) gets the same fallback as a `ProductType` we've simply
 * never seen: a container silhouette is furniture on a product row, not a
 * claim about the product, so drawing *a* bottle for it doesn't overstate
 * what's known the way showing "Serum" as text would.
 */

const GLASS_DROPPER = ["illustration-03.png", "illustration-04.png"];
const TALL_PUMP = ["illustration-05.png", "illustration-15.png", "illustration-36.png"];
const WIDE_JAR = ["illustration-07.png"];
const SQUEEZE_TUBE = ["illustration-12.png"];
const FLAT_BOTTLE = ["illustration-14.png"];

/** The fallback everything else — including `unknown` — resolves to. */
const FALLBACK = TALL_PUMP[0];

const CONTAINER_BY_TYPE: Record<ProductType, string[]> = {
  serum: GLASS_DROPPER,
  ampoule: GLASS_DROPPER,
  essence: GLASS_DROPPER,
  cleanser: TALL_PUMP,
  "body-wash": TALL_PUMP,
  "body-lotion": TALL_PUMP,
  moisturizer: WIDE_JAR,
  // Kept as its own key, not merged into hand-cream's, even though both
  // resolve to the same file today — see the module doc's "Known gap":
  // a sun-marked variant can replace this one line without touching
  // hand-cream's.
  sunscreen: SQUEEZE_TUBE,
  "hand-cream": SQUEEZE_TUBE,
  toner: FLAT_BOTTLE,
  unknown: TALL_PUMP,
};

/**
 * Same product, same illustration, every time — a deterministic pick among a
 * container's variant files rather than `Math.random()`, which would make a
 * product's own row look different on every re-render. Not cryptographic:
 * this only ever needs to fan a handful of ids out across 1-3 files evenly
 * enough that a whole list doesn't visibly repeat one variant.
 */
function stableIndex(key: string, modulus: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % modulus;
}

/**
 * Returns the require()-able source for a product's bottle illustration.
 *
 * Real photography always wins when there is any — this is a fallback for
 * when there isn't, not a house style to impose over real product images.
 * (Today `data/api.ts`'s `SHOW_SOURCE_PHOTOS` flag keeps every `imageUrl`
 * null regardless, per its own doc comment on why — this function still
 * checks it directly rather than assuming that, so it does the right thing
 * the day that flag flips.)
 */
export function productIllustration(product: {
  id: string;
  type: ProductType;
  imageUrl?: string | null;
}): string | { uri: string } {
  if (product.imageUrl) return { uri: product.imageUrl };

  const files = CONTAINER_BY_TYPE[product.type] ?? [FALLBACK];
  return files[stableIndex(product.id, files.length)];
}

/**
 * The `require()` table `productIllustration` picks a key out of.
 *
 * Metro needs every `require()` target statically written out — it can't
 * resolve one built from a variable path — so the string `productIllustration`
 * returns has to be looked up in this table rather than interpolated
 * directly into a `require()` call at the call site. `require()` on a static
 * image asset resolves to a Metro module id (a `number`) at runtime, which
 * is exactly what `expo-image`'s `source` prop accepts alongside `{ uri }`.
 */
export const ILLUSTRATION_SOURCE: Record<string, number> = {
  "illustration-03.png": require("@/assets/illustrations/illustration-03.png"),
  "illustration-04.png": require("@/assets/illustrations/illustration-04.png"),
  "illustration-05.png": require("@/assets/illustrations/illustration-05.png"),
  "illustration-07.png": require("@/assets/illustrations/illustration-07.png"),
  "illustration-12.png": require("@/assets/illustrations/illustration-12.png"),
  "illustration-14.png": require("@/assets/illustrations/illustration-14.png"),
  "illustration-15.png": require("@/assets/illustrations/illustration-15.png"),
  "illustration-36.png": require("@/assets/illustrations/illustration-36.png"),
};

/** What a caller actually renders — resolves a real-photo URI or a local file key alike. */
export function productIllustrationSource(product: {
  id: string;
  type: ProductType;
  imageUrl?: string | null;
}): { uri: string } | number {
  const picked = productIllustration(product);
  return typeof picked === "string" ? ILLUSTRATION_SOURCE[picked] : picked;
}
