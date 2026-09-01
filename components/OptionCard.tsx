import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";

type Props = {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
};

/** A single-select tappable card, used across the gender, age, area, skin-type and routine steps. */
export function OptionCard({ label, hint, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      // Border width is constant so selecting never nudges the layout.
      className={`flex-row items-center gap-3 rounded-card border-2 p-4 ${
        selected
          ? "border-accent bg-tint-lilac"
          : "border-hairline bg-surface active:bg-canvas"
      }`}
    >
      <View className="flex-1">
        <Text
          className={`text-base font-sans-semibold ${selected ? "text-accent-text" : "text-ink"}`}
        >
          {label}
        </Text>
        {hint ? <Text className="mt-0.5 text-sm text-ink-muted">{hint}</Text> : null}
      </View>

      {/* Selection reads as border + tint + check, so it survives greyscale. */}
      {selected ? (
        <View className="h-5 w-5 items-center justify-center rounded-full bg-accent">
          <Text className="text-[11px] font-sans-bold text-white">✓</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
