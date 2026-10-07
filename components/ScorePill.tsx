import { View } from "react-native";

import { SafetyShield } from "@/components/SafetyShield";
import { Text } from "@/components/Text";
import { SCORE_BANDS, matchTone } from "@/lib/matching";
import { SAFETY_NOTICE_COPY } from "@/lib/safety";
import { EXCELLENT, VERDICT, VERDICT_NEUTRAL, SPACE } from "@/lib/tokens";

/** The small ring's size. v7 drew it at 26 with an 11pt number, too small to read in a list; 30 with 12pt. */
const SIZE = 30;

/** A score's ring and number colours: Excellent's deeper green, else its band's; grey for none. */
function scoreBandColours(score: number | null): { solid: string; deep: string; word: string } {
  if (score === null) return VERDICT_NEUTRAL;
  return score >= SCORE_BANDS.excellent ? EXCELLENT : VERDICT[matchTone(score)];
}

/**
 * A product's score beside it, wherever it sits in a list or a card (v7's
 * small score ring): 30pt, a 2pt ring in the band's colour, the number in the
 * band's text colour, no fill. With no score it shows a dash in grey (v9),
 * so every row keeps its pill in the same place without pretending to rank.
 * The big ring is only on the product result. With `notice` (the EU safety
 * notice applies to the product, #405) a small shield sits beside it.
 */
export function ScorePill({ score, notice = false }: { score: number | null; notice?: boolean }) {
  const colours = scoreBandColours(score);
  const ring = (
    <View
      accessibilityLabel={score === null ? "No score" : `${score} out of 100`}
      style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2, borderColor: colours.solid, alignItems: "center", justifyContent: "center" }}
    >
      <Text maxFontSizeMultiplier={1} style={{ fontSize: 12, fontWeight: "700", color: colours.word }}>
        {score ?? "–"}
      </Text>
    </View>
  );
  if (!notice) return ring;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.text }}>
      <SafetyShield size={18} label={SAFETY_NOTICE_COPY.shieldLabel} />
      {ring}
    </View>
  );
}
