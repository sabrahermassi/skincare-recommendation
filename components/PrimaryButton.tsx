import type { ReactNode } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/Text";

/**
 * Every full-width call to action in the app.
 *
 * The height is an inline `style`, not a `h-[56px]` utility, and that is
 * deliberate. A Tailwind class is only as good as the compiled stylesheet
 * behind it: if Metro is serving a cached build, or a class never made it into
 * the output, the class silently does nothing and the button collapses to the
 * height of its label — which is exactly how these buttons kept turning up
 * "tiny" after three separate passes had set the height correctly. An inline
 * style has no pipeline to go wrong.
 *
 * Padding is set as well as height. With an explicit height it is inert; if the
 * height were ever dropped, it still leaves a real button rather than a strip.
 *
 * 56pt is the design's own figure for the quiz and welcome CTAs and is a
 * comfortable target — well above the 44pt minimum. `size` exists for the two
 * places the design draws them shorter (the detail-screen pairs at 52, the
 * profile footer at 50), not as a free dial.
 */
export type ButtonSize = 50 | 52 | 56;

type Props = {
  label: string;
  onPress: () => void;
  /** Outline instead of filled — the second button in a footer pair. */
  variant?: "filled" | "outline";
  size?: ButtonSize;
  disabled?: boolean;
  /** A glyph before the label, e.g. the heart on "Save to my shelf". */
  icon?: ReactNode;
  /** Selected-state styling for the outline variant (saved, in compare). */
  active?: boolean;
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
  active = false,
  className = "",
  style,
  accessibilityLabel,
}: Props) {
  const fill = disabled
    ? "bg-hairline"
    : variant === "filled"
      ? "bg-accent active:bg-accent-deep"
      : active
        ? "border border-accent bg-tint-lilac"
        : "border border-hairline bg-surface active:bg-canvas";

  const ink = disabled
    ? "text-ink-faint"
    : variant === "filled"
      ? "text-white"
      : "text-ink";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected: active }}
      className={`flex-row items-center justify-center gap-2.5 rounded-control px-5 ${fill} ${className}`}
      style={[{ height: size, paddingVertical: 16 }, style]}
    >
      {icon}
      <Text className={`text-[15.5px] font-semibold ${ink}`} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
