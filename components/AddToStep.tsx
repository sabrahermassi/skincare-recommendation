import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import type { ProductWithIngredients } from "@/data/types";
import { haptic } from "@/lib/haptics";
import { routineStepOf } from "@/lib/routine-builder";
import { CARD_RADIUS, CHOSEN, INK, LINK, SPACE, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * "Add to <step>" under a result, only for a scan started from one of the
 * routine's steps (owner, 3 October 2026: the one place a product is added;
 * the routine's own "Scan one to check"). Offered when the product belongs in
 * that step and nothing in it is a hard warning; once in, it says so and
 * offers to take it out. A product no step takes, or from anywhere else,
 * gets nothing.
 */
export function AddToStep({ product, step, blocked }: { product: ProductWithIngredients; step: string | undefined; blocked: boolean }) {
  const place = routineStepOf(step);
  const picked = useAppStore((s) => (place ? s.routinePicks[place.id] : undefined));
  const addToStep = useAppStore((s) => s.addToStep);
  const removeFromRoutine = useAppStore((s) => s.removeFromRoutine);
  if (!place) return null;

  if (picked === product.id) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: CHOSEN.fill, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}>
        <Ionicons name="checkmark-circle" size={20} color={LINK} />
        <Text style={{ flex: 1, fontSize: TYPE.label, fontWeight: "600", color: INK }}>In your routine · {place.label}</Text>
        <Pressable onPress={() => removeFromRoutine(product.id)} accessibilityRole="button" accessibilityLabel="Remove from my routine" hitSlop={12} className="active:opacity-70">
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Remove</Text>
        </Pressable>
      </View>
    );
  }
  if (blocked || !place.fits(product)) return null;
  return (
    <PrimaryButton
      variant="tertiary"
      label={`Add to ${place.label.toLowerCase()}`}
      onPress={() => {
        haptic.success();
        addToStep(place.id, product.id);
      }}
    />
  );
}
