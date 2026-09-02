import { View } from "react-native";

import { Text } from "@/components/Text";

import { matchTone } from "@/lib/matching";

/**
 * A match score is a "should I buy this" signal, so it gets the same solid
 * status treatment as the ingredient risk ladder — and always carries a word
 * alongside the color, never color alone.
 */
const TONE_BG = {
  high: "bg-status-safe",
  medium: "bg-status-caution",
  low: "bg-status-watch",
} as const;

const TONE_LABEL = {
  high: "Great match",
  medium: "Fair match",
  low: "Poor match",
} as const;

/** Renders nothing when `score` is `null` — there is no profile to match against. */
export function MatchBadge({ score }: { score: number | null }) {
  if (score === null) return null;

  const tone = matchTone(score);
  return (
    <View className={`flex-row items-center gap-1 rounded-chip px-2.5 py-1 ${TONE_BG[tone]}`}>
      <Text className="text-xs font-bold tabular-nums text-white">{score}%</Text>
      <Text className="text-[11px] font-medium text-white/90">· {TONE_LABEL[tone]}</Text>
    </View>
  );
}
