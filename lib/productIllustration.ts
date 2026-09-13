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
 * all the catalogue currently carries. Drawn from `design-watercolor/
 * skincare icons/`, a named-by-shape set (dropper, pump, jar, tube, …)
 * replacing this file's original arbitrarily-numbered `illustration-XX.png`
 * set — the shape names below are literal, not inferred.
 *
 * | Container | ProductType(s) | Files |
 * |---|---|---|
 * | Glass dropper bottle | serum, essence | dropper, dropper-round |
 * | Ampoule vial | ampoule | ampoule-vial |
 * | Pump bottle | cleanser, body-wash, body-lotion | pump, pump-tall |
 * | Jar | moisturizer | jar, pot-spatula |
 * | Dedicated sunscreen bottle | sunscreen | sunscreen |
 * | Squeeze tube | hand-cream | squeeze-tube |
 * | Flip-top bottle | toner | flip-top |
 * | (unused today) Spray mister | — | spray-mister |
 * | (unused today) Roll-on | — | roll-on |
 * | (unused today) Stick tube | — | stick-tube |
 * | (unused today) Compact | — | compact |
 * | (unused today) Eye-cream tube | — | squeeze-tube-eye |
 *
 * The "unused today" row is recorded, not deleted, the same way the
 * previous set's unused container groups were — ready for the day the
 * catalogue carries a `category` finer than `ProductType` (mist, roll-on,
 * stick, compact/makeup, eye cream all have no `ProductType` of their own
 * yet) without reworking this file.
 *
 * `ampoule` and `sunscreen` each get their own dedicated icon now — the
 * previous set didn't have shapes distinct enough to give them one, so both
 * borrowed a neighboring container's file. `hand-cream` no longer shares
 * sunscreen's file either, for the same reason.
 *
 * `cleanser` is genuinely ambiguous in the source reference — real
 * cleansers ship in both pump bottles and squeeze tubes. Assigned to the
 * pump-bottle group here, since that's the more common shape for the
 * liquid/gel cleansers this catalogue actually has ("nettoyant moussant
 * visage", "Low pH good morning gel cleanser") — a foam cleanser
 * specifically would want the tube, but `ProductType` doesn't distinguish
 * the two.
 *
 * `unknown` (a product whose type genuinely couldn't be determined — see
 * `data/types.ts`) gets the same fallback as a `ProductType` we've simply
 * never seen: a container silhouette is furniture on a product row, not a
 * claim about the product, so drawing *a* bottle for it doesn't overstate
 * what's known the way showing "Serum" as text would.
 */

const GLASS_DROPPER = ["bottle-dropper.png", "bottle-dropper-round.png"];
const AMPOULE = ["bottle-ampoule-vial.png"];
const PUMP = ["bottle-pump.png", "bottle-pump-tall.png"];
const JAR = ["bottle-jar.png", "bottle-pot-spatula.png"];
const SUNSCREEN = ["bottle-sunscreen.png"];
const SQUEEZE_TUBE = ["bottle-squeeze-tube.png"];
const FLIP_TOP = ["bottle-flip-top.png"];

/** The fallback everything else — including `unknown` — resolves to. */
const FALLBACK = PUMP[0];

const CONTAINER_BY_TYPE: Record<ProductType, string[]> = {
  serum: GLASS_DROPPER,
  essence: GLASS_DROPPER,
  ampoule: AMPOULE,
  cleanser: PUMP,
  "body-wash": PUMP,
  "body-lotion": PUMP,
  moisturizer: JAR,
  sunscreen: SUNSCREEN,
  "hand-cream": SQUEEZE_TUBE,
  toner: FLIP_TOP,
  unknown: PUMP,
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
  "bottle-dropper.png": require("@/assets/illustrations/bottle-dropper.png"),
  "bottle-dropper-round.png": require("@/assets/illustrations/bottle-dropper-round.png"),
  "bottle-ampoule-vial.png": require("@/assets/illustrations/bottle-ampoule-vial.png"),
  "bottle-pump.png": require("@/assets/illustrations/bottle-pump.png"),
  "bottle-pump-tall.png": require("@/assets/illustrations/bottle-pump-tall.png"),
  "bottle-jar.png": require("@/assets/illustrations/bottle-jar.png"),
  "bottle-pot-spatula.png": require("@/assets/illustrations/bottle-pot-spatula.png"),
  "bottle-sunscreen.png": require("@/assets/illustrations/bottle-sunscreen.png"),
  "bottle-squeeze-tube.png": require("@/assets/illustrations/bottle-squeeze-tube.png"),
  "bottle-flip-top.png": require("@/assets/illustrations/bottle-flip-top.png"),
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
