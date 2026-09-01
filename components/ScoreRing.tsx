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
export function ScoreRing({
  score,
  size = 78,
  label = "MATCH",
}: {
  score: number | null;
  size?: number;
  label?: string;
}) {
  const stroke = Math.round(size * 0.09);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = score === null ? 0 : (score / 100) * circumference;

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.ink}
          strokeOpacity={0.16}
          strokeWidth={stroke}
          fill="none"
        />
        {score !== null && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={COLORS.ink}
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
          <Text className="font-sans-bold text-lg text-ink">—</Text>
        ) : (
          <Text
            className="font-sans-bold tabular-nums text-ink"
            style={{ fontSize: Math.round(size * 0.31), letterSpacing: -0.6 }}
          >
            {score}
          </Text>
        )}
        <Text
          className="font-sans-semibold text-ink-muted"
          style={{ fontSize: Math.round(size * 0.105), letterSpacing: 0.8 }}
        >
          {score === null ? "NO DATA" : label}
        </Text>
      </View>
    </View>
  );
}
