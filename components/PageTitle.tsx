import { View } from "react-native";

import { Text } from "@/components/Text";
import { noOrphan } from "@/lib/text";
import { DISPLAY_FONT, INK, MUTED, SPACE, TYPE, LEADING, TRACKING } from "@/lib/tokens";

/**
 * A pushed screen's title (v7; v9 spacing): 24pt in the title face, under the back
 * circle, with an optional line under it in the secondary colour. Tab roots
 * use the larger `TabTitle` instead.
 */
export function PageTitle({ title, line }: { title: string; line?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: LEADING.heading, letterSpacing: TRACKING.heading, color: INK }}>
        {noOrphan(title)}
      </Text>
      {line ? <Text style={{ marginTop: SPACE.text - 4, fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{noOrphan(line)}</Text> : null}
    </View>
  );
}
