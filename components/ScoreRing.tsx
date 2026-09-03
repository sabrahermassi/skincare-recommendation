import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Text } from "@/components/Text";
import { COLORS } from "@/lib/colors";

/**
 * The match dial.
 *
 * The design draws this with `conic-gradient`, which React Native has no
 * equivalent for, so it is a stroked SVG circle with a dash offset instead —
 * visually identical, and react-native-svg is already a dependency.
 *
 * A `null` score is a real state, not an error: the engine refuses to score a
 * formula it could not read, and the ring says so rather than showing 0%.
 */

/**
 * Track/fill colors, tone-keyed. The Skintel Screens Result mockup shows only
 * one state (a "good" score: sage-green fill on a pale sage track) — `mixed`,
 * `poor` and `unknown` extend that same tone pairing using the app's existing
 * good/watch/flag ramp (already used for this exact verdict elsewhere on this
 * screen, see `HERO` in app/result/[id].tsx) rather than inventing an
 * unrelated scheme. `unknown` keeps the previous ink-on-ink treatment, since
 * a null score never draws a fill arc anyway.
 */
const RING_TONE: Record<"good" | "mixed" | "poor" | "unknown", { track: string; fill: string }> = {
  good: { track: "#D3E6D9", fill: COLORS.toneGood },
  mixed: { track: "#F3E6D5", fill: COLORS.toneWatch },
  poor: { track: "#F3DEDD", fill: COLORS.toneFlag },
  unknown: { track: COLORS.ink, fill: COLORS.ink },
};

export function ScoreRing({
  score,
  size = 78,
  label = "MATCH",
  tone = "unknown",
}: {
  score: number | null;
  size?: number;
  label?: string;
  tone?: "good" | "mixed" | "poor" | "unknown";
}) {
  const stroke = Math.round(size * 0.09);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = score === null ? 0 : (score / 100) * circumference;
  const { track, fill } = RING_TONE[tone];

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={track}
          strokeOpacity={tone === "unknown" ? 0.16 : 1}
          strokeWidth={stroke}
          fill="none"
        />
        {score !== null && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={fill}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${filled} ${circumference - filled}`}
            // Start at twelve o'clock rather than three.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>

      <View className="items-center justify-center">
        {score === null ? (
          <Text className="font-bold text-lg text-ink">-</Text>
        ) : (
          <Text
            className="font-bold tabular-nums text-ink"
            style={{ fontSize: Math.round(size * 0.31), letterSpacing: -0.6 }}
          >
            {score}
          </Text>
        )}
        <Text
          className="font-semibold text-ink-muted"
          style={{
            fontSize: Math.round(size * 0.115),
            // Tracking suits an all-caps word like MATCH; it just looks broken
            // on the design's "/100".
            letterSpacing: label.startsWith("/") ? 0 : 0.8,
          }}
        >
          {score === null ? "NO DATA" : label}
        </Text>
      </View>
    </View>
  );
}
