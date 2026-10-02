import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackChevron, IconCircle } from "@/components/IconCircle";
import { Text } from "@/components/Text";
import { goBackOrHome } from "@/lib/go-back";
import { INK, SPACE, TYPE } from "@/lib/tokens";

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
      {/* Back and the right-hand circles take equal shares, so the title sits
          at the screen's true centre however many circles there are (v9). */}
      <View style={{ flex: 1, alignItems: "flex-start" }}>
        <IconCircle onPress={onBack ?? goBackOrHome} accessibilityLabel="Back">
          <BackChevron />
        </IconCircle>
      </View>

      {title ? (
        <Text style={{ maxWidth: 170, textAlign: "center", fontSize: TYPE.card, fontWeight: "600", color: INK }} numberOfLines={1}>
          {title}
        </Text>
      ) : null}

      <View style={{ flex: 1, gap: 12, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>{right}</View>
    </View>
  );
}
