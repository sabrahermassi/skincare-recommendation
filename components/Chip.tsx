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
      // 8px of extra hit area on each side — the chip is 34pt tall, which
      // needs the padding to clear the 44pt touch minimum.
      hitSlop={8}
      className={
        selected
          ? "rounded-chip border border-accent bg-accent px-3.5 py-2"
          : disabled
            ? "rounded-chip border border-hairline bg-canvas px-3.5 py-2"
            : "rounded-chip border border-hairline bg-surface px-3.5 py-2 active:bg-canvas"
      }
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
