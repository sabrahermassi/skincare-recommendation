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
 * The source set had 18 icons with no `ProductType` of their own; 16 were
 * wired in first. `pressed-powder` and `nail-file` were deliberately left
 * out — neither is a formula with an ingredient list to judge, so neither
 * fits this app's scoring model. Three more — `face-mask`, `eye-patch`,
 * `pimple-patch` — were added to the source set and wired in for issue #105,
 * resized to match the rest (the originals arrived at ~2300px on the long
 * edge; everything else here is ~800px).
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
  // Split out of `cleanser` (step 13, PR #130) with no labeled icon of its
  // own drawn yet — falls back to the untexted pump bottle for the same
  // reason `unknown` does: a "Cleanser"-labeled icon would misdescribe it.
  "micellar-water": FALLBACK,
  toner: "bottle-toner.png",
  essence: "bottle-essence.png",
  serum: "bottle-serum.png",
  ampoule: "bottle-ampoule.png",
  moisturizer: "bottle-moisturizer.png",
  sunscreen: "bottle-sunscreen.png",
  "body-wash": "bottle-body-wash.png",
  "body-lotion": "bottle-body-lotion.png",
  "hand-cream": "bottle-hand-cream.png",
  "eye-cream": "bottle-eye-cream.png",
  "facial-oil": "bottle-facial-oil.png",
  "night-mask": "bottle-night-mask.png",
  exfoliator: "bottle-exfoliator.png",
  "lip-balm": "bottle-lip-balm.png",
  perfume: "bottle-perfume.png",
  "facial-mist": "bottle-facial-mist.png",
  "sheet-mask": "bottle-sheet-mask.png",
  deodorant: "bottle-deodorant.png",
  shampoo: "bottle-shampoo.png",
  conditioner: "bottle-conditioner.png",
  "hair-oil": "bottle-hair-oil.png",
  "hair-mask": "bottle-hair-mask.png",
  "body-butter": "bottle-body-butter.png",
  "body-scrub": "bottle-body-scrub.png",
  "foot-cream": "bottle-foot-cream.png",
  "face-mask": "bottle-face-mask.png",
  "eye-patch": "bottle-eye-patch.png",
  "pimple-patch": "bottle-pimple-patch.png",
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
function productIllustration(product: {
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
const ILLUSTRATION_SOURCE: Record<string, number> = {
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
  "bottle-eye-cream.png": require("@/assets/illustrations/bottle-eye-cream.png"),
  "bottle-facial-oil.png": require("@/assets/illustrations/bottle-facial-oil.png"),
  "bottle-night-mask.png": require("@/assets/illustrations/bottle-night-mask.png"),
  "bottle-exfoliator.png": require("@/assets/illustrations/bottle-exfoliator.png"),
  "bottle-lip-balm.png": require("@/assets/illustrations/bottle-lip-balm.png"),
  "bottle-perfume.png": require("@/assets/illustrations/bottle-perfume.png"),
  "bottle-facial-mist.png": require("@/assets/illustrations/bottle-facial-mist.png"),
  "bottle-sheet-mask.png": require("@/assets/illustrations/bottle-sheet-mask.png"),
  "bottle-deodorant.png": require("@/assets/illustrations/bottle-deodorant.png"),
  "bottle-shampoo.png": require("@/assets/illustrations/bottle-shampoo.png"),
  "bottle-conditioner.png": require("@/assets/illustrations/bottle-conditioner.png"),
  "bottle-hair-oil.png": require("@/assets/illustrations/bottle-hair-oil.png"),
  "bottle-hair-mask.png": require("@/assets/illustrations/bottle-hair-mask.png"),
  "bottle-body-butter.png": require("@/assets/illustrations/bottle-body-butter.png"),
  "bottle-body-scrub.png": require("@/assets/illustrations/bottle-body-scrub.png"),
  "bottle-foot-cream.png": require("@/assets/illustrations/bottle-foot-cream.png"),
  "bottle-face-mask.png": require("@/assets/illustrations/bottle-face-mask.png"),
  "bottle-eye-patch.png": require("@/assets/illustrations/bottle-eye-patch.png"),
  "bottle-pimple-patch.png": require("@/assets/illustrations/bottle-pimple-patch.png"),
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
