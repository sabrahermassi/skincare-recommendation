import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";
import { haptic } from "@/lib/haptics";
import { BUTTON, CHECK_RING, CHOSEN, INK, MUTED, OPTION_LINE, SPACE, SURFACE, TYPE, WHITE, RADIUS, LEADING } from "@/lib/tokens";

// v9 row measurements, read off the hand-off.
const ROW_RADIUS = RADIUS.card;
const ROW_MIN_HEIGHT = 56;
const ROW_MIN_HEIGHT_WITH_LINE = 72;
const RING = 1.5;
const CHECK = 24;

type Props = {
  label: string;
  /** One line under the name, saying what the answer means ("Feels tight, might be flaky"). */
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  /** Announce as a checkbox where more than one can be on at a time. */
  multiple?: boolean;
  onPress: () => void;
};

/**
 * An answer row (v9): full width, white on the sage page, the answer's name
 * (and, where it helps, a line saying what it means) on the left and a round
 * tick on the right. Chosen, it takes the pale sage fill, a sage outline and
 * a filled tick; at the concerns limit the others dim to 45%. One component
 * for every step of the skin quiz, so they can't drift apart.
 * The outline is always there (grey when not chosen), so choosing never
 * nudges the layout.
 */
export function QuizOptionCard({ label, description, selected = false, disabled = false, multiple = false, onPress }: Props) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ checked: selected, disabled }}
      style={{
        // minHeight, not height: a name that wraps at a large text size grows the row.
        minHeight: description ? ROW_MIN_HEIGHT_WITH_LINE : ROW_MIN_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.block,
        paddingVertical: SPACE.block,
        paddingLeft: SPACE.inset,
        paddingRight: SPACE.gutter,
        borderRadius: ROW_RADIUS,
        borderWidth: RING,
        borderColor: selected ? BUTTON.primary.fill : OPTION_LINE,
        backgroundColor: selected ? CHOSEN.fill : SURFACE,
        opacity: disabled ? 0.45 : 1,
      }}
      className="active:opacity-80"
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: TYPE.card, fontWeight: "600", lineHeight: LEADING.card, color: INK }}>{label}</Text>
        {description ? <Text style={{ fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{description}</Text> : null}
      </View>
      <View
        style={{
          width: CHECK,
          height: CHECK,
          borderRadius: CHECK / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? BUTTON.primary.fill : "transparent",
          borderWidth: selected ? 0 : RING,
          borderColor: CHECK_RING,
        }}
      >
        {selected ? (
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
            <Path d="M20 6 9 17l-5-5" stroke={WHITE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
    </Pressable>
  );
}

/** The answers' list (v9): one under another, 12pt apart. */
export const QUIZ_OPTION_GRID = {
  gap: SPACE.block,
} as const;
