import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { QuizOptionCard, QUIZ_OPTION_GRID } from "@/components/QuizOptionCard";
import { useQuizFrame } from "@/components/QuizFrame";
import { QuizScreen } from "@/components/QuizScreen";
import type { Sensitivity } from "@/data/types";
import { nextQuizRoute, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

/**
 * Third of four questions (pregnancy/breastfeeding follows), so this screen
 * hands off to the next route instead of completing onboarding itself.
 * "I don't know" exists because not everyone has tested enough products to
 * have an answer, and guessing would misjudge irritation either too harshly
 * or not harshly enough.
 */
const OPTIONS: { value: Sensitivity; label: string; description: string }[] = [
  { value: "none", label: "Not sensitive", description: "Rarely reacts to new products" },
  { value: "some", label: "Somewhat sensitive", description: "Sometimes stings or turns red" },
  { value: "high", label: "Very sensitive", description: "Reacts to many products" },
];


export default function SensitivityStep() {
  const { close } = useQuizFrame();
  const sensitivity = useAppStore((s) => s.profile.sensitivity);
  const setProfile = useAppStore((s) => s.setProfile);
  // `null` is both "unanswered" and "I don't know" — see baseSkinType's
  // identical precedent in skin-type.tsx — so the screen tracks the tap
  // locally rather than inferring an answer from the store.
  const [picked, setPicked] = useState(sensitivity !== null);

  function next() {
    const route = nextQuizRoute("/quiz/sensitivity");
    if (route) {
      router.push(route);
      return;
    }
    close();
  }

  return (
    <QuizScreen
      step={quizStepNumber("/quiz/sensitivity")}
      title="How sensitive is your skin?"
      subtitle="This sets how careful we are with irritants."
      onNext={next}
      nextDisabled={!picked}
    >
      <View style={QUIZ_OPTION_GRID}>
        {OPTIONS.map((option) => (
          <QuizOptionCard
            key={option.value}
            label={option.label}
            description={option.description}
            selected={picked && sensitivity === option.value}
            onPress={() => {
              setProfile({ sensitivity: option.value });
              setPicked(true);
            }}
          />
        ))}

        <QuizOptionCard
          label="Not sure"
          description="We'll be a little careful"
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
