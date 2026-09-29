import { router } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackChevron, ICON_CIRCLE, IconCircle } from "@/components/IconCircle";
import { Text } from "@/components/Text";
import { INK, SPACE } from "@/lib/tokens";

/**
 * The top row every pushed screen carries (v7): the back arrow in a white
 * circle, an optional centred title, and the right-hand circles (heart,
 * share, star). The row is 44pt tall under the status bar, 16pt in from the
 * sides.
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
      style={{ paddingTop: insets.top + 6, paddingHorizontal: SPACE.gutter, height: insets.top + 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
    >
      <IconCircle onPress={onBack ?? (() => router.back())} accessibilityLabel="Back">
        <BackChevron />
      </IconCircle>

      {title ? (
        <Text
          style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: INK }}
          numberOfLines={1}
        >
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {/* Mirrors the back circle's width when empty, so a centred title stays centred. */}
      <View style={{ minWidth: ICON_CIRCLE, gap: 12, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>{right}</View>
    </View>
  );
}
