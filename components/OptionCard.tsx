import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";

type Props = {
  label: string;
  hint?: string;
  /** A 44pt illustration tile, shown before the label. */
  icon?: ReactNode;
  selected: boolean;
  /**
   * Still tappable, but visibly out of reach — used by the concerns step once
   * three are picked, so the limit is visible before it is hit rather than
   * only being announced after a tap does nothing.
   */
  dimmed?: boolean;
  /**
   * The tighter card the profile screen packs two-to-a-row. Same anatomy,
   * less air — a full-height quiz card twice over does not fit the width.
   */
  compact?: boolean;
  onPress: () => void;
};

/** A single-select tappable card, used across the gender, age, area, skin-type and routine steps. */
export function OptionCard({
  label,
  hint,
  icon,
  selected,
  dimmed = false,
  compact = false,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      // Border width is constant so selecting never nudges the layout.
      className={`flex-row items-center gap-3 rounded-card border-2 ${
        compact ? "min-h-[44px] px-3 py-2.5" : "px-3.5 py-4"
      } ${
        selected
          ? "border-accent bg-tint-lilac"
          : "border-hairline bg-surface active:bg-canvas"
      } ${dimmed && !selected ? "opacity-45" : ""}`}
    >
      {icon}

      <View className="flex-1">
        <Text
          className={`font-semibold ${compact ? "text-[14.5px]" : "text-base"} ${
            selected ? "text-accent-text" : "text-ink"
          }`}
        >
          {label}
        </Text>
        {hint ? <Text className="mt-0.5 text-[13px] leading-4 text-ink-muted">{hint}</Text> : null}
      </View>

      {/* Selection reads as border + tint + check, so it survives greyscale.
          The empty box holds the row's height steady between states. */}
      <View className="h-5 w-5 items-center justify-center rounded-full">
        {selected ? (
          <View className="h-5 w-5 items-center justify-center rounded-full bg-accent">
            <Text className="text-[11px] font-bold text-white">✓</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
