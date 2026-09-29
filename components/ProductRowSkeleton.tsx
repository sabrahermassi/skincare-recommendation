import { View } from "react-native";

import { CARD_RADIUS, HAIRLINE, SPACE, SURFACE } from "@/lib/tokens";

/**
 * Placeholder for one `ProductListRow` while search results are still
 * loading: the same card (v7: white, 76pt, radius 20), bottle box, two text
 * lines and score ring, so the swap-in when real rows arrive causes no layout
 * shift — no shimmer animation, matching this codebase's otherwise-plain
 * loading states.
 */
export function ProductRowSkeleton() {
  return (
    <View style={{ paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.block }}>
      <View
        style={{
          minHeight: 76,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.block,
          paddingVertical: SPACE.block,
          paddingHorizontal: SPACE.gutter,
          borderRadius: CARD_RADIUS,
          backgroundColor: SURFACE,
        }}
      >
        <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: HAIRLINE }} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ width: "70%", height: 10, borderRadius: 5, backgroundColor: HAIRLINE }} />
          <View style={{ width: "40%", height: 8, borderRadius: 4, backgroundColor: HAIRLINE }} />
        </View>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: HAIRLINE }} />
      </View>
    </View>
  );
}
