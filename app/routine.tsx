import { Image } from "expo-image";
import { ScrollView, View } from "react-native";

import { HEADER_GUTTER } from "@/components/AppHeader";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { CANVAS, INK, MUTED, SPACE, TYPE } from "@/lib/tokens";

// A woman at her dressing table wondering about her products
// (new-watercolor/no_product_match_v2_transparent.png, trimmed and brought down
// to 1000px wide).
const ROUTINE_ART = require("@/assets/illustrations/routine-coming-soon.webp");
const ROUTINE_ASPECT = 1000 / 611;

/**
 * Skincare routine — opened from its card on Home. The routine itself isn't
 * built yet, so for now the screen says so under its watercolor.
 */
export default function Routine() {
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Skincare routine" />
      {/* The picture and its words, centred in the screen (owner). */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", gap: SPACE.text, paddingHorizontal: HEADER_GUTTER, paddingVertical: SPACE.gutter }}
      >
        <Image source={ROUTINE_ART} contentFit="contain" accessibilityLabel="" style={{ width: "100%", aspectRatio: ROUTINE_ASPECT }} />
        <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: "PlayfairDisplay_600SemiBold", fontSize: TYPE.heading, color: INK }}>
          Coming soon
        </Text>
        <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: TYPE.body * 1.4, color: MUTED }}>
          Your morning and evening routine will live here.
        </Text>
      </ScrollView>
    </View>
  );
}
