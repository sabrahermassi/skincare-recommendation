import { View } from "react-native";

import { Text } from "@/components/Text";

import { matchTone } from "@/lib/matching";

/**
 * A match score is a "should I buy this" signal, so it always carries a word
 * alongside the colour, never colour alone.
 *
 * Two registers, both drawn by the design. `solid` is white on the status ramp
 * and states the number itself — the standalone badge. `soft` is the tinted
 * pill the scanner's shelf uses, where the number is already set underneath it
 * in full-contrast ink and a solid block in every row reads as an alarm.
 */
const TONE_BG = {
  high: "bg-status-safe",
  medium: "bg-status-caution",
  low: "bg-status-watch",
} as const;

const SOFT_BG = {
  high: "bg-level-good-tint",
  medium: "bg-level-watch-tint",
  low: "bg-level-watch-tint",
} as const;

const SOFT_INK = {
  high: "text-level-good-ink",
  medium: "text-level-watch-ink",
  low: "text-level-watch-ink",
} as const;

const TONE_LABEL = {
  high: "Great match",
  medium: "Fair match",
  low: "Poor match",
} as const;

/** Renders nothing when `score` is `null` — there is no profile to match against. */
export function MatchBadge({
  score,
  variant = "solid",
}: {
  score: number | null;
  variant?: "solid" | "soft";
}) {
  if (score === null) return null;

  const tone = matchTone(score);

  if (variant === "soft") {
    return (
      <View className={`rounded-full px-2.5 py-[4.5px] ${SOFT_BG[tone]}`}>
        <Text className={`text-[11px] font-medium ${SOFT_INK[tone]}`}>{TONE_LABEL[tone]}</Text>
      </View>
    );
  }

  return (
    <View className={`flex-row items-center gap-1 rounded-chip px-2.5 py-1 ${TONE_BG[tone]}`}>
      <Text className="text-xs font-bold tabular-nums text-white">{score}%</Text>
      <Text className="text-[11px] font-medium text-white/90">· {TONE_LABEL[tone]}</Text>
    </View>
  );
}
