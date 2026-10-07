import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Text, useRingScale } from "@/components/Text";
import type { MatchResult } from "@/lib/matching";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { DISPLAY_FONT, INK, scoreColours, VERDICT_LABEL, WHITE, withAlpha, RADIUS, SPACE, LEADING, TRACKING, TYPE } from "@/lib/tokens";

/**
 * The score number's size in the ring. The hand-off says PT Serif Bold 34 (30
 * for a three-digit 100); on a phone that face runs wide enough that "/100"
 * touches the arc, so it is 32 and 27 here, with "/100" at 10.
 */
const SCORE_SIZE = 32;
const SCORE_SIZE_FULL = 27;

/** The verdict pill's words (v9: 17/600). */
export const VERDICT_TEXT_SIZE = TYPE.card;

/** The big score ring's drawn size (v7), before it grows with large text. */
export const RING_SIZE = 96;
/** The white disc the ring sits on where it straddles the result's sheet (v9). */
const RING_DISC = 108;

// The score arrives: the arc draws round from 12 o'clock while the number
// comes up. In full the first time a result is opened, then at half the length,
// so someone scanning a shelf is not kept waiting. The number is the real one
// from the first frame; only its opacity moves.
const DRAW_MS = 700;
const DRAW_AGAIN_MS = 350;
const DRAW_DELAY_MS = 120;
let drawnOnce = false;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The big score (v9): the band's tint as the track, its colour as the arc from
 * 12 o'clock, the number in the title face with "/100". On the product result, and on the
 * scanner's found pop-up.
 */
function ScoreRing({ match }: { match: Pick<MatchResult, "score" | "verdict"> }) {
  const colours = scoreColours(match.verdict);
  const { score } = match;
  // Drawn for the ordinary text sizes; past them it grows with the words (#334).
  const scale = useRingScale();
  const size = RING_SIZE * scale;
  const radius = 38 * scale;
  const stroke = 6 * scale;
  const numberSize = (score !== null && score >= 100 ? SCORE_SIZE_FULL : SCORE_SIZE) * scale;
  const circumference = 2 * Math.PI * radius;
  const filled = score === null ? 0 : (score / 100) * circumference;
  // 0 is nothing drawn, 1 the whole score. With Reduce Motion on it is just there.
  const [drawn] = useState(() => new Animated.Value(reduceMotionNow() ? 1 : 0));
  useEffect(() => {
    const animation = Animated.timing(drawn, {
      toValue: 1,
      duration: drawnOnce ? DRAW_AGAIN_MS : DRAW_MS,
      delay: DRAW_DELAY_MS,
      easing: Easing.out(Easing.cubic),
      // An SVG stroke is not a style the native driver can move.
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) drawnOnce = true;
    });
    return () => animation.stop();
  }, [drawn]);
  return (
    <View testID="score-ring" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colours.tint} strokeWidth={stroke} fill="none" />
        {score !== null ? (
          <AnimatedCircle
            testID="score-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colours.solid}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            // One dash as long as the score, slid back out of sight and drawn in.
            strokeDasharray={`${filled} ${circumference}`}
            strokeDashoffset={drawn.interpolate({ inputRange: [0, 1], outputRange: [filled, 0] })}
            // The round cap would show as a dot before anything is drawn.
            strokeOpacity={drawn.interpolate({ inputRange: [0, 0.04], outputRange: [0, 1], extrapolate: "clamp" })}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {/* The number in the title face, "/100" small beside it on the same baseline. */}
      <Animated.View style={{ flexDirection: "row", alignItems: "baseline", gap: 1, opacity: drawn.interpolate({ inputRange: [0.15, 0.7], outputRange: [0, 1], extrapolate: "clamp" }) }}>
        <Text maxFontSizeMultiplier={1} style={{ fontFamily: DISPLAY_FONT, fontSize: numberSize, lineHeight: numberSize + 4, letterSpacing: -0.5, color: colours.deep }}>
          {score ?? "–"}
        </Text>
        {score !== null ? (
          <Text maxFontSizeMultiplier={1} style={{ fontSize: 10 * scale, fontWeight: "500", opacity: 0.75, color: colours.word }}>
            /100
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

/**
 * The ring on its white disc (v9): on the product result it sits centred over
 * the white sheet's top edge, and the disc is what separates it from the
 * stone header behind its upper half.
 */
export function ScoreDisc({ match }: { match: Pick<MatchResult, "score" | "verdict"> }) {
  const scale = useRingScale();
  const size = RING_DISC * scale;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: WHITE,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: INK,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
      }}
    >
      <ScoreRing match={match} />
    </View>
  );
}

/**
 * The verdict under the ring (v9): "Good match" in white on a pill filled
 * with the band's colour, with a small "i". Its width hugs the words. It
 * opens How scoring works, passing the score so the sheet can mark it.
 * `onOpen` runs first, for a screen that must note it is being left.
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
      hitSlop={4}
      style={{ minHeight: 40, borderRadius: RADIUS.control, paddingLeft: SPACE.inset, paddingRight: SPACE.block, flexDirection: "row", alignItems: "center", gap: SPACE.text, backgroundColor: colours.deep }}
      className="active:opacity-80"
    >
      <Text style={{ flexShrink: 1, fontSize: VERDICT_TEXT_SIZE, lineHeight: LEADING.card, fontWeight: "600", letterSpacing: TRACKING.card, color: WHITE }}>{VERDICT_LABEL[match.verdict]}</Text>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: withAlpha(WHITE, 0.75), alignItems: "center", justifyContent: "center" }}>
        <Text maxFontSizeMultiplier={1} style={{ fontSize: 12, fontWeight: "700", color: WHITE }}>
          i
        </Text>
      </View>
    </Pressable>
  );
}
