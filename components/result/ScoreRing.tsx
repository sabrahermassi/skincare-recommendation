import { router } from "expo-router";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Text, useRingScale } from "@/components/Text";
import type { MatchResult } from "@/lib/matching";
import { DISPLAY_FONT, PILL_INFO, SURFACE, TYPE, VERDICT_LABEL, scoreColours } from "@/lib/tokens";

/** The big score ring's drawn size (v7), before it grows with large text. */
export const RING_SIZE = 96;

/**
 * The big score (v7): the band's tint as the track, its colour as the arc from
 * 12 o'clock, the number in the title face. On the product result, and on the
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
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.display * scale, lineHeight: TYPE.display * scale + 4, color: colours.deep }}>
        {score ?? "–"}
      </Text>
    </View>
  );
}

/**
 * The filled verdict pill under the ring ("Good match ⓘ"). It opens How
 * scoring works, passing the score so the page can mark it. `onOpen` runs
 * first, for a screen that must note it is being left (the scanner).
 */
export function VerdictPill({ match, onOpen }: { match: Pick<MatchResult, "score" | "verdict">; onOpen?: () => void }) {
  const colours = scoreColours(match.verdict);
  return (
    <Pressable
      onPress={() => {
        onOpen?.();
        router.push(match.score === null ? "/scoring" : { pathname: "/scoring", params: { score: String(match.score) } });
      }}
      accessibilityRole="button"
      accessibilityLabel={`${VERDICT_LABEL[match.verdict]}. How scoring works`}
      style={{ minWidth: 160, height: 32, borderRadius: 16, paddingLeft: 16, paddingRight: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colours.deep }}
      className="active:opacity-80"
    >
      <Text style={{ fontSize: TYPE.label, fontWeight: "600", letterSpacing: -0.15, color: SURFACE }}>{VERDICT_LABEL[match.verdict]}</Text>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: PILL_INFO, alignItems: "center", justifyContent: "center" }}>
        <Text maxFontSizeMultiplier={1} style={{ fontSize: 12, fontWeight: "700", color: PILL_INFO }}>
          i
        </Text>
      </View>
    </Pressable>
  );
}
