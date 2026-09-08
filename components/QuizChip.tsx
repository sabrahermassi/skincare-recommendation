import { Pressable } from "react-native";

import { Text } from "@/components/Text";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, RADIUS_SELECTOR, SELECTED } from "@/lib/tokens";

type Props = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /** Announce as a checkbox where more than one can be on at a time. */
  multiple?: boolean;
  onPress: () => void;
};

/**
 * The Manassa-system selectable chip — see design/DESIGN_SYSTEM.md's
 * "Selectable chip" section. A sibling of `components/Chip.tsx`, not a
 * replacement: screens not yet restyled to this system (browse, profile)
 * keep using the original lilac/accent `Chip`. Left-aligned text, not
 * centered — a design decision for the quiz's short option labels.
 *
 * Selected state is ink at low opacity, not peach: peach is reserved for the
 * primary CTA everywhere in this system (design/DESIGN_SYSTEM.md's Colour
 * section), so it can't also mean "this option is chosen" without putting
 * two different peach things on one screen.
 */
export function QuizChip({ label, selected = false, disabled = false, multiple = false, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, disabled }}
      hitSlop={6}
      style={{
        minHeight: 52,
        // 2-per-row via an explicit width, not flex:1 inside flexWrap — flex
        // items in a wrapped row size to content by default, which doesn't
        // reliably force exactly two per row when labels differ in length.
        // Paired with the grid's justifyContent:"space-between" below (not
        // "gap", which can overflow a percentage width by its own amount).
        width: "48%",
        marginBottom: 10,
        justifyContent: "center",
        paddingHorizontal: 16,
        borderRadius: RADIUS_SELECTOR,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? INK : BORDER_INACTIVE,
        backgroundColor: selected ? SELECTED : CANVAS,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        style={{
          fontSize: 14.5,
          fontWeight: "500",
          textAlign: "left",
          color: selected ? INK : MUTED,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The wrapper every quiz chip grid uses — 2 per row, equal width, matching gutters. */
export const QUIZ_CHIP_GRID = {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
} as const;
