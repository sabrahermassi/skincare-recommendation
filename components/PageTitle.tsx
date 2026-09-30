import { View } from "react-native";

import { Text } from "@/components/Text";
import { DISPLAY_FONT, INK, MUTED, SPACE, TYPE } from "@/lib/tokens";

/**
 * A pushed screen's title (v7): 24pt in the title face, under the back
 * circle, with an optional line under it in the secondary colour. Tab roots
 * use the larger `TabTitle` instead.
 */
export function PageTitle({ title, line }: { title: string; line?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
        {title}
      </Text>
      {line ? <Text style={{ marginTop: SPACE.text - 4, fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{line}</Text> : null}
    </View>
  );
}
