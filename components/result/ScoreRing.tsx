import { router } from "expo-router";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Text, useRingScale } from "@/components/Text";
import type { MatchResult } from "@/lib/matching";
import { DISPLAY_FONT_ITALIC, HINT, ICON_MUTED, scoreColours, VERDICT_LABEL } from "@/lib/tokens";

/** The score number's size in the ring (v9: Instrument Serif italic 38). */
const SCORE_SIZE = 38;

/** The verdict beside the ring (v9: 22/600). */
export const VERDICT_TEXT_SIZE = 22;

/** The big score ring's drawn size (v7), before it grows with large text. */
export const RING_SIZE = 96;

/**
 * The big score (v9): the band's tint as the track, its colour as the arc from
 * 12 o'clock, the number in the title face's italic with "/100". On the product result, and on the
 * scanner's found pop-up.
 */
export function ScoreRing({ match }: { match: Pick<MatchResult, "score" | "verdict"> }) {
  const colours = scoreColours(match.verdict);
  const { score } = match;
  // Drawn for the ordinary text sizes; past them it grows with the words (#334).
  const scale = useRingScale();
  const size = RING_SIZE * scale;
  const radius = 38 * scale;
  const stroke = 6 * scale;
  const circumference = 2 * Math.PI * radius;
  const filled = score === null ? 0 : (score / 100) * circumference;
  return (
    <View testID="score-ring" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colours.tint} strokeWidth={stroke} fill="none" />
        {score !== null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colours.solid}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${filled} ${circumference - filled}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {/* v9: the number in the title face's italic, "/100" small beside it on the same baseline. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 1 }}>
        <Text maxFontSizeMultiplier={1} style={{ fontFamily: DISPLAY_FONT_ITALIC, fontSize: SCORE_SIZE * scale, lineHeight: SCORE_SIZE * scale + 4, letterSpacing: -0.38, color: colours.deep }}>
          {score ?? "–"}
        </Text>
        {score !== null ? (
          <Text maxFontSizeMultiplier={1} style={{ fontSize: 12 * scale, fontWeight: "500", opacity: 0.75, color: colours.deep }}>
            /100
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The verdict beside the ring (v9): "Good match" in the band's colour with a
 * small "i" — a text button, not a filled pill. It opens How scoring works,
 * passing the score so the page can mark it. `onOpen` runs first, for a
 * screen that must note it is being left.
 */
export function VerdictLink({ match, onOpen }: { match: Pick<MatchResult, "score" | "verdict">; onOpen?: () => void }) {
  const colours = scoreColours(match.verdict);
  return (
    <Pressable
      onPress={() => {
        onOpen?.();
        router.push(match.score === null ? "/scoring" : { pathname: "/scoring", params: { score: String(match.score) } });
      }}
      accessibilityRole="button"
      accessibilityLabel={`${VERDICT_LABEL[match.verdict]}. How scoring works`}
      style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}
      className="active:opacity-70"
    >
      <Text style={{ flexShrink: 1, fontSize: VERDICT_TEXT_SIZE, lineHeight: 26, fontWeight: "600", letterSpacing: -0.33, color: colours.deep }}>{VERDICT_LABEL[match.verdict]}</Text>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: ICON_MUTED, alignItems: "center", justifyContent: "center" }}>
        <Text maxFontSizeMultiplier={1} style={{ fontSize: 12, fontWeight: "700", color: HINT }}>
          i
        </Text>
      </View>
    </Pressable>
  );
}
