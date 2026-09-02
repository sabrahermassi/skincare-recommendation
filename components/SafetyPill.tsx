import { View } from "react-native";

import { Text } from "@/components/Text";

import type { SafetyLevel } from "@/data/types";
import { SAFETY_LABEL } from "@/lib/format";

/**
 * The regulatory verdict, in two registers.
 *
 * `solid` is the shouting one — white on the status ramp — for the places a
 * verdict has to carry across a dense column (compare) or head a tier
 * (product detail). `soft` is the tinted pill the long list screens use, where
 * a column of solid blocks reads as an alarm rather than a list.
 *
 * Both say the same word. The colour is never the only channel.
 */
type Variant = "solid" | "soft";

/** Three of the four rungs on the status ladder; "watch" is the tier label on the detail screen. */
const SOLID: Record<SafetyLevel, string> = {
  safe: "bg-status-safe",
  caution: "bg-status-caution",
  avoid: "bg-status-avoid",
};

const SOFT: Record<SafetyLevel, string> = {
  safe: "bg-level-good-tint",
  caution: "bg-level-watch-tint",
  avoid: "bg-level-avoid-tint",
};

const SOFT_INK: Record<SafetyLevel, string> = {
  safe: "text-level-good-ink",
  caution: "text-level-watch-ink",
  avoid: "text-level-avoid-ink",
};

export function SafetyPill({
  level,
  variant = "solid",
}: {
  level: SafetyLevel;
  variant?: Variant;
}) {
  if (variant === "soft") {
    return (
      <View className={`rounded-full px-3 py-1 ${SOFT[level]}`}>
        <Text className={`text-[11px] font-medium ${SOFT_INK[level]}`}>
          {SAFETY_LABEL[level]}
        </Text>
      </View>
    );
  }

  return (
    <View className={`rounded-chip px-2 py-0.5 ${SOLID[level]}`}>
      <Text className="text-[11px] font-bold uppercase tracking-[0.44px] text-white">
        {SAFETY_LABEL[level]}
      </Text>
    </View>
  );
}
