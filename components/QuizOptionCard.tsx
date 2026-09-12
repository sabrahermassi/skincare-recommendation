import { Image } from "expo-image";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import { TERRACOTTA } from "@/components/shell/shared";
import { CANVAS, INK, LINE, RADIUS_SELECTOR, SELECTED } from "@/lib/tokens";

/** Shared minimum height for every answer button on all four screens — the
 *  concerns grid and the single-column steps — so they stay identical at
 *  default text size, whether a name wraps to one line or two. Cards only
 *  grow past this at accessibility font scales large enough to need a 3rd
 *  line; see the minHeight usage below. */
const CARD_HEIGHT = 76;

type Props = {
  /** A require()'d icon from assets/illustrations/quiz. */
  icon: number;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /** Announce as a checkbox where more than one can be on at a time. */
  multiple?: boolean;
  /** "row" is one option per line (skin type, sensitivity, pregnancy);
   *  "grid" is the concerns screen's two-per-row layout. */
  layout?: "row" | "grid";
  onPress: () => void;
};

/**
 * A quiz answer, per design-watercolor/skin quiz/screens: watercolour icon,
 * the option's name beside it, and a terracotta tick when chosen.
 *
 * One component for both shapes so the four steps can't drift apart — only
 * the sizes differ. The grid's icon and name are smaller because a
 * half-width card has to fit "Fine lines and wrinkles" without truncating.
 */
export function QuizOptionCard({
  icon,
  label,
  selected = false,
  disabled = false,
  multiple = false,
  layout = "row",
  onPress,
}: Props) {
  const grid = layout === "grid";
  const iconSize = grid ? 32 : 50;
  const tickSize = grid ? 22 : 30;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, disabled }}
      hitSlop={4}
      style={{
        width: grid ? "48%" : undefined,
        // minHeight, not height: at the default font scale every card still
        // renders at exactly CARD_HEIGHT (alignItems:"center" does the
        // rest), so nothing here changes normally. It only grows past 76 for
        // accessibility font sizes large enough to wrap a label onto a 3rd
        // line — same fix, same reasoning, as the quiz question box above
        // these cards (see QuizScreen.tsx).
        minHeight: CARD_HEIGHT,
        paddingVertical: 10,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: grid ? 8 : 12,
        paddingLeft: grid ? 10 : 14,
        // Constant, so the tick appearing never reflows the name.
        paddingRight: grid ? 24 : 14,
        borderRadius: RADIUS_SELECTOR,
        // Constant width so choosing an option never nudges the layout.
        borderWidth: 1.5,
        borderColor: selected ? TERRACOTTA : LINE,
        backgroundColor: selected ? SELECTED : CANVAS,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Image
        source={icon}
        style={{ width: iconSize, height: iconSize }}
        contentFit="contain"
        accessibilityLabel=""
      />

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: grid ? 14 : 18.5,
            lineHeight: (grid ? 14 : 18.5) * 1.2,
            color: INK,
          }}
        >
          {label}
        </Text>
      </View>

      {selected ? (
        <View
          style={{
            position: "absolute",
            top: grid ? 6 : undefined,
            right: grid ? 6 : 14,
            width: tickSize,
            height: tickSize,
            borderRadius: tickSize / 2,
            backgroundColor: TERRACOTTA,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: tickSize * 0.5, lineHeight: tickSize * 0.62, color: "#FFFFFF" }}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Two-per-row wrapper for the concerns screen. */
export const QUIZ_OPTION_GRID = {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
} as const;
