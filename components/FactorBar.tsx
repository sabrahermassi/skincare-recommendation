import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Text } from "@/components/Text";
import { COLORS } from "@/lib/colors";
import type { ScoreFactor } from "@/lib/matching";
import type { RuleCategory } from "@/lib/rules";

/**
 * One row of the score breakdown.
 *
 * The design draws these as a compact 38pt list — glyph, label, a fixed-width
 * track, a signed value — not as stacked bars with a caption each. At five or
 * six factors the stacked version pushed everything below it off the screen,
 * which is how the result screen ended up not looking like the mockup.
 *
 * The bar is scaled against the largest factor present rather than an absolute
 * maximum, so a formula that moved the score a little still reads. Polarity is
 * carried by colour *and* by the sign on the number, never by colour alone.
 */

const GLYPH_STROKE = "#6E6779";

function CategoryGlyph({ category }: { category: RuleCategory }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: GLYPH_STROKE,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (category) {
    case "hydration": // droplet
      return (
        <Svg {...common}>
          <Path d="M12 3.6c3.2 4 5.2 6.7 5.2 9.2a5.2 5.2 0 0 1-10.4 0c0-2.5 2-5.2 5.2-9.2Z" />
        </Svg>
      );
    case "barrier": // shield
      return (
        <Svg {...common}>
          <Path d="M12 3.2 5 6v5.6c0 4.3 2.9 7.6 7 9.2 4.1-1.6 7-4.9 7-9.2V6l-7-2.8Z" />
        </Svg>
      );
    case "soothing": // leaf
      return (
        <Svg {...common}>
          <Path d="M19.5 4.5c0 8-4.6 12.4-10.2 12.4-2.2 0-4-1.3-4-3.7 0-5.4 6.2-8.7 14.2-8.7Z" />
          <Path d="M4.6 19.4c2.6-3 5.6-5.3 9-6.8" />
        </Svg>
      );
    case "actives": // spark
      return (
        <Svg {...common}>
          <Path d="M12 3.6v4.2M12 16.2v4.2M4.6 12h4.2M15.2 12h4.2" />
          <Circle cx={12} cy={12} r={2.6} />
        </Svg>
      );
    case "fragrance": // the design's four-node bloom
      return (
        <Svg {...common} strokeWidth={1.4}>
          <Path d="M12 12 6.4 6.4M12 12l5.6-5.6M12 12l-5.6 5.6M12 12l5.6 5.6" />
          <Circle cx={5.2} cy={5.2} r={2.1} />
          <Circle cx={18.8} cy={5.2} r={2.1} />
          <Circle cx={5.2} cy={18.8} r={2.1} />
          <Circle cx={18.8} cy={18.8} r={2.1} />
          <Circle cx={12} cy={12} r={2.3} />
        </Svg>
      );
    case "alcohol": // flask
      return (
        <Svg {...common}>
          <Path d="M9.8 3.4h4.4M10.6 3.4v5.8L6.4 17a2 2 0 0 0 1.8 3h7.6a2 2 0 0 0 1.8-3l-4.2-7.8V3.4" />
        </Svg>
      );
    case "irritants": // alert
      return (
        <Svg {...common}>
          <Path d="M12 4.2 3.6 19h16.8L12 4.2Z" />
          <Path d="M12 10.2v3.6M12 16.4v.1" />
        </Svg>
      );
    case "pore-clogging": // the design's dot cluster
      return (
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Circle cx={6.2} cy={6.4} r={1.75} fill={COLORS.toneWatch} />
          <Circle cx={12.2} cy={4.6} r={1.35} fill="#C9C3CE" />
          <Circle cx={18} cy={7.2} r={1.75} fill={COLORS.levelAvoid} />
          <Circle cx={4.8} cy={12.6} r={1.35} fill="#C9C3CE" />
          <Circle cx={11.6} cy={11.4} r={1.9} fill={COLORS.toneWatch} />
          <Circle cx={18.6} cy={13.4} r={1.35} fill="#C9C3CE" />
          <Circle cx={6.8} cy={18.4} r={1.75} fill={COLORS.levelAvoid} />
          <Circle cx={13.4} cy={18.8} r={1.5} fill={COLORS.toneWatch} />
        </Svg>
      );
  }
}

export function FactorBar({ factor }: { factor: ScoreFactor }) {
  const positive = factor.delta > 0;
  const color = positive ? COLORS.toneGood : COLORS.toneWatch;

  return (
    <View className="h-[38px] flex-row items-center gap-3">
      <View className="w-[19px] items-center justify-center">
        <CategoryGlyph category={factor.category} />
      </View>

      <Text className="flex-1 text-[12.5px] text-ink" numberOfLines={1}>
        {factor.label}
      </Text>

      <View className="h-1.5 w-[104px] overflow-hidden rounded-full bg-hairline">
        <View
          className="h-1.5 rounded-full"
          style={{
            width: `${Math.max(6, Math.round(factor.magnitude * 100))}%`,
            backgroundColor: color,
          }}
        />
      </View>

      <Text
        className="w-[30px] text-right text-xs font-medium tabular-nums"
        style={{ color }}
      >
        {/* U+2212 minus, not a hyphen — it aligns with digits. */}
        {positive ? `+${factor.delta}` : `−${Math.abs(factor.delta)}`}
      </Text>
    </View>
  );
}
