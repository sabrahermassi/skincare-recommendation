import { router } from "expo-router";

import { Text } from "@/components/Text";

import { OptionCard } from "@/components/OptionCard";
import { OptionGrid } from "@/components/OptionGrid";
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
      {/*
        A two-column card grid, laid out inline by OptionGrid — the same
        control the profile screen uses for these exact eight options. At the
        cap the unpicked cards drop to 45%, which is how the design shows the
        limit: visible before you hit it rather than announced after a tap does
        nothing.
      */}
      <OptionGrid>
        {OPTIONS.map((option) => {
          const selected = concerns.includes(option.value);
          return (
            <OptionCard
              key={option.value}
              compact
              multiple
              label={option.label}
              selected={selected}
              dimmed={atLimit}
              onPress={() => toggleConcern(option.value)}
            />
          );
        })}
      </OptionGrid>

      <Text className="mt-4 text-xs text-ink-faint">
        {atLimit
          ? `${MAX} selected — deselect one to swap.`
          : `${concerns.length} of ${MAX} selected.`}
      </Text>
    </QuizStep>
  );
}
