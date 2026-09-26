import { Pressable } from "react-native";

// One selected-outline color app-wide — see profile.tsx's own note on why
// this FOR.ME shell token is reused outside its original scope.
import { Text } from "@/components/Text";
import { BORDER_INACTIVE, CANVAS, CHIP_SHADOW, CHOSEN, FILTER_HIT_SLOP, FILTER_PILL, MUTED } from "@/lib/tokens";

/** A single-choice pill for a product type — Saved's step filter. */
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
      hitSlop={FILTER_HIT_SLOP}
      style={{
        height: FILTER_PILL.height,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: FILTER_PILL.radius,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? CHOSEN.border : BORDER_INACTIVE,
        backgroundColor: selected ? CHOSEN.fill : CANVAS,
        ...CHIP_SHADOW,
      }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: FILTER_PILL.fontSize, fontWeight: "600", color: selected ? CHOSEN.label : MUTED }}>{label}</Text>
    </Pressable>
  );
}
