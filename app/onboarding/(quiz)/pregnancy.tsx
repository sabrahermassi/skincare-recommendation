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
    icon: require("@/assets/illustrations/quiz/pregnancy-prefer-not.png"),
  },
];

export default function PregnancyStep() {
  const pregnancyStatus = useAppStore((s) => s.profile.pregnancyStatus);
  const setProfile = useAppStore((s) => s.setProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [picked, setPicked] = useState(pregnancyStatus !== null);

  function finish() {
    completeOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizScreen
      step={quizStepNumber("/onboarding/pregnancy")}
      title="Are you pregnant or breastfeeding?"
      subtitle="This helps us give more relevant recommendations."
      onNext={finish}
      nextDisabled={!picked}
      nextLabel="Start scanning"
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
