import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";

/**
 * The top row every pushed screen in the design carries: a back chevron on the
 * canvas, an optional centred title, and an optional action slot on the right.
 *
 * It replaces the React Navigation header on these routes. The design draws no
 * native header anywhere — the screens are full-bleed, and a grey system bar
 * with its own title sitting above a screen that already draws one read as a
 * duplicate, which is exactly how it looked.
 */
export function ScreenHeader({
  title,
  right,
  onBack,
}: {
  title?: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row items-center justify-between gap-3 px-6 pb-1"
      style={{ paddingTop: insets.top + 10 }}
    >
      <Pressable
        onPress={onBack ?? (() => router.back())}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="w-[21px]"
      >
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
          <Path
            d="m15 5-7 7 7 7"
            stroke="#453F4E"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>

      {title ? (
        <Text
          className="flex-1 text-center text-base font-medium tracking-tight text-ink"
          numberOfLines={1}
        >
          {title}
        </Text>
      ) : (
        <View className="flex-1" />
      )}

      {/* Mirrors the chevron's width when empty, so a centred title stays centred. */}
      <View className="min-w-[21px] flex-row items-center justify-end gap-5">{right}</View>
    </View>
  );
}
