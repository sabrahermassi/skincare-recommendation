import { View } from "react-native";

import { Text } from "@/components/Text";

import type { SafetyLevel } from "@/data/types";
import { SAFETY_LABEL } from "@/lib/format";

/** Three of the four rungs on the status ladder; "watch" is the tier label on the detail screen. */
const STYLES: Record<SafetyLevel, string> = {
  safe: "bg-status-safe",
  caution: "bg-status-caution",
  avoid: "bg-status-avoid",
};

export function SafetyPill({ level }: { level: SafetyLevel }) {
  return (
    <View className={`rounded-chip px-2 py-0.5 ${STYLES[level]}`}>
      <Text className="text-[11px] font-sans-bold uppercase tracking-wide text-white">
        {SAFETY_LABEL[level]}
      </Text>
    </View>
  );
}
