import type { ReactNode } from "react";
import { Animated, Pressable, type StyleProp, type ViewStyle } from "react-native";

import { usePressScale } from "@/components/PressableCard";
import { Text } from "@/components/Text";
import { BUTTON, FONT_SCALE } from "@/lib/tokens";

/**
 * Every button in the app (v7 design, 29 September 2026): a terracotta pill
 * with a white SF 16 semibold label, 48pt tall whatever its width. Only the
 * width changes — full width for the main action of a flow, and the fixed
 * widths in `BUTTON_WIDTH` for a pop-up, a card or a confirm pair. Flat: no
 * shadow. **tertiary** is the outline, **destructive** the red of "Report a
 * mistake"; **secondary** is kept for the scanner's second action until that
 * screen is redesigned. Disabled looks the same in every variant.
 *
 * The height is an inline `style`, not a `h-[48px]` utility, and that is
 * deliberate. A Tailwind class is only as good as the compiled stylesheet
 * behind it: if Metro is serving a cached build, or a class never made it into
 * the output, the class silently does nothing and the button collapses to the
 * height of its label — which is exactly how these buttons kept turning up
 * "tiny" after three separate passes had set the height correctly. An inline
 * style has no pipeline to go wrong.
 *
 * Pressed, it shrinks a little (owner decision, #313) — the same spring as a
 * pressed card. Disabled, it has no pressed state at all.
 */
type ButtonSize = 44 | 48;

type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";

/** v7's fixed button widths; a main action takes the full width instead. */
export const BUTTON_WIDTH = { secondary: 220, inCard: 180, pair: 140 } as const;

/** Every filled button's height (v7/v9). */
export const BUTTON_HEIGHT = 48;

/** Room for the label's line, so a large text size isn't clipped. */
const LABEL_LINE_HEIGHT = 20;

/** Tighter lines for a label allowed onto two. */
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
  size = BUTTON_HEIGHT,
  disabled = false,
  icon,
  className = "",
  style,
  accessibilityLabel,
  twoLines = false,
}: Props) {
  const [scale, press] = usePressScale();
  const outline = variant === "tertiary" && !disabled;
  const background = disabled ? BUTTON.disabled.fill : variant === "tertiary" ? "transparent" : BUTTON[variant].fill;
  const labelColor = disabled ? BUTTON.disabled.label : BUTTON[variant].label;

  // The press scale sits on an outer view, with the caller's margins, width
  // and `flex`, since it is what sits in the layout.
  return (
    <Animated.View
      className={className}
      style={[
        { borderRadius: size / 2, backgroundColor: background, transform: [{ scale }] },
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
        className="flex-row items-center justify-center gap-2 px-4"
        // A fixed height with the label centred, so no vertical padding.
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
            fontSize: 16,
            fontWeight: "600",
            letterSpacing: -0.16,
            lineHeight: twoLines ? TWO_LINE_HEIGHT : LABEL_LINE_HEIGHT,
            textAlign: "center",
            includeFontPadding: false,
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
