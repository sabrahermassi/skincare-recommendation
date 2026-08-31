import type { Concern, Ingredient, ProductWithIngredients, SkinType } from "@/data/types";
import { contraindications, type Contraindication } from "./safety";

/**
 * PLACEHOLDER match score. Real personalisation logic replaces this file
 * (issue #5) — but it is not free to get wrong in the meantime, so it now
 * reads the formula rather than trusting product-level tags alone.
 *
 * Deterministic (hashed from the product id + profile) rather than
 * `Math.random()`, because a random score re-rolls on every render and reads
 * as a bug.
 */

export type MatchResult = {
  score: number;
  /** Ingredients that are a problem for this specific profile. */
  warnings: Contraindication[];
};

/** Score above which a product may be presented as a good match. */
const CONTRAINDICATED_CEILING = 45;

export function matchProduct(
  product: ProductWithIngredients,
  skinType: SkinType | null,
  concerns: Concern[]
): MatchResult {
  let score = 55;

  if (skinType && product.suitableFor.includes(skinType)) score += 20;

  const overlap = concerns.filter((c) => product.targets.includes(c)).length;
  score += Math.min(overlap, 2) * 10;

  // Stable jitter so equal-scoring products don't all show the same number.
  score += hash(product.id + (skinType ?? "") + concerns.join(",")) % 6;

  const warnings = contraindications(product.ingredients, skinType, concerns);

  // A product the formula contradicts must not outrank one it doesn't, however
  // well its marketing tags line up. Capping rather than zeroing keeps the
  // ordering meaningful among contraindicated products.
  if (warnings.length > 0) {
    score = Math.min(score, CONTRAINDICATED_CEILING) - (warnings.length - 1) * 5;
  }

  return { score: clamp(score), warnings };
}

export function matchTone(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function clamp(score: number): number {
  return Math.max(0, Math.min(99, Math.round(score)));
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Re-exported so screens don't need a second import to render warnings. */
export type { Contraindication, Ingredient };
