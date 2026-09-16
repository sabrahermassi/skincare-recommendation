import type { PackagingType, ProductType } from "@/data/types";

/**
 * A sensible `productType` for catalogue rows that predate the column — real
 * sources (Supabase) carry the merchandising `type` but not yet a packaging
 * shape. Not used by the hand-written sample catalogue, which sets
 * `productType` explicitly per product.
 *
 * The bottle icon set this file used to draw (`BtlSerum`, `BottleIcon`, and
 * the rest) is gone — `lib/productIllustration.ts`'s PNG illustrations and
 * `components/ProductThumbnail.tsx` replaced it everywhere, and nothing was
 * still importing the SVG set by the time this was checked (hygiene audit,
 * confirmed against the whole tree, not just this file's own callers). Only
 * this mapping function survives, since `data/api.ts` still needs it.
 */
export function defaultPackagingType(type: ProductType): PackagingType {
  switch (type) {
    case "cleanser":
    case "body-wash":
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
      return "cream-jar";
    case "sunscreen":
      return "sunscreen";
    case "body-lotion":
      return "lotion-pump";
    // No real shape to draw for a type we don't know.
    case "unknown":
      return "serum";
  }
}
