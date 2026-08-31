import { Pressable, Text } from "react-native";

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
      className={
        selected
          ? "rounded-full border border-teal-600 bg-teal-600 px-4 py-2"
          : disabled
            ? "rounded-full border border-slate-200 bg-slate-50 px-4 py-2"
            : "rounded-full border border-slate-300 bg-white px-4 py-2 active:bg-slate-100"
      }
    >
      <Text
        className={
          selected
            ? "text-sm font-semibold text-white"
            : disabled
              ? "text-sm font-medium text-slate-300"
              : "text-sm font-medium text-slate-700"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
