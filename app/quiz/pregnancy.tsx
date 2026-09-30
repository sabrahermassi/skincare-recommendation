import { useState } from "react";
import { View } from "react-native";

import { QuizOptionCard, QUIZ_OPTION_GRID } from "@/components/QuizOptionCard";
import { useQuizFrame } from "@/components/QuizFrame";
import { QuizScreen } from "@/components/QuizScreen";
import type { Pregnancy } from "@/data/types";
import { PREGNANCY_QUESTION, PREGNANCY_WHY, pregnancyYesNo, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { NONE_ICON, PREGNANCY_ICON } from "@/lib/quiz-icons";

/**
 * The quiz's 4th and final question. Unlike the gender/age fields this app
 * removed for being collected and read by nothing, this one is read:
 * `lib/safety.ts` flags retinoids, salicylic acid, hydroquinone and essential
 * oils as a caution when the answer is "pregnant" or "breastfeeding"
 * (`lib/pregnancy-caution.ts`).
 *
 * A yes or no (owner). "Yes" is stored as "pregnant": scoring treats
 * pregnant and breastfeeding the same, so the answer needs no finer split, and
 * an older "breastfeeding" answer still reads as Yes (`isYes`).
 *
 * Icons: design-watercolor/skin quiz/screens/skin quiz screen 4.png.
 */
const OPTIONS: { value: Pregnancy; label: string; icon: number }[] = [
  { value: "pregnant", label: "Yes", icon: PREGNANCY_ICON.pregnant },
  { value: "neither", label: "No", icon: NONE_ICON },
];

export default function PregnancyStep() {
  const pregnancyStatus = useAppStore((s) => s.profile.pregnancyStatus);
  const setProfile = useAppStore((s) => s.setProfile);
  const { close } = useQuizFrame();
  const markQuizJustFinished = useAppStore((s) => s.markQuizJustFinished);
  // A legacy "prefer not to say" isn't one of the two options, so it counts as
  // not picked yet: Finish waits for Yes or No rather than showing neither.
  const [picked, setPicked] = useState(pregnancyStatus !== null && pregnancyYesNo(pregnancyStatus) !== null);

  // Back to the screen the quiz opened over, which now shows the score (#346).
  function finish() {
    // Not set by skipping (QuizFrame's close) — there is nothing to
    // acknowledge for a quiz nobody answered. See issue #95.
    markQuizJustFinished();
    close();
  }

  return (
    <QuizScreen
      step={quizStepNumber("/quiz/pregnancy")}
      title={PREGNANCY_QUESTION}
      subtitle={PREGNANCY_WHY}
      onNext={finish}
      nextDisabled={!picked}
      // Says what it does (#295): the quiz ends here. Not "Done": Skin
      // profile's per-section "Done" only closes a section without saving
      // (#308 review).
      nextLabel="Finish"
    >
      <View style={QUIZ_OPTION_GRID}>
        {OPTIONS.map((option) => (
          <QuizOptionCard
            key={option.value}
            icon={option.icon}
            label={option.label}
            selected={picked && pregnancyStatus !== null && pregnancyYesNo(pregnancyStatus) === option.value}
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
