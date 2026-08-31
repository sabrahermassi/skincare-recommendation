import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { Concern } from "@/data/types";
import { Chip } from "@/components/Chip";
import { useAppStore } from "@/store/useAppStore";

const OPTIONS: { value: Concern; label: string }[] = [
  { value: "dehydrated", label: "Dehydrated" },
  { value: "acne-prone", label: "Acne-prone" },
  { value: "redness", label: "Redness" },
  { value: "dullness", label: "Dullness" },
  { value: "large-pores", label: "Large pores" },
  { value: "fine-lines", label: "Fine lines" },
  { value: "hyperpigmentation", label: "Dark spots" },
];

const MAX = 2;

export default function ConcernsStep() {
  const concerns = useAppStore((s) => s.concerns);
  const toggleConcern = useAppStore((s) => s.toggleConcern);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const atLimit = concerns.length >= MAX;

  function finish() {
    completeOnboarding();
    router.replace("/");
  }

  return (
    <View className="flex-1 gap-6 bg-white px-6 pb-8 pt-16">
      <View className="gap-2">
        <Text className="text-3xl font-bold text-slate-900">
          What are you working on?
        </Text>
        <Text className="text-base text-slate-500">
          Pick up to {MAX}. You can change these later.
        </Text>
      </View>

      <View className="flex-1">
        <View className="flex-row flex-wrap gap-2">
          {OPTIONS.map((option) => {
            const selected = concerns.includes(option.value);
            return (
              <Chip
                key={option.value}
                label={option.label}
                selected={selected}
                // At the cap, only already-selected chips stay tappable
                // (so you can deselect but not add a third).
                onPress={() => {
                  if (!selected && atLimit) return;
                  toggleConcern(option.value);
                }}
              />
            );
          })}
        </View>

        {atLimit && (
          <Text className="mt-4 text-xs text-slate-400">
            {MAX} selected — deselect one to swap.
          </Text>
        )}
      </View>

      <Pressable
        disabled={concerns.length === 0}
        onPress={finish}
        className={`rounded-xl px-6 py-4 ${
          concerns.length ? "bg-teal-600 active:bg-teal-700" : "bg-slate-200"
        }`}
      >
        <Text
          className={`text-center text-base font-semibold ${
            concerns.length ? "text-white" : "text-slate-400"
          }`}
        >
          See my matches
        </Text>
      </Pressable>

      <Text className="text-center text-xs text-slate-400">Step 3 of 3</Text>
    </View>
  );
}
