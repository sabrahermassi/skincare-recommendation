import { Image } from "expo-image";

import type { ProductType } from "@/data/types";
import { productIllustrationSource } from "@/lib/productIllustration";

/**
 * A product's picture wherever one appears (v7): the bottle illustration,
 * a transparent PNG placed straight on whatever it sits on — never a well,
 * circle, tile or tint behind it.
 */
export function ProductThumbnail({
  product,
  size = 52,
}: {
  product: { id: string; type: ProductType; imageUrl?: string | null };
  size?: number;
}) {
  return <Image source={productIllustrationSource(product)} style={{ width: size, height: size }} contentFit="contain" accessibilityLabel="" />;
}
