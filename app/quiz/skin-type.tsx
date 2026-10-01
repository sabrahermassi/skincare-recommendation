import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { QuizOptionCard, QUIZ_OPTION_GRID } from "@/components/QuizOptionCard";
import { useQuizFrame } from "@/components/QuizFrame";
import { QuizScreen } from "@/components/QuizScreen";
import type { BaseSkinType } from "@/data/types";
import { nextQuizRoute, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const OPTIONS: { value: BaseSkinType; label: string }[] = [
  { value: "dry", label: "Dry" },
  { value: "oily", label: "Oily" },
  { value: "combination", label: "Combination" },
  { value: "normal", label: "Normal" },
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
            selected={baseSkinType === option.value}
            onPress={() => {
              setProfile({ baseSkinType: option.value });
              setPicked(true);
            }}
          />
        ))}

        <QuizOptionCard
          label="I don't know"
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
