import { Pressable } from "react-native";

import { HeartIcon } from "@/components/icons";
import { PopOnToggle } from "@/components/PopOnToggle";
import { haptic } from "@/lib/haptics";
import { saveFromTap } from "@/lib/saving";
import { TOUCH_TARGET, VERDICT } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * The heart on a product in a list: filled when the product is saved, and a
 * tap saves or unsaves it at once, for anyone (#300).
 */
export function SaveHeart({ productId, fetchedAt }: { productId: string; fetchedAt?: string }) {
  const saved = useAppStore((s) => s.savedProducts.some((p) => p.id === productId));
  const saveProduct = useAppStore((s) => s.saveProduct);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        if (!saved) saveFromTap(() => saveProduct(productId, fetchedAt), "product");
        else toggleSaved(productId);
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={saved ? "Remove from saved" : "Save"}
      accessibilityState={{ selected: saved }}
      style={{ width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
      className="active:opacity-70"
    >
      <PopOnToggle active={saved}>
        <HeartIcon size={24} filled={saved} color={saved ? VERDICT.low.solid : undefined} />
      </PopOnToggle>
    </Pressable>
  );
}
