import { View } from "react-native";

import { LiftedCard } from "@/components/PressableCard";
import { LINE, SURFACE } from "@/lib/tokens";

/**
 * Placeholder for one `ProductRow` while search results are still loading.
 * Same outer shape (leading bar, thumbnail box, text lines, score-pill
 * column) so the swap-in when real rows arrive causes no layout shift —
 * no shimmer animation, matching this codebase's otherwise-plain loading
 * states (the bare `ActivityIndicator` this replaces).
 */
export function ProductRowSkeleton({ last = false }: { last?: boolean }) {
  return (
    <LiftedCard
      radius={14}
      backgroundColor={SURFACE}
      style={{ marginHorizontal: 16, marginBottom: last ? 0 : 12 }}
    >
    <View style={{ flexDirection: "row", borderRadius: 14, borderWidth: 1, borderColor: LINE, overflow: "hidden" }}>
      <View style={{ width: 4, alignSelf: "stretch", backgroundColor: LINE }} />

      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 13,
          paddingVertical: 14,
          paddingLeft: 13,
          paddingRight: 14,
        }}
      >
        <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: LINE }} />

        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ width: "35%", height: 8, borderRadius: 4, backgroundColor: LINE }} />
          <View style={{ width: "70%", height: 10, borderRadius: 5, backgroundColor: LINE }} />
          <View style={{ width: "50%", height: 8, borderRadius: 4, backgroundColor: LINE }} />
        </View>

        <View style={{ width: 40, height: 34, borderRadius: 10, backgroundColor: LINE }} />
      </View>
    </View>
    </LiftedCard>
  );
}
