import type { Concern, Product, SkinType } from "@/data/types";

/**
 * PLACEHOLDER match score.
 *
 * Real personalisation logic lands here later. For now this is deterministic
 * (hashed from the product id + profile) rather than `Math.random()`, because
 * a random score would change on every re-render and look broken.
 *
 * It does lean on the real profile so the demo behaves plausibly: products that
 * list your skin type and concerns score higher.
 */
export function matchScore(
  product: Product,
  skinType: SkinType | null,
  concerns: Concern[]
): number {
  let score = 55;

  if (skinType && product.suitableFor.includes(skinType)) score += 20;

  const overlap = concerns.filter((c) => product.targets.includes(c)).length;
  score += Math.min(overlap, 2) * 10;

  // Stable jitter so equal-scoring products don't all show the same number.
  score += hash(product.id + (skinType ?? "") + concerns.join(",")) % 6;

  return Math.max(0, Math.min(99, score));
}

export function matchTone(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
