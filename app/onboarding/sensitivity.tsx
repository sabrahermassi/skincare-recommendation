import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";

import { QuizStep } from "@/components/QuizStep";
import type { Sensitivity } from "@/data/types";
import { POST_ONBOARDING_ROUTE, quizStepCount } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

/**
 * The last question, and the only one that changes how harshly a formula is
 * judged rather than what it should be doing for you.
 *
 * Three levels rather than the old toggle: "stings at everything" and
 * "occasionally tingles" want different verdicts on the same fragranced
 * serum, and a boolean collapsed them into one. The hints describe a
 * reaction the user has either had or not had — "have you reacted before"
 * is answerable, "how sensitive are you, from 1 to 3" is not.
 *
 * The scanner opens straight after this, per the MVP: no summary screen, no
 * "you're all set".
 */
const OPTIONS: { value: Sensitivity; label: string; hint: string }[] = [
  {
    value: "none",
    label: "Not sensitive",
    hint: "New products rarely bother my skin",
  },
  {
    value: "some",
    label: "Somewhat sensitive",
    hint: "Some products sting or leave me a bit red",
  },
  {
    value: "high",
    label: "Very sensitive",
    hint: "I react easily, and fragrance is usually the culprit",
  },
];

export default function SensitivityStep() {
  const sensitivity = useAppStore((s) => s.profile.sensitivity);
  const setProfile = useAppStore((s) => s.setProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  // `null` is unanswered, so "Not sensitive" has to be tapped to count —
  // otherwise the default would stand in for a choice the user never made.
  const answered = sensitivity !== null;

  function finish() {
    completeOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizStep
      step={quizStepCount()}
      title="How sensitive is your skin?"
      subtitle="This sets how cautious we are about irritants."
      onNext={finish}
      nextDisabled={!answered}
      nextLabel="Start scanning"
    >
      <View style={{ gap: 12 }}>
        {OPTIONS.map((option) => {
          const selected = answered && sensitivity === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setProfile({ sensitivity: option.value })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              // Border width is constant so selecting never nudges the layout.
              style={{ minHeight: 72, gap: 13, paddingHorizontal: 14, paddingVertical: 16 }}
              className={`flex-row items-center rounded-card border-2 ${
                selected ? "border-accent bg-tint-lilac" : "border-hairline bg-surface active:bg-canvas"
              }`}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  className={`text-[16px] font-semibold ${
                    selected ? "text-accent-text" : "text-ink"
                  }`}
                >
                  {option.label}
                </Text>
                <Text className="text-[13px] leading-[17.5px] text-ink-muted">
                  {option.hint}
                </Text>
              </View>

              <View style={{ height: 20, width: 20 }} className="items-center justify-center">
                {selected ? (
                  <View
                    style={{ height: 20, width: 20 }}
                    className="items-center justify-center rounded-full bg-accent"
                  >
                    <Text className="text-[11px] font-bold leading-[13px] text-white">✓</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </QuizStep>
  );
}
