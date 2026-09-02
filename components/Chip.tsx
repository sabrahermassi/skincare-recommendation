import { Pressable } from "react-native";

import { Text } from "@/components/Text";

type Props = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function Chip({ label, selected = false, disabled = false, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // Announce the unselectable state rather than only looking inert.
      accessibilityState={{ selected, disabled }}
      hitSlop={6}
      // Height inline, like every other control here — and 40pt rather than the
      // 34 the design draws, so the age row sits comfortably under the taller
      // gender cards above it instead of reading as an afterthought.
      style={{ height: 40 }}
      className={`items-center justify-center rounded-chip border px-4 ${
        selected
          ? "border-accent bg-accent"
          : disabled
            ? "border-hairline bg-canvas"
            : "border-hairline bg-surface active:bg-canvas"
      }`}
    >
      <Text
        className={
          selected
            ? "text-sm font-semibold text-white"
            : disabled
              ? "text-sm font-medium text-ink-faint"
              : "text-sm font-medium text-ink-muted"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
