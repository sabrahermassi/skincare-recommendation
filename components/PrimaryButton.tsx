import type { ReactNode } from "react";
import { Animated, Pressable, type StyleProp, type ViewStyle } from "react-native";

import { usePressScale } from "@/components/PressableCard";
import { Text } from "@/components/Text";
import { WatercolorFill } from "@/components/WatercolorFill";
import { BUTTON_SHADOW, CTA, GRAY_FILL, INK, MUTED_FAINT } from "@/lib/tokens";

/**
 * Every full-width button in the app, in Apple's two styles that the app
 * uses: **filled** — the peach call to action, one per screen — and **gray**,
 * for a secondary action beside it (#313).
 *
 * The height is an inline `style`, not a `h-[56px]` utility, and that is
 * deliberate. A Tailwind class is only as good as the compiled stylesheet
 * behind it: if Metro is serving a cached build, or a class never made it into
 * the output, the class silently does nothing and the button collapses to the
 * height of its label — which is exactly how these buttons kept turning up
 * "tiny" after three separate passes had set the height correctly. An inline
 * style has no pipeline to go wrong.
 *
 * 56pt is the design's own figure for the quiz and welcome CTAs and is a
 * comfortable target — well above the 44pt minimum. `size` exists for the
 * places the design draws them shorter, not as a free dial.
 *
 * Pressed, it shrinks a little (owner decision, #313) — the same spring as a
 * pressed card. It used to dim only its inner layer over a fill of the same
 * colour, which barely showed.
 */
type ButtonSize = 48 | 50 | 52 | 56;

/**
 * Playfair Display sits low in its line box, so a label centred by its box looks
 * about 2dp too low in the pill; the label is moved up by this much.
 *
 * A transform, not padding: padding inside a label that is already squeezed into
 * the button shrinks the room its letters have, which cut the bottom off the "p"
 * on a phone.
 */
const LABEL_LIFT = 2;

/** Room for Playfair's tall ascenders and its descenders ("p") at the label's 15dp. */
const LABEL_LINE_HEIGHT = 22;

type Props = {
  label: string;
  onPress: () => void;
  /** "filled" is the peach call to action; "gray" a secondary action beside it. */
  variant?: "filled" | "gray";
  size?: ButtonSize;
  disabled?: boolean;
  /** A glyph before the label, e.g. the heart on "Save to my shelf". */
  icon?: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function PrimaryButton({
  label,
  onPress,
  variant = "filled",
  size = 56,
  disabled = false,
  icon,
  className = "",
  style,
  accessibilityLabel,
}: Props) {
  const [scale, press] = usePressScale();
  const filled = variant === "filled" && !disabled;
  const background = disabled ? GRAY_FILL : filled ? CTA : GRAY_FILL;

  // The shade and the press scale sit on an outer view: the button clips its
  // wash to the pill, and a view that clips loses its own shade on iOS. Margins
  // and `flex` from the caller go here too, since it is what sits in the layout.
  return (
    <Animated.View
      className={className}
      style={[
        { borderRadius: size / 2, backgroundColor: background, transform: [{ scale }] },
        filled ? BUTTON_SHADOW : null,
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
        className="flex-row items-center justify-center gap-2.5 px-5"
        // A fixed height with the label centred, so no vertical padding: 16
        // either side left a 50dp button only 18dp for a label that needs 22,
        // and a phone clips what does not fit.
        style={{ height: size, borderRadius: size / 2, overflow: "hidden" }}
      >
        {filled ? <WatercolorFill /> : null}
        {icon}
        <Text
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 15,
            lineHeight: LABEL_LINE_HEIGHT,
            includeFontPadding: false,
            transform: [{ translateY: -LABEL_LIFT }],
            color: disabled ? MUTED_FAINT : INK,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
