import { router } from "expo-router";
import { View } from "react-native";

import { Text } from "@/components/Text";

import { Chip } from "@/components/Chip";
import { QuizStep } from "@/components/QuizStep";
import type { Concern } from "@/data/types";
import { useAppStore } from "@/store/useAppStore";

const OPTIONS: { value: Concern; label: string }[] = [
  { value: "dehydrated", label: "Dehydrated" },
  { value: "acne-prone", label: "Acne-prone" },
  { value: "redness", label: "Redness" },
  { value: "dullness", label: "Dullness" },
  { value: "large-pores", label: "Large pores" },
  { value: "fine-lines", label: "Fine lines" },
  { value: "hyperpigmentation", label: "Dark spots" },
  { value: "atopic", label: "Eczema-prone" },
];

const MAX = 3;

export default function ConcernsStep() {
  const concerns = useAppStore((s) => s.profile.concerns);
  const toggleConcern = useAppStore((s) => s.toggleConcern);

  const atLimit = concerns.length >= MAX;

  return (
    <QuizStep
      step={3}
      title="What are your main skin concerns?"
      subtitle={`Pick up to ${MAX}. You can change these later.`}
      onNext={() => router.push("/onboarding/skin-type")}
      nextDisabled={concerns.length === 0}
    >
      <View className="flex-row flex-wrap gap-2">
        {OPTIONS.map((option) => {
          const selected = concerns.includes(option.value);
          return (
            <Chip
              key={option.value}
              label={option.label}
              selected={selected}
              // At the cap, unselected chips are genuinely disabled rather
              // than silently ignoring taps — so assistive tech announces it.
              disabled={!selected && atLimit}
              onPress={() => toggleConcern(option.value)}
            />
          );
        })}
      </View>

      {atLimit && (
        <Text className="mt-4 text-xs text-ink-faint">
          {MAX} selected — deselect one to swap.
        </Text>
      )}
    </QuizStep>
  );
}
