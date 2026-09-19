import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Text";
import { CANVAS, INK, MUTED, TYPE } from "@/lib/tokens";

/**
 * Skin helper — a place held in the tab bar for what comes next. Empty for now.
 */
export default function SkinHelper() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 10, paddingBottom: 10 }}>
        <Text style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.title, color: INK }}>
          Skin helper
        </Text>
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 8 }}>
        <Text style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.title, color: INK }}>
          Coming soon
        </Text>
        <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
          Your skin helper will live here.
        </Text>
      </View>
    </View>
  );
}
