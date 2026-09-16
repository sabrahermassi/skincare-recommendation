import type { ProductType } from "@/data/types";

/**
 * Maps a product to a bottle illustration when it has no real photo —
 * replaces the flat-vector `BottleIcon` set anywhere a product appears in a
 * list, per the container-shape reference the illustration set was drawn
 * against. That set is gone now — deleted as dead code once nothing else in
 * the tree still rendered it (hygiene audit); `components/BottleIcon.tsx`
 * keeps only `defaultPackagingType`, which is unrelated to this module.
 *
 * ## The mapping
 *
 * Drawn from `design-watercolor/skincare icons/` — a set with each
 * product's type name literally painted on the bottle/jar itself
 * ("Serum", "Moisturizer", …), one file per `ProductType`. This replaces
 * this file's previous shape-only set (dropper, pump, jar, …), which had
 * to double up several `ProductType`s onto one shared container shape;
 * every real type gets its own dedicated, correctly-labeled icon now.
 *
 * | ProductType | File |
 * |---|---|
 * | cleanser | bottle-cleanser.png |
 * | toner | bottle-toner.png |
 * | essence | bottle-essence.png |
 * | serum | bottle-serum.png |
 * | ampoule | bottle-ampoule.png |
 * | moisturizer | bottle-moisturizer.png |
 * | sunscreen | bottle-sunscreen.png |
 * | body-wash | bottle-body-wash.png |
 * | body-lotion | bottle-body-lotion.png |
 * | hand-cream | bottle-hand-cream.png |
 *
 * The source set has 18 more icons with no `ProductType` of their own yet
 * (eye cream, facial oil, night mask, exfoliator, lip balm, perfume,
 * facial mist, pressed powder, nail file, sheet mask, deodorant, shampoo,
 * conditioner, hair oil, hair mask, body butter, body scrub, foot cream —
 * see `design-watercolor/skincare icons/`) — not imported, since nothing
 * references them, but ready to pull in the day the catalogue grows a
 * `category` finer than `ProductType`.
 *
 * `unknown` (a product whose type genuinely couldn't be determined — see
 * `data/types.ts`) deliberately does NOT get one of the new labeled icons:
 * every file in the new set has its product-type name painted on it, so
 * showing one for an unknown-type product would assert a specific type we
 * don't actually know — the same overstatement problem this module's
 * fallback has always avoided. `bottle-pump.png`, kept from the previous
 * plain-shape set specifically for this, carries no text.
 */

const FALLBACK = "bottle-pump.png";

const CONTAINER_BY_TYPE: Record<ProductType, string> = {
  cleanser: "bottle-cleanser.png",
  toner: "bottle-toner.png",
  essence: "bottle-essence.png",
  serum: "bottle-serum.png",
  ampoule: "bottle-ampoule.png",
  moisturizer: "bottle-moisturizer.png",
  sunscreen: "bottle-sunscreen.png",
  "body-wash": "bottle-body-wash.png",
  "body-lotion": "bottle-body-lotion.png",
  "hand-cream": "bottle-hand-cream.png",
  unknown: FALLBACK,
};

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

  return CONTAINER_BY_TYPE[product.type] ?? FALLBACK;
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
  "bottle-cleanser.png": require("@/assets/illustrations/bottle-cleanser.png"),
  "bottle-toner.png": require("@/assets/illustrations/bottle-toner.png"),
  "bottle-essence.png": require("@/assets/illustrations/bottle-essence.png"),
  "bottle-serum.png": require("@/assets/illustrations/bottle-serum.png"),
  "bottle-ampoule.png": require("@/assets/illustrations/bottle-ampoule.png"),
  "bottle-moisturizer.png": require("@/assets/illustrations/bottle-moisturizer.png"),
  "bottle-sunscreen.png": require("@/assets/illustrations/bottle-sunscreen.png"),
  "bottle-body-wash.png": require("@/assets/illustrations/bottle-body-wash.png"),
  "bottle-body-lotion.png": require("@/assets/illustrations/bottle-body-lotion.png"),
  "bottle-hand-cream.png": require("@/assets/illustrations/bottle-hand-cream.png"),
  "bottle-pump.png": require("@/assets/illustrations/bottle-pump.png"),
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
