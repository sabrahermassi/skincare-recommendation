import type { PackagingType, ProductType } from "./types";

/**
 * A sensible `productType` for catalogue rows that predate the column — real
 * sources (Supabase) carry the merchandising `type` but not yet a packaging
 * shape. Not used by the hand-written sample catalogue, which sets
 * `productType` explicitly per product.
 *
 * Moved here from `components/BottleIcon.tsx` (#206), whose drawings had long
 * gone: a data mapping belongs below the UI, and `data/api.ts` importing a
 * component was the one place the data layer reached up into it.
 */
export function defaultPackagingType(type: ProductType): PackagingType {
  switch (type) {
    case "cleanser":
    case "body-wash":
    case "micellar-water":
      return "cleanser-tube";
    case "toner":
      return "toner";
    case "essence":
      return "serum";
    case "serum":
      return "serum";
    case "ampoule":
      return "ampoule";
    case "moisturizer":
    case "hand-cream":
    case "eye-cream":
    case "night-mask":
    case "sheet-mask":
    case "hair-mask":
    case "body-butter":
    case "body-scrub":
    case "foot-cream":
    case "lip-balm":
    // No shape drawn on this axis any more (see the file header) — grouped
    // with the other jars as the closest fit.
    case "face-mask":
    case "eye-patch":
    case "pimple-patch":
      return "cream-jar";
    case "sunscreen":
      return "sunscreen";
    case "body-lotion":
      return "lotion-pump";
    case "facial-oil":
    case "hair-oil":
      return "serum";
    case "exfoliator":
    case "deodorant":
      return "cleanser-tube";
    case "shampoo":
    case "conditioner":
      return "lotion-pump";
    case "perfume":
    case "facial-mist":
      return "mist";
    // No real shape to draw for a type we don't know.
    case "unknown":
      return "serum";
  }
}
