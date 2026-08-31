import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { SkinType } from "@/data/types";
import { useAppStore } from "@/store/useAppStore";

const OPTIONS: { value: SkinType; label: string; hint: string }[] = [
  { value: "dry", label: "Dry", hint: "Tight, flaky, rarely shiny" },
  { value: "oily", label: "Oily", hint: "Shiny by midday, visible pores" },
  { value: "combination", label: "Combination", hint: "Oily T-zone, dry cheeks" },
  { value: "normal", label: "Normal", hint: "Balanced, rarely reactive" },
  { value: "sensitive", label: "Sensitive", hint: "Stings or reddens easily" },
];

export default function SkinTypeStep() {
  const skinType = useAppStore((s) => s.skinType);
  const setSkinType = useAppStore((s) => s.setSkinType);

  return (
    <View className="flex-1 gap-6 bg-white px-6 pb-8 pt-16">
      <View className="gap-2">
        <Text className="text-3xl font-bold text-slate-900">
          What&apos;s your skin type?
        </Text>
        <Text className="text-base text-slate-500">Pick the closest match.</Text>
      </View>

      <View className="flex-1 gap-3">
        {OPTIONS.map((option) => {
          const selected = skinType === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setSkinType(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={`rounded-xl border p-4 ${
                selected
                  ? "border-teal-600 bg-teal-50"
                  : "border-slate-200 bg-white active:bg-slate-50"
              }`}
            >
              <Text
                className={`text-base font-semibold ${
                  selected ? "text-teal-900" : "text-slate-900"
                }`}
              >
                {option.label}
              </Text>
              <Text className="mt-0.5 text-sm text-slate-500">
                {option.hint}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        disabled={!skinType}
        onPress={() => router.push("/onboarding/concerns")}
        className={`rounded-xl px-6 py-4 ${
          skinType ? "bg-teal-600 active:bg-teal-700" : "bg-slate-200"
        }`}
      >
        <Text
          className={`text-center text-base font-semibold ${
            skinType ? "text-white" : "text-slate-400"
          }`}
        >
          Continue
        </Text>
      </Pressable>

      <Text className="text-center text-xs text-slate-400">Step 2 of 3</Text>
    </View>
  );
}
