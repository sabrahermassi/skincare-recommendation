import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { OptionCard } from "@/components/OptionCard";
import { QuizStep } from "@/components/QuizStep";
import { Text } from "@/components/Text";
import type { RoutineLength } from "@/data/types";
import { useAppStore } from "@/store/useAppStore";

const OPTIONS: { value: RoutineLength; label: string; hint: string }[] = [
  { value: "minimal", label: "Minimal", hint: "2–3 steps — cleanser, moisturizer, SPF" },
  { value: "balanced", label: "Balanced", hint: "4–5 steps — add a serum or toner" },
  { value: "full", label: "Full routine", hint: "6+ steps — essences, ampoules, layering" },
];

export default function RoutineStep() {
  const routineLength = useAppStore((s) => s.profile.routineLength);
  const setProfile = useAppStore((s) => s.setProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  function finish() {
    completeOnboarding();
    router.replace("/");
  }

  /**
   * Declining is a different kind of answer from picking a routine, so it gets
   * a different control rather than a fourth card — `null` already means "not
   * specified" and already scores neutrally, so nothing is lost by saying so.
   */
  function skipRoutine() {
    setProfile({ routineLength: null });
    finish();
  }

  return (
    <QuizStep
      step={5}
      title="How many steps are you comfortable with?"
      subtitle="We'll weigh simpler or more elaborate products accordingly."
      onNext={finish}
      nextDisabled={!routineLength}
      nextLabel="See my matches"
    >
      <View className="gap-3">
        {OPTIONS.map((option) => (
          <OptionCard
            key={option.value}
            label={option.label}
            hint={option.hint}
            selected={routineLength === option.value}
            onPress={() => setProfile({ routineLength: option.value })}
          />
        ))}

        <Pressable
          onPress={skipRoutine}
          accessibilityRole="button"
          className="items-center py-3"
        >
          <Text className="text-sm font-sans-medium text-accent-text underline">
            Just show me recommendations for my skin type
          </Text>
        </Pressable>
      </View>
    </QuizStep>
  );
}
