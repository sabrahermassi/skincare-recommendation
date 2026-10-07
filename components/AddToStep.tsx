import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import type { ProductWithIngredients } from "@/data/types";
import { haptic } from "@/lib/haptics";
import { routineStepOf } from "@/lib/routine-builder";
import { CARD_RADIUS, CHOSEN, INK, LINK, MUTED, SPACE, TYPE, LEADING } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * "Add to <step>" under a result, only for a scan started from one of the
 * routine's steps (owner, 3 October 2026: the one place a product is added;
 * the routine's own "Scan one to check"). Offered when the product belongs in
 * that step and nothing in it is a hard warning; once in, it says so and
 * offers to take it out of that step only. A product the step does not take
 * says so, rather than leaving no button and no reason; from anywhere else,
 * or with a hard warning, it gets nothing. The time of day is always named:
 * cleansing and moisturiser stand in both routines.
 */
export function AddToStep({ product, step, blocked }: { product: ProductWithIngredients; step: string | undefined; blocked: boolean }) {
  const place = routineStepOf(step);
  const picked = useAppStore((s) => (place ? s.routinePicks[place.id] : undefined));
  const addToStep = useAppStore((s) => s.addToStep);
  const removeFromStep = useAppStore((s) => s.removeFromStep);
  if (!place) return null;
  const where = `${place.time} ${place.label.toLowerCase()}`;

  if (picked === product.id) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: CHOSEN.fill, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}>
        <Ionicons name="checkmark-circle" size={20} color={LINK} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <Text style={{ flex: 1, fontSize: TYPE.label, fontWeight: "600", color: INK }}>In your routine · {where.charAt(0).toUpperCase() + where.slice(1)}</Text>
        <Pressable onPress={() => removeFromStep(place.id)} accessibilityRole="button" accessibilityLabel={`Remove from ${where}`} hitSlop={12} className="active:opacity-70">
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Remove</Text>
        </Pressable>
      </View>
    );
  }
  if (blocked) return null;
  if (!place.fits(product)) {
    return <Text style={{ fontSize: TYPE.label, lineHeight: LEADING.label, color: MUTED, textAlign: "center" }}>This doesn&apos;t belong in the {where} step, so it can&apos;t be added there.</Text>;
  }
  return (
    <PrimaryButton
      variant="tertiary"
      label={`Add to ${where}`}
      onPress={() => {
        haptic.success();
        addToStep(place.id, product.id);
      }}
    />
  );
}
