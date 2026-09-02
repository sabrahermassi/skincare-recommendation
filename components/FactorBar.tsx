import { View } from "react-native";

import { Text } from "@/components/Text";
import type { ScoreFactor } from "@/lib/matching";

/**
 * One row of "What moved the score".
 *
 * The delta is signed and always shown, because a bar without a number invites
 * the reader to guess the magnitude. The bar itself is scaled against the
 * largest factor present rather than an absolute maximum, so a formula that
 * moved the score a little still produces a readable chart.
 *
 * Polarity color follows the Skintel Screens Result mockup: a helping factor
 * renders in `tone-good` (green) and a working-against one in `tone-watch`
 * (amber) — both the value and the bar fill, not just the value. Previously
 * only the negative case got a distinct color (`tone-flag`, a red/pink) and
 * positive fell back to plain `ink`; the mockup colors both directions.
 */
export function FactorBar({ factor }: { factor: ScoreFactor }) {
  const positive = factor.delta > 0;
  const tone = positive ? "text-tone-good" : "text-tone-watch";
  const toneBg = positive ? "bg-tone-good" : "bg-tone-watch";

  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline gap-2">
        <Text className="flex-1 text-[13px] font-semibold text-ink">{factor.label}</Text>
        <Text className={`text-xs font-bold tabular-nums ${tone}`}>
          {/* U+2212 minus, not a hyphen — it aligns with digits. */}
          {positive ? `+${factor.delta}` : `−${Math.abs(factor.delta)}`}
        </Text>
      </View>

      <View className="h-1.5 overflow-hidden rounded-full bg-ink/10">
        <View
          className={`h-full rounded-full ${toneBg}`}
          style={{ width: `${Math.max(6, Math.round(factor.magnitude * 100))}%` }}
        />
      </View>

      <Text className="text-[11.5px] leading-4 text-ink-muted">{factor.note}</Text>
    </View>
  );
}
