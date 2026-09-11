import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { QuizChip, QUIZ_CHIP_GRID } from "@/components/QuizChip";
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
 * specific complaints). "Eczema-prone" is deliberately not offered here —
 * removed from the quiz's selectable options per this session's design
 * decision (see the plan's "Eczema-prone concern" note) — though the
 * `"atopic"` concern and its scoring rules remain intact for any profile that
 * already carries it from before this change.
 */
const OPTIONS: { value: Concern; label: string }[] = [
  { value: "dehydrated", label: "Dry / Dehydrated" },
  { value: "dullness", label: "Dullness" },
  { value: "acne-prone", label: "Acne or pimples" },
  { value: "hyperpigmentation", label: "Dark spots" },
  { value: "large-pores", label: "Enlarged pores" },
  { value: "fine-lines", label: "Fine lines and wrinkles" },
  { value: "redness", label: "Redness or rosacea" },
  { value: "post-acne-marks", label: "Post-acne marks" },
];

const MAX = 3;

export default function ConcernsStep() {
  const concerns = useAppStore((s) => s.profile.concerns);
  const toggleConcern = useAppStore((s) => s.toggleConcern);
  const setProfile = useAppStore((s) => s.setProfile);

  // Distinguishes "explicitly chose none" from "hasn't touched this screen
  // yet" — both are `concerns: []`, same pattern skin-type's "I don't know"
  // uses for baseSkinType: null vs. unanswered.
  const [noneChosen, setNoneChosen] = useState(false);

  const atLimit = concerns.length >= MAX;

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
      illustration={require("@/assets/illustrations/girl-loupe.png")}
      onNext={next}
      nextDisabled={concerns.length === 0 && !noneChosen}
    >
      <View style={QUIZ_CHIP_GRID}>
        {OPTIONS.map((option) => {
          const selected = !noneChosen && concerns.includes(option.value);
          return (
            <QuizChip
              key={option.value}
              multiple
              label={option.label}
              selected={selected}
              disabled={!selected && atLimit}
              onPress={() => pickConcern(option.value)}
            />
          );
        })}
        <QuizChip
          label="I don't have any concerns"
          selected={noneChosen}
          onPress={pickNone}
        />
      </View>

      <Text style={{ marginTop: 16, fontSize: 12, color: MUTED }}>
        {noneChosen
          ? "No concerns selected."
          : atLimit
            ? `${MAX} chosen - deselect one to swap.`
            : `${concerns.length} of ${MAX} chosen.`}
      </Text>
    </QuizScreen>
  );
}
