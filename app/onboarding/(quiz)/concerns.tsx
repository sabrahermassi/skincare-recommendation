import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { QuizOptionCard, QUIZ_OPTION_GRID } from "@/components/QuizOptionCard";
import { QuizScreen } from "@/components/QuizScreen";
import { Text } from "@/components/Text";
import type { Concern } from "@/data/types";
import { nextQuizRoute, POST_ONBOARDING_ROUTE, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { MUTED } from "@/lib/tokens";

/**
 * Ordered by how common each concern is reported in skincare-usage surveys
 * (dehydration/dryness and dullness lead, followed by acne/pores/lines/tone
 * concerns, rosacea-specific redness and post-acne marks trailing as more
 * specific complaints) — the same order the design mockups use.
 * "Eczema-prone" is deliberately not offered here — removed from the quiz's
 * selectable options per this session's design decision — though the
 * `"atopic"` concern and its scoring rules remain intact for any profile that
 * already carries it from before that change.
 *
 * Icons: design-watercolor/skin quiz/screens/skin quiz screen 1.png.
 */
const OPTIONS: { value: Concern; label: string; icon: number }[] = [
  {
    value: "dehydrated",
    label: "Dry / Dehydrated",
    icon: require("@/assets/illustrations/quiz/concern-dehydrated.png"),
  },
  { value: "dullness", label: "Dullness", icon: require("@/assets/illustrations/quiz/concern-dullness.png") },
  { value: "acne-prone", label: "Acne or pimples", icon: require("@/assets/illustrations/quiz/concern-acne.png") },
  {
    value: "hyperpigmentation",
    label: "Dark spots",
    icon: require("@/assets/illustrations/quiz/concern-dark-spots.png"),
  },
  {
    value: "large-pores",
    label: "Enlarged pores",
    icon: require("@/assets/illustrations/quiz/concern-large-pores.png"),
  },
  {
    value: "fine-lines",
    label: "Fine lines and wrinkles",
    icon: require("@/assets/illustrations/quiz/concern-fine-lines.png"),
  },
  {
    value: "redness",
    label: "Redness or rosacea",
    icon: require("@/assets/illustrations/quiz/concern-redness.png"),
  },
  {
    value: "post-acne-marks",
    label: "Post-acne marks",
    icon: require("@/assets/illustrations/quiz/concern-post-acne.png"),
  },
];

const NONE_ICON = require("@/assets/illustrations/quiz/concern-none.png");

const MAX = 3;

// What OPTIONS actually offers — used to count only concerns a user can see
// and toggle here, not the raw profile array. A profile can carry `atopic`
// (dropped as a selectable option per this session's design decision, but
// its scoring stays intact — see OPTIONS' own comment), and counting it
// toward MAX would show "3 of 3" and disable every card for someone who has
// only picked 2 things they can actually see. store/useAppStore.ts's
// toggleConcern has the matching fix on the write side.
const OPTION_VALUES = new Set(OPTIONS.map((o) => o.value));

export default function ConcernsStep() {
  const concerns = useAppStore((s) => s.profile.concerns);
  const toggleConcern = useAppStore((s) => s.toggleConcern);
  const setProfile = useAppStore((s) => s.setProfile);

  // Distinguishes "explicitly chose none" from "hasn't touched this screen
  // yet" — both are `concerns: []`, same pattern skin-type's "I don't know"
  // uses for baseSkinType: null vs. unanswered.
  const [noneChosen, setNoneChosen] = useState(false);

  const visibleCount = concerns.filter((c) => OPTION_VALUES.has(c)).length;
  const atLimit = visibleCount >= MAX;

  function pickConcern(value: Concern) {
    setNoneChosen(false);
    toggleConcern(value);
  }

  function pickNone() {
    setNoneChosen(true);
    setProfile({ concerns: [] });
  }

  // Same pattern skin-type.tsx and sensitivity.tsx use, rather than a
  // hardcoded `router.push("/onboarding/skin-type")` — concerns is never the
  // last step today, so the `null` branch is unreachable, but a hardcoded
  // route silently stops following `STEPS` the moment someone reorders it,
  // which is exactly why the other two screens don't do it either.
  function next() {
    const route = nextQuizRoute("/onboarding/concerns");
    if (route) {
      router.push(route);
      return;
    }
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizScreen
      step={quizStepNumber("/onboarding/concerns")}
      title="What are your main skin concerns?"
      subtitle={`Pick up to ${MAX}. You can change these later.`}
      onNext={next}
      nextDisabled={concerns.length === 0 && !noneChosen}
    >
      <View style={QUIZ_OPTION_GRID}>
        {OPTIONS.map((option) => {
          const selected = !noneChosen && concerns.includes(option.value);
          return (
            <QuizOptionCard
              key={option.value}
              layout="grid"
              multiple
              icon={option.icon}
              label={option.label}
              selected={selected}
              disabled={!selected && atLimit}
              onPress={() => pickConcern(option.value)}
            />
          );
        })}
      </View>

      <QuizOptionCard icon={NONE_ICON} label="I don't have any concerns" selected={noneChosen} onPress={pickNone} />

      <Text style={{ marginTop: 4, fontSize: 12.5, color: MUTED }}>
        {noneChosen
          ? "No concerns selected."
          : atLimit
            ? `${MAX} chosen – deselect one to swap.`
            : `${visibleCount} of ${MAX} chosen.`}
      </Text>
    </QuizScreen>
  );
}
