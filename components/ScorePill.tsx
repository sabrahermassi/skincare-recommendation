import { View } from "react-native";

import { Text } from "@/components/Text";
import { SCORE_BANDS, matchTone } from "@/lib/matching";
import { EXCELLENT, VERDICT } from "@/lib/tokens";

/** The small ring's size (v7). */
const SIZE = 26;

/** A score's ring and number colours: Excellent's deeper green, else its band's. */
function scoreBandColours(score: number): { solid: string; deep: string; tint: string } {
  return score >= SCORE_BANDS.excellent ? EXCELLENT : VERDICT[matchTone(score)];
}

/**
 * A product's score beside it, wherever it sits in a list or a card (v7's
 * small score ring): 26pt, a 2pt ring in the band's colour, the number in the
 * band's text colour, no fill. Nothing when there is no score: an unscored
 * product doesn't pretend to rank. The big ring is only on the product result.
 */
export function ScorePill({ score }: { score: number | null }) {
  if (score === null) return null;
  const colours = scoreBandColours(score);
  return (
    <View
      accessibilityLabel={`${score} out of 100`}
      style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2, borderColor: colours.solid, alignItems: "center", justifyContent: "center" }}
    >
      <Text maxFontSizeMultiplier={1} style={{ fontSize: 11, fontWeight: "700", color: colours.deep }}>
        {score}
      </Text>
    </View>
  );
}
