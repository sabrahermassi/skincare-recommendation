import { Image } from "expo-image";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/Text";
import { DISPLAY_FONT, INK, MUTED, TYPE, SPACE, LEADING, TRACKING } from "@/lib/tokens";
import { noOrphan } from "@/lib/text";

const BUILDING_ART = require("@/assets/illustrations/loading-routine.webp");

/**
 * The picture and two lines shown while something is put together for the
 * person (v9): the skin quiz's closing screen, and the Skincare routine until
 * its routine is built. `children` sit under the lines: the quiz's bar.
 */
export function BuildingRoutine({ title, line, children }: { title: string; line: string; children?: ReactNode }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: SPACE.gutter, paddingHorizontal: SPACE.large }}>
      <Image source={BUILDING_ART} contentFit="contain" accessibilityLabel="" style={{ width: 280, height: 280 }} />
      <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: LEADING.heading, letterSpacing: TRACKING.heading, color: INK }}>
        {noOrphan(title)}
      </Text>
      <Text style={{ maxWidth: 280, textAlign: "center", fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{noOrphan(line)}</Text>
      {children}
    </View>
  );
}
