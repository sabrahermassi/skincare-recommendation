import { Image } from "expo-image";
import { View } from "react-native";

import type { ProductType } from "@/data/types";
import { productIllustrationSource } from "@/lib/productIllustration";
import { CANVAS } from "@/lib/tokens";

/**
 * A product's thumbnail wherever one appears in a list — Browse
 * (`ProductRow.tsx`), Saved, History, and eventually the rest of
 * `lib/productIllustration.ts`'s own "Where to apply it" list.
 *
 * Same tile treatment the old `BottleIcon` component used (canvas-fill
 * square, rounded corners, the art centred with margin around it so it
 * reads as a thumbnail rather than a crop) — this replaced what that tile
 * drew. `BottleIcon` itself is gone now (deleted as dead code, hygiene
 * audit); `components/BottleIcon.tsx` keeps only `defaultPackagingType`,
 * which this file's caller still needs.
 */
export function ProductThumbnail({
  product,
  size = 46,
  radius = 12,
}: {
  product: { id: string; type: ProductType; imageUrl?: string | null };
  size?: number;
  radius?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: CANVAS,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Image
        source={productIllustrationSource(product)}
        style={{ width: size * 0.74, height: size * 0.74 }}
        contentFit="contain"
      />
    </View>
  );
}
