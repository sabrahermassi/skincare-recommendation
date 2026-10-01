import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { QuizOptionCard, QUIZ_OPTION_GRID } from "@/components/QuizOptionCard";
import { useQuizFrame } from "@/components/QuizFrame";
import { QuizScreen } from "@/components/QuizScreen";
import type { BaseSkinType } from "@/data/types";
import { nextQuizRoute, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

// Each answer says what it feels like (v9, the hand-off's words), so nobody
// has to know the word for their own skin.
const OPTIONS: { value: BaseSkinType; label: string; description: string }[] = [
  { value: "normal", label: "Normal", description: "Barely visible pores, feels comfortable" },
  { value: "dry", label: "Dry", description: "Feels tight, might be flaky" },
  { value: "oily", label: "Oily", description: "Shiny all over, visible pores" },
  { value: "combination", label: "Combination", description: "Oily T-zone, normal or dry cheeks" },
];


export default function SkinTypeStep() {
  const { close } = useQuizFrame();
  const baseSkinType = useAppStore((s) => s.profile.baseSkinType);
  const setProfile = useAppStore((s) => s.setProfile);
  // "I don't know" writes null, which is also the unanswered value — so the
  // screen tracks the tap locally rather than inferring an answer from the
  // store. Someone who genuinely doesn't know their skin type still gets to
  // continue; we simply score on their concerns instead.
  const [picked, setPicked] = useState(baseSkinType !== null);

  function next() {
    const route = nextQuizRoute("/quiz/skin-type");
    if (route) {
      router.push(route);
      return;
    }
    close();
  }

  return (
    <QuizScreen
      step={quizStepNumber("/quiz/skin-type")}
      title="What is your skin type?"
      subtitle="How your skin feels by midday, without products."
      onNext={next}
      nextDisabled={!picked}
    >
      <View style={QUIZ_OPTION_GRID}>
        {OPTIONS.map((option) => (
          <QuizOptionCard
            key={option.value}
            label={option.label}
            description={option.description}
            selected={baseSkinType === option.value}
            onPress={() => {
              setProfile({ baseSkinType: option.value });
              setPicked(true);
            }}
          />
        ))}

        <QuizOptionCard
          label="Not sure"
          description="We'll keep things gentle"
          selected={picked && baseSkinType === null}
          onPress={() => {
            setProfile({ baseSkinType: null });
            setPicked(true);
          }}
        />
      </View>
    </QuizScreen>
  );
}
