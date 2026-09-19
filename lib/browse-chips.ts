import { PRODUCT_TYPE_LABEL, type ProductType } from "@/data/types";

/**
 * Browse chip order for the types the launch catalogue is mostly made of —
 * largest first, as counted from the live catalogue on 2026-09-19. Fixed on
 * purpose: the order is a rough guide set once, not re-sorted on every import.
 */
const LEADING_TYPES: ProductType[] = [
  "sunscreen",
  "moisturizer",
  "cleanser",
  "serum",
  "lip-balm",
  "hand-cream",
  "exfoliator",
  "body-wash",
  "sheet-mask",
  "toner",
  "body-lotion",
  "essence",
];

// Every other real type follows, in the order `ProductType` declares them.
// "unknown" is not a category to browse by, so it never gets a chip.
const CHIP_ORDER: ProductType[] = [
  ...LEADING_TYPES,
  ...(Object.keys(PRODUCT_TYPE_LABEL) as ProductType[]).filter(
    (type) => type !== "unknown" && !LEADING_TYPES.includes(type),
  ),
];

/**
 * The type chips to show: every type with at least one product, in
 * `CHIP_ORDER`. A type with no products has no chip until one arrives.
 */
export function visibleTypeChips(products: readonly { type: ProductType }[]): ProductType[] {
  const present = new Set(products.map((p) => p.type));
  return CHIP_ORDER.filter((type) => present.has(type));
}
