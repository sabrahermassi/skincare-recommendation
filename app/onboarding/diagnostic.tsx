import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { OptionCard } from "@/components/OptionCard";
import { QuizStep } from "@/components/QuizStep";
import { Text } from "@/components/Text";
import { POST_ONBOARDING_ROUTE } from "@/lib/profile";
import {
  BARRIER_QUESTION,
  SHINE_QUESTION,
  deriveSkinType,
  type BarrierAnswer,
  type ShineAnswer,
} from "@/lib/skin-type-quiz";
import { useAppStore } from "@/store/useAppStore";

/**
 * The two questions behind "Not sure". Still step 4 — this is a sub-step of
 * the skin-type question, not a fifth one, so `quizStepCount()` stays honest
 * and the rail doesn't grow a segment for some users and not others.
 *
 * Reachable from the profile tab as well, where there is no quiz to be a step
 * of; `from=profile` drops the rail and returns rather than finishing
 * onboarding.
 */
export default function DiagnosticStep() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromProfile = from === "profile";

  const setProfile = useAppStore((s) => s.setProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [barrier, setBarrier] = useState<BarrierAnswer | null>(null);
  const [shine, setShine] = useState<ShineAnswer | null>(null);

  function finish() {
    if (!barrier || !shine) return;
    setProfile({
      baseSkinType: deriveSkinType({ barrier, shine }),
      skinTypeSource: "derived",
    });

    if (fromProfile) {
      router.back();
      return;
    }
    completeOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizStep
      step={4}
      showProgress={!fromProfile}
      title="Two quick questions"
      subtitle="Enough to place your skin without you having to name it."
      onNext={finish}
      nextDisabled={!barrier || !shine}
      nextLabel={fromProfile ? "Save" : "See my matches"}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-7 pb-2">
        <View className="gap-3">
          <Text className="text-[15px] font-semibold leading-5 text-ink">
            {BARRIER_QUESTION.prompt}
          </Text>
          {BARRIER_QUESTION.options.map((option) => (
            <OptionCard
              key={option.value}
              label={option.label}
              hint={option.hint}
              selected={barrier === option.value}
              onPress={() => setBarrier(option.value)}
            />
          ))}
        </View>

        <View className="gap-3">
          <Text className="text-[15px] font-semibold leading-5 text-ink">
            {SHINE_QUESTION.prompt}
          </Text>
          {SHINE_QUESTION.options.map((option) => (
            <OptionCard
              key={option.value}
              label={option.label}
              hint={option.hint}
              selected={shine === option.value}
              onPress={() => setShine(option.value)}
            />
          ))}
        </View>

        {/* This is a self-assessment, and saying so is the difference between
            a helpful shortcut and a claim we have not earned. */}
        <Text className="text-[11px] leading-4 text-ink-faint">
          A rough placement from how your skin behaves, not a diagnosis. You can
          change it any time from your profile.
        </Text>
      </ScrollView>
    </QuizStep>
  );
}
