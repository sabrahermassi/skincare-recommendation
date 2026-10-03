import { useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackChevron, CloseCross, IconCircle } from "@/components/IconCircle";
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
  back = true,
}: {
  title?: string;
  right?: ReactNode;
  onBack?: () => void;
  /** False for a screen that slid up over another and closes with an X on the right instead. */
  back?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingTop: insets.top + 6, paddingHorizontal: SPACE.gutter, height: insets.top + 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
    >
      {/* Back and the right-hand circles take equal shares, so the title sits
          at the screen's true centre however many circles there are (v9). */}
      <View style={{ flex: 1, alignItems: "flex-start" }}>
        {back ? (
          <IconCircle onPress={onBack ?? goBackOrHome} accessibilityLabel="Back">
            <BackChevron />
          </IconCircle>
        ) : null}
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

/**
 * The top row of a screen that can slide up over a Skin needs story (the
 * routine, and the skin profile from there, opened with `from=story`): an X on
 * the right that closes it back onto the story, in place of the back arrow
 * (owner, 3 October 2026). Opened any other way, the usual back arrow.
 */
export function StoryAwareHeader() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  if (from !== "story") return <ScreenHeader />;
  return (
    <ScreenHeader
      back={false}
      right={
        <IconCircle onPress={goBackOrHome} accessibilityLabel="Close">
          <CloseCross />
        </IconCircle>
      }
    />
  );
}
