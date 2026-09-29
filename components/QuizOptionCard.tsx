import { Image } from "expo-image";
import { Pressable } from "react-native";

import { Text } from "@/components/Text";
import { BUTTON, CARD_RADIUS, CHOSEN, INK, SPACE, SURFACE, TYPE } from "@/lib/tokens";
import { haptic } from "@/lib/haptics";

/** v7 tile measurements (read off the hand-off). */
const TILE_MIN_HEIGHT = 124;
const ICON = 60;
const RING = 2;

type Props = {
  /** A require()'d icon from assets/illustrations/quiz. */
  icon: number;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /** Announce as a checkbox where more than one can be on at a time. */
  multiple?: boolean;
  onPress: () => void;
};

/**
 * A quiz answer (v7): a white tile, two to a row, with the watercolour icon
 * over the answer's name. Chosen, it takes the pale chosen fill and a 2pt
 * terracotta ring; at the concerns limit the others dim to 45%. One component
 * for all four steps, so they can't drift apart. The ring is always there
 * (clear when not chosen), so choosing never nudges the layout.
 */
export function QuizOptionCard({ icon, label, selected = false, disabled = false, multiple = false, onPress }: Props) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      style={{
        flexGrow: 1,
        flexBasis: "40%",
        // minHeight, not height: a name that wraps at a large text size grows the tile.
        minHeight: TILE_MIN_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
        gap: SPACE.text,
        paddingTop: SPACE.gutter,
        paddingBottom: SPACE.block,
        paddingHorizontal: SPACE.block,
        borderRadius: CARD_RADIUS,
        borderWidth: RING,
        borderColor: selected ? BUTTON.primary.fill : "transparent",
        backgroundColor: selected ? CHOSEN.fill : SURFACE,
        opacity: disabled ? 0.45 : 1,
      }}
      className="active:opacity-80"
    >
      <Image source={icon} style={{ width: ICON, height: ICON }} contentFit="contain" accessibilityLabel="" />
      <Text style={{ textAlign: "center", fontSize: TYPE.label, fontWeight: "600", lineHeight: 19, color: INK }}>{label}</Text>
    </Pressable>
  );
}

/** The tiles' two-per-row grid (v7: 12pt apart); an odd last tile takes the whole row. */
export const QUIZ_OPTION_GRID = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: SPACE.block,
} as const;
