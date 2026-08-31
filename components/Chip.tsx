import { Pressable, Text } from "react-native";

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

export function Chip({ label, selected = false, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={
        selected
          ? "rounded-full border border-teal-600 bg-teal-600 px-4 py-2"
          : "rounded-full border border-slate-300 bg-white px-4 py-2 active:bg-slate-100"
      }
    >
      <Text
        className={
          selected
            ? "text-sm font-semibold text-white"
            : "text-sm font-medium text-slate-700"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
