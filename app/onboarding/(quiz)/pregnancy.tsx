import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { QuizOptionCard } from "@/components/QuizOptionCard";
import { QuizScreen } from "@/components/QuizScreen";
import type { Pregnancy } from "@/data/types";
import { POST_ONBOARDING_ROUTE, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

/**
 * The quiz's 4th and final question. Unlike the gender/age fields this app
 * removed for being collected and read by nothing, this one is read:
 * `lib/safety.ts` flags retinoids, salicylic acid, hydroquinone and essential
 * oils as a caution when the answer is "pregnant" or "breastfeeding"
 * (`lib/pregnancy-caution.ts`).
 *
 * Icons: design-watercolor/skin quiz/screens/skin quiz screen 4.png.
 */
const OPTIONS: { value: Pregnancy; label: string; icon: number }[] = [
  { value: "pregnant", label: "Pregnant", icon: require("@/assets/illustrations/quiz/pregnancy-pregnant.png") },
  {
    value: "breastfeeding",
    label: "Breastfeeding",
    icon: require("@/assets/illustrations/quiz/pregnancy-breastfeeding.png"),
  },
  { value: "neither", label: "Neither", icon: require("@/assets/illustrations/quiz/concern-none.png") },
  {
    value: "prefer-not-to-say",
    label: "Prefer not to say",
    // Reuses sensitivity.tsx's "I don't know" icon (unsure.png), per
    // explicit request, rather than pregnancy-prefer-not.png.
    icon: require("@/assets/illustrations/quiz/unsure.png"),
  },
];

export default function PregnancyStep() {
  const pregnancyStatus = useAppStore((s) => s.profile.pregnancyStatus);
  const setProfile = useAppStore((s) => s.setProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const markQuizJustFinished = useAppStore((s) => s.markQuizJustFinished);
  const [picked, setPicked] = useState(pregnancyStatus !== null);

  function finish() {
    completeOnboarding();
    // Not set by skipping (QuizFrame's own finish) — there is nothing to
    // acknowledge for a quiz nobody answered. See issue #95.
    markQuizJustFinished();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizScreen
      step={quizStepNumber("/onboarding/pregnancy")}
      title="Are you pregnant or breastfeeding?"
      subtitle="This helps us give more relevant recommendations."
      onNext={finish}
      nextDisabled={!picked}
      // It lands on Home, not the scanner (POST_ONBOARDING_ROUTE), so it says
      // what it does (#295).
      nextLabel="Done"
    >
      <View>
        {OPTIONS.map((option) => (
          <QuizOptionCard
            key={option.value}
            icon={option.icon}
            label={option.label}
            selected={picked && pregnancyStatus === option.value}
            onPress={() => {
              setProfile({ pregnancyStatus: option.value });
              setPicked(true);
            }}
          />
        ))}
      </View>
    </QuizScreen>
  );
}
