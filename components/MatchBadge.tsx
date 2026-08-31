import { Text, View } from "react-native";

import { matchTone } from "@/lib/matching";

const TONE_STYLES = {
  high: "bg-teal-100 border-teal-300",
  medium: "bg-amber-100 border-amber-300",
  low: "bg-slate-100 border-slate-300",
} as const;

const TONE_TEXT = {
  high: "text-teal-900",
  medium: "text-amber-900",
  low: "text-slate-600",
} as const;

export function MatchBadge({ score }: { score: number }) {
  const tone = matchTone(score);
  return (
    <View className={`rounded-full border px-2.5 py-1 ${TONE_STYLES[tone]}`}>
      <Text className={`text-xs font-bold ${TONE_TEXT[tone]}`}>
        {score}% match
      </Text>
    </View>
  );
}
