import type { ReactNode } from "react";
import { Animated, Pressable, type StyleProp, type ViewStyle } from "react-native";

import { usePressScale } from "@/components/PressableCard";
import { Text } from "@/components/Text";
import { BUTTON, BUTTON_SHADOW, FONT_SCALE } from "@/lib/tokens";

/**
 * Every full-width button in the app, in three variants (owner, 27 September
 * 2026, colours in `BUTTON`): **primary**, the one main action on a screen;
 * **secondary**, a less critical action, often beside it; and **tertiary**,
 * an outline for low-emphasis actions. Disabled looks the same in all three.
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
 * pressed card. Disabled, it has no pressed state at all.
 */
type ButtonSize = 48 | 50 | 52 | 56;

export type ButtonVariant = "primary" | "secondary" | "tertiary";

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

/** Tighter lines for a label allowed onto two, so both fit a 56dp pill. */
const TWO_LINE_HEIGHT = 18;

type Props = {
  label: string;
  onPress: () => void;
  /** "primary" is the one main action on a screen; see the note above for the others. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** A glyph before the label, e.g. the heart on "Save to my shelf". */
  icon?: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /**
   * Lets a long label take two lines instead of being cut off: for a button that
   * shares its row with another, where half the width can't hold it on one line.
   */
  twoLines?: boolean;
};

export function PrimaryButton({
  label,
  onPress,
  variant = "primary",
  size = 56,
  disabled = false,
  icon,
  className = "",
  style,
  accessibilityLabel,
  twoLines = false,
}: Props) {
  const [scale, press] = usePressScale();
  const primary = variant === "primary" && !disabled;
  const outline = variant === "tertiary" && !disabled;
  const background = disabled ? BUTTON.disabled.fill : variant === "tertiary" ? "transparent" : BUTTON[variant].fill;
  const labelColor = disabled ? BUTTON.disabled.label : BUTTON[variant].label;

  // The shade and the press scale sit on an outer view: a view that clips loses
  // its own shade on iOS. Margins and `flex` from the caller go here too, since
  // it is what sits in the layout.
  return (
    <Animated.View
      className={className}
      style={[
        { borderRadius: size / 2, backgroundColor: background, transform: [{ scale }] },
        primary ? BUTTON_SHADOW : null,
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
        // The outline is drawn inside the fixed height, so it never makes the
        // button taller.
        style={[
          { height: size, borderRadius: size / 2, overflow: "hidden" },
          outline ? { borderWidth: BUTTON.tertiary.borderWidth, borderColor: BUTTON.tertiary.border } : null,
        ]}
      >
        {icon}
        <Text
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 15,
            lineHeight: twoLines ? TWO_LINE_HEIGHT : LABEL_LINE_HEIGHT,
            textAlign: "center",
            includeFontPadding: false,
            transform: [{ translateY: -LABEL_LIFT }],
            color: labelColor,
          }}
          numberOfLines={twoLines ? 2 : 1}
          // Breaks so no word is left alone on the second line.
          lineBreakStrategyIOS="standard"
          // A fixed-height pill: its label keeps the ordinary ceiling even
          // inside a `ReadingScale` (#334).
          maxFontSizeMultiplier={FONT_SCALE.display}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
