import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { QuizScreen } from "@/components/QuizScreen";
import { Text } from "@/components/Text";

import type { Sensitivity } from "@/data/types";
import { nextQuizRoute, POST_ONBOARDING_ROUTE, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, RADIUS_SELECTOR, SELECTED } from "@/lib/tokens";

/**
 * Third of four questions now (pregnancy/breastfeeding follows) — no longer
 * the quiz's last step, so this screen hands off to the next route instead
 * of completing onboarding itself. "I don't know" is new this session: not
 * everyone has tested enough products to have an answer, and guessing would
 * misjudge irritation either too harshly or not harshly enough.
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
      illustration={require("@/assets/illustrations/girl-hat-sun.png")}
      onNext={next}
      nextDisabled={!picked}
    >
      <View style={{ gap: 12 }}>
        {OPTIONS.map((option) => (
          <SensitivityCard
            key={option.value}
            label={option.label}
            hint={option.hint}
            selected={picked && sensitivity === option.value}
            onPress={() => {
              setProfile({ sensitivity: option.value });
              setPicked(true);
            }}
          />
        ))}

        <SensitivityCard
          label="I don't know"
          hint="We'll go easy on irritation until you tell us otherwise."
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

function SensitivityCard({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        minHeight: 72,
        gap: 13,
        paddingHorizontal: 14,
        paddingVertical: 16,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: RADIUS_SELECTOR,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? INK : BORDER_INACTIVE,
        backgroundColor: selected ? SELECTED : CANVAS,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: INK }}>{label}</Text>
        <Text style={{ fontSize: 13, lineHeight: 17.5, color: MUTED }}>{hint}</Text>
      </View>

      <View style={{ height: 20, width: 20, alignItems: "center", justifyContent: "center" }}>
        {selected ? (
          <View
            style={{
              height: 20,
              width: 20,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              backgroundColor: INK,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "bold", lineHeight: 13, color: CANVAS }}>
              ✓
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
