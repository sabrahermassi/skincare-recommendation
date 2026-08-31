import { Text, View } from "react-native";

import type { SafetyLevel } from "@/data/types";
import { SAFETY_LABEL } from "@/lib/format";

const STYLES: Record<SafetyLevel, string> = {
  safe: "bg-teal-100",
  caution: "bg-amber-100",
  avoid: "bg-rose-100",
};

const TEXT: Record<SafetyLevel, string> = {
  safe: "text-teal-900",
  caution: "text-amber-900",
  avoid: "text-rose-900",
};

export function SafetyPill({ level }: { level: SafetyLevel }) {
  return (
    <View className={`rounded px-2 py-0.5 ${STYLES[level]}`}>
      <Text className={`text-[11px] font-bold uppercase ${TEXT[level]}`}>
        {SAFETY_LABEL[level]}
      </Text>
    </View>
  );
}
