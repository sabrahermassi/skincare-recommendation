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
   * Carries the design's 13px radius rather than the 15px of a full card.
   */
  compact?: boolean;
  /**
   * The roomier card the "about you" step gives the four gender options:
   * 24px of vertical padding instead of 16, so four cards fill a step that
   * would otherwise be mostly empty. The design draws it only there.
   */
  roomy?: boolean;
  /**
   * Concerns are a pick-up-to-three list, not a single choice, and assistive
   * tech should say so. Everything else on the quiz is genuinely a radio.
   */
  multiple?: boolean;
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
  roomy = false,
  multiple = false,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      // At the cap an unpicked card is inert. Announcing that is the whole
      // point of dimming it — the visual state alone tells a sighted user.
      accessibilityState={{ selected, disabled: dimmed && !selected }}
      // Border width is constant so selecting never nudges the layout.
      className={`flex-row items-center gap-3 border-2 ${
        compact
          ? "min-h-[44px] rounded-field px-3 py-2.5"
          : roomy
            ? "rounded-card px-4 py-6"
            : "rounded-card px-3.5 py-4"
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
        {hint ? <Text className="mt-0.5 text-[13px] leading-[17.5px] text-ink-muted">{hint}</Text> : null}
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
