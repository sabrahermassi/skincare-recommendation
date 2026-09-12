import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { QuizOptionCard } from "@/components/QuizOptionCard";
import { QuizScreen } from "@/components/QuizScreen";
import type { Sensitivity } from "@/data/types";
import { nextQuizRoute, POST_ONBOARDING_ROUTE, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

/**
 * Third of four questions (pregnancy/breastfeeding follows), so this screen
 * hands off to the next route instead of completing onboarding itself.
 * "I don't know" exists because not everyone has tested enough products to
 * have an answer, and guessing would misjudge irritation either too harshly
 * or not harshly enough.
 *
 * Icons: design-watercolor/skin quiz/screens/skin quiz screen 3.png.
 */
const OPTIONS: { value: Sensitivity; label: string; icon: number }[] = [
  { value: "none", label: "Not sensitive", icon: require("@/assets/illustrations/quiz/sensitivity-none.png") },
  {
    value: "some",
    label: "Somewhat sensitive",
    icon: require("@/assets/illustrations/quiz/sensitivity-some.png"),
  },
  { value: "high", label: "Very sensitive", icon: require("@/assets/illustrations/quiz/sensitivity-high.png") },
];

const UNSURE_ICON = require("@/assets/illustrations/quiz/unsure.png");

export default function SensitivityStep() {
  const sensitivity = useAppStore((s) => s.profile.sensitivity);
  const setProfile = useAppStore((s) => s.setProfile);
  // `null` is both "unanswered" and "I don't know" — see baseSkinType's
  // identical precedent in skin-type.tsx — so the screen tracks the tap
  // locally rather than inferring an answer from the store.
  const [picked, setPicked] = useState(sensitivity !== null);

  function next() {
    const route = nextQuizRoute("/onboarding/sensitivity");
    if (route) {
      router.push(route);
      return;
    }
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizScreen
      step={quizStepNumber("/onboarding/sensitivity")}
      title="How sensitive is your skin?"
      subtitle="This sets how cautious we are about irritants."
      onNext={next}
      nextDisabled={!picked}
    >
      <View>
        {OPTIONS.map((option) => (
          <QuizOptionCard
            key={option.value}
            icon={option.icon}
            label={option.label}
            selected={picked && sensitivity === option.value}
            onPress={() => {
              setProfile({ sensitivity: option.value });
              setPicked(true);
            }}
          />
        ))}

        <QuizOptionCard
          icon={UNSURE_ICON}
          label="I don't know"
          selected={picked && sensitivity === null}
          onPress={() => {
            setProfile({ sensitivity: null });
            setPicked(true);
          }}
        />
      </View>
    </QuizScreen>
  );
}
