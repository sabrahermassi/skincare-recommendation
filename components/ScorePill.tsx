import { View } from "react-native";

import { Text } from "@/components/Text";
import { matchTone } from "@/lib/matching";
import { TYPE, VERDICT } from "@/lib/tokens";

/**
 * A product's score as a pill, "47/100", coloured by its verdict — on the
 * Recently viewed and Saved lists. The badge pairing (tint fill, deep label),
 * since every one of those clears 4.5:1 where a white label on the solid
 * orange would not. Nothing when there is no score: an unscored product
 * doesn't pretend to rank.
 */
export function ScorePill({ score }: { score: number | null }) {
  if (score === null) return null;
  const verdict = VERDICT[matchTone(score)];
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: verdict.tint }}>
      <Text style={{ fontSize: TYPE.label, fontWeight: "700", color: verdict.deep }}>{score}/100</Text>
    </View>
  );
}
