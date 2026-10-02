import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import type { ProductWithIngredients } from "@/data/types";
import { haptic } from "@/lib/haptics";
import { placesLabel, routinePlacesFor } from "@/lib/routine-builder";
import { CARD_RADIUS, CHOSEN, INK, LINK, MUTED, SPACE, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * "Add to my routine" under a result (owner, 2 October 2026): one tap puts
 * the product in the step it belongs to, which we work out
 * (`routinePlacesFor`), and says which. Offered only for a product worth
 * adding (`worthAdding`: a good skin match, or from Skin needs one that works
 * on the pick) and only where a step takes its type. Once in, it says so and
 * offers to take it out, whether or not it would be offered today.
 */
export function AddToRoutine({ product, worthAdding }: { product: ProductWithIngredients; worthAdding: boolean }) {
  const places = routinePlacesFor(product);
  const picks = useAppStore((s) => s.routinePicks);
  const addToRoutine = useAppStore((s) => s.addToRoutine);
  const removeFromRoutine = useAppStore((s) => s.removeFromRoutine);
  const mine = places.filter((place) => picks[place.id] === product.id);
  if (places.length === 0) return null;

  if (mine.length > 0) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: CHOSEN.fill, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}>
        <Ionicons name="checkmark-circle" size={20} color={LINK} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>In your routine</Text>
          <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{placesLabel(mine)}</Text>
        </View>
        <Pressable onPress={() => removeFromRoutine(product.id)} accessibilityRole="button" accessibilityLabel="Remove from my routine" hitSlop={12} className="active:opacity-70">
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Remove</Text>
        </Pressable>
      </View>
    );
  }
  if (!worthAdding) return null;
  // One product a step: adding this one takes the place of one they picked before.
  const replaces = places.some((place) => picks[place.id] !== undefined && picks[place.id] !== product.id);
  return (
    <View style={{ gap: SPACE.text }}>
      <PrimaryButton
        variant="tertiary"
        label="Add to my routine"
        onPress={() => {
          haptic.success();
          addToRoutine(
            places.map((place) => place.id),
            product.id,
          );
        }}
      />
      <Text style={{ textAlign: "center", fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>
        It goes in {placesLabel(places)}
        {replaces ? ", in place of the product you picked for it before." : "."}
      </Text>
    </View>
  );
}
