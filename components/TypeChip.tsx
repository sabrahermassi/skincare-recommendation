import { Pressable } from "react-native";

// One selected-outline color app-wide — see profile.tsx's own note on why
// this FOR.ME shell token is reused outside its original scope.
import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { BORDER_INACTIVE, CANVAS, CHIP_SHADOW, INK, MUTED, RADIUS_SELECTOR, SELECTED, TOUCH_TARGET } from "@/lib/tokens";

/** A single-choice pill for a product type — Browse's filter row and add-product's type picker. */
export function TypeChip({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      style={{
        height: TOUCH_TARGET,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADIUS_SELECTOR,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? TERRACOTTA : BORDER_INACTIVE,
        backgroundColor: selected ? SELECTED : CANVAS,
        ...CHIP_SHADOW,
      }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: 13.5, fontWeight: "600", color: selected ? INK : MUTED }}>{label}</Text>
    </Pressable>
  );
}
