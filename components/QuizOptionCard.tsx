import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { LiftedCard, usePressScale } from "@/components/PressableCard";
import { Text } from "@/components/Text";
import { CTA_TEXT, TERRACOTTA } from "@/components/shell/shared";
import { CANVAS, INK, LINE, RADIUS_SELECTOR, SELECTED } from "@/lib/tokens";
import { haptic } from "@/lib/haptics";

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
  const [scale, press] = usePressScale();

  return (
    // Lifted off the page by a shade under its bottom edge, and sinking a little
    // while it is pressed. The shade and the press live on this outer view; the
    // border and layout stay on the Pressable inside.
    <LiftedCard
      radius={RADIUS_SELECTOR}
      backgroundColor={selected ? SELECTED : CANVAS}
      scale={scale}
      style={{ width: grid ? "48%" : undefined, marginBottom: 10, opacity: disabled ? 0.5 : 1 }}
    >
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      disabled={disabled}
      {...press}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, disabled }}
      hitSlop={4}
      style={{
        // minHeight, not height: at the default font scale every card still
        // renders at exactly CARD_HEIGHT (alignItems:"center" does the
        // rest), so nothing here changes normally. It only grows past 76 for
        // accessibility font sizes large enough to wrap a label onto a 3rd
        // line — same fix, same reasoning, as the quiz question box above
        // these cards (see QuizScreen.tsx).
        minHeight: CARD_HEIGHT,
        paddingVertical: 10,
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
          {/* A drawn checkmark, not the ✓ character — same shape this app
              already draws elsewhere (see the "Things to know" bullets on
              `app/ingredient/[inci].tsx`), so it renders identically on
              every platform instead of picking up whatever glyph metrics
              the system font happens to give that character. */}
          <Svg width={tickSize * 0.55} height={tickSize * 0.55} viewBox="0 0 24 24" fill="none">
            <Path
              d="m5 12.6 4.6 4.6L19 6.8"
              stroke={CTA_TEXT}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      ) : null}
    </Pressable>
    </LiftedCard>
  );
}

/** Two-per-row wrapper for the concerns screen. */
export const QUIZ_OPTION_GRID = {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
} as const;
