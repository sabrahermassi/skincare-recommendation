import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { QuizOptionCard, QUIZ_OPTION_GRID } from "@/components/QuizOptionCard";
import { useQuizFrame } from "@/components/QuizFrame";
import { QuizScreen } from "@/components/QuizScreen";
import type { Concern } from "@/data/types";
import { CONCERN_TITLE, nextQuizRoute, quizStepNumber } from "@/lib/profile";
import { MAX_CONCERNS, useAppStore } from "@/store/useAppStore";

/**
 * In the hand-off's order (v9), the same one the Skin needs concerns use.
 * "Eczema-prone" is deliberately not offered here — removed from the quiz's
 * selectable options per this session's design decision — though the
 * `"atopic"` concern and its scoring rules remain intact for any profile that
 * already carries it from before that change.
 *
 * v9 drops the pictures: the answer's name alone, on a full-width row.
 */
const OPTIONS: { value: Concern; label: string }[] = [
  { value: "acne-prone", label: CONCERN_TITLE["acne-prone"] },
  { value: "post-acne-marks", label: CONCERN_TITLE["post-acne-marks"] },
  { value: "dehydrated", label: CONCERN_TITLE.dehydrated },
  { value: "redness", label: CONCERN_TITLE.redness },
  { value: "large-pores", label: CONCERN_TITLE["large-pores"] },
  { value: "fine-lines", label: CONCERN_TITLE["fine-lines"] },
  { value: "dullness", label: CONCERN_TITLE.dullness },
  { value: "hyperpigmentation", label: CONCERN_TITLE.hyperpigmentation },
];


// What OPTIONS actually offers — used to count only concerns a user can see
// and toggle here, not the raw profile array. A profile can carry `atopic`
// (dropped as a selectable option per this session's design decision, but
// its scoring stays intact — see OPTIONS' own comment), and counting it
// toward MAX_CONCERNS would show "3 of 3" and disable every card for someone
// who has only picked 2 things they can actually see. store/useAppStore.ts's
// toggleConcern has the matching fix on the write side.
const OPTION_VALUES = new Set(OPTIONS.map((o) => o.value));

export default function ConcernsStep() {
  const { close } = useQuizFrame();
  const concerns = useAppStore((s) => s.profile.concerns);
  const toggleConcern = useAppStore((s) => s.toggleConcern);
  const setProfile = useAppStore((s) => s.setProfile);

  // Distinguishes "explicitly chose none" from "hasn't touched this screen
  // yet" — both are `concerns: []`, same pattern skin-type's "I don't know"
  // uses for baseSkinType: null vs. unanswered.
  const [noneChosen, setNoneChosen] = useState(false);

  const visibleCount = concerns.filter((c) => OPTION_VALUES.has(c)).length;
  const atLimit = visibleCount >= MAX_CONCERNS;

  function pickConcern(value: Concern) {
    setNoneChosen(false);
    toggleConcern(value);
  }

  function pickNone() {
    setNoneChosen(true);
    setProfile({ concerns: [] });
  }

  // Same pattern skin-type.tsx and sensitivity.tsx use, rather than a
  // hardcoded `router.push("/quiz/skin-type")` — concerns is never the
  // last step today, so the `null` branch is unreachable, but a hardcoded
  // route silently stops following `STEPS` the moment someone reorders it,
  // which is exactly why the other two screens don't do it either.
  function next() {
    const route = nextQuizRoute("/quiz/concerns");
    if (route) {
      router.push(route);
      return;
    }
    close();
  }

  return (
    <QuizScreen
      step={quizStepNumber("/quiz/concerns")}
      title="What would you like to work on?"
      subtitle={`Pick up to ${MAX_CONCERNS}. We score every product for these.`}
      onNext={next}
      nextDisabled={concerns.length === 0 && !noneChosen}
      // The quiz's first step: the modal opens on it (#346), so there is no
      // earlier step to go back to, and its back arrow closes the quiz.
      first
    >
      <View style={QUIZ_OPTION_GRID}>
        {OPTIONS.map((option) => {
          const selected = !noneChosen && concerns.includes(option.value);
          return (
            <QuizOptionCard
              key={option.value}
              multiple
              label={option.label}
              selected={selected}
              disabled={!selected && atLimit}
              onPress={() => pickConcern(option.value)}
            />
          );
        })}
        <QuizOptionCard label="I don't have any concerns" selected={noneChosen} onPress={pickNone} />
      </View>
    </QuizScreen>
  );
}
