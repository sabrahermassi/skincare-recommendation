import { Pressable } from "react-native";

import { Text } from "@/components/Text";

type Props = {
  label: string;
  selected?: boolean;
  /** Out of reach — greyed and genuinely untappable, e.g. past the concern cap. */
  disabled?: boolean;
  /** Announce as a checkbox where more than one can be on at a time. */
  multiple?: boolean;
  onPress: () => void;
};

/**
 * The one selectable control in the app.
 *
 * Gender, age, face or body, skin type on the profile screen and every skin
 * concern all render as this. They used to be three different things — tall
 * bordered cards, compact two-up cards, and this — at three sizes, in two
 * greys, with and without a tick, which made a single quiz look like it had
 * been assembled from three apps.
 *
 * Height, radius and type are fixed here on purpose: there is no size prop.
 * Anywhere a row of choices appears, it looks like this.
 */
export function Chip({
  label,
  selected = false,
  disabled = false,
  multiple = false,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      // `checked`, not `selected` — that's what checkbox/radio roles expose,
      // and it's what announces the unselectable state rather than looking inert.
      accessibilityState={{ checked: selected, disabled }}
      hitSlop={6}
      // Size inline: a control that loses its height class collapses onto its
      // label, and a row of collapsed chips reads as a row of empty boxes.
      style={{ height: 44, opacity: disabled ? 0.4 : 1 }}
      className={`items-center justify-center rounded-chip border px-4 ${
        selected
          ? "border-accent bg-tint-lilac"
          : "border-hairline bg-surface active:bg-canvas"
      }`}
    >
      {/* Unselected sits in muted grey, not full ink: a row of eight options
          in heading-black reads as eight things already chosen. The selected
          one is the only one at full contrast, which is what makes it findable
          at a glance. Selected is a lilac tint with dark accent text, not a
          solid fill — the same soft highlight the skin-type cards and the
          "Also sensitive" toggle use, so a chosen chip looks the same
          wherever a choice is made in the app. */}
      <Text
        className={`text-[14.5px] font-semibold ${
          selected ? "text-accent-text" : "text-ink-muted"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The wrapper every chip row uses, so the gutters match wherever they appear. */
export const CHIP_ROW = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 8,
} as const;
