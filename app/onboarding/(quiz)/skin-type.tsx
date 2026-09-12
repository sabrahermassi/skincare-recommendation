import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { QuizOptionCard } from "@/components/QuizOptionCard";
import { QuizScreen } from "@/components/QuizScreen";
import type { BaseSkinType } from "@/data/types";
import { nextQuizRoute, POST_ONBOARDING_ROUTE, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

/** Icons: design-watercolor/skin quiz/screens/skin quiz screen 2.png. */
const OPTIONS: { value: BaseSkinType; label: string; icon: number }[] = [
  { value: "dry", label: "Dry", icon: require("@/assets/illustrations/quiz/skin-dry.png") },
  { value: "oily", label: "Oily", icon: require("@/assets/illustrations/quiz/skin-oily.png") },
  { value: "combination", label: "Combination", icon: require("@/assets/illustrations/quiz/skin-combination.png") },
  { value: "normal", label: "Normal", icon: require("@/assets/illustrations/quiz/skin-normal.png") },
];

const UNSURE_ICON = require("@/assets/illustrations/quiz/unsure.png");

export default function SkinTypeStep() {
  const baseSkinType = useAppStore((s) => s.profile.baseSkinType);
  const setProfile = useAppStore((s) => s.setProfile);
  // "I don't know" writes null, which is also the unanswered value — so the
  // screen tracks the tap locally rather than inferring an answer from the
  // store. Someone who genuinely doesn't know their skin type still gets to
  // continue; we simply score on their concerns instead.
  const [picked, setPicked] = useState(baseSkinType !== null);

  function next() {
    const route = nextQuizRoute("/onboarding/skin-type");
    if (route) {
      router.push(route);
      return;
    }
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizScreen
      step={quizStepNumber("/onboarding/skin-type")}
      title="What's your skin type?"
      subtitle="Pick the closest match."
      onNext={next}
      nextDisabled={!picked}
    >
      <View>
        {OPTIONS.map((option) => (
          <QuizOptionCard
            key={option.value}
            icon={option.icon}
            label={option.label}
            selected={baseSkinType === option.value}
            onPress={() => {
              setProfile({ baseSkinType: option.value });
              setPicked(true);
            }}
          />
        ))}

        <QuizOptionCard
          icon={UNSURE_ICON}
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
