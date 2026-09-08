import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { QuizScreen } from "@/components/QuizScreen";
import { Text } from "@/components/Text";

import type { Pregnancy } from "@/data/types";
import { pregnancyLabel, POST_ONBOARDING_ROUTE, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, INK, RADIUS_SELECTOR, SELECTED } from "@/lib/tokens";

const OPTIONS: Pregnancy[] = ["pregnant", "breastfeeding", "neither", "prefer-not-to-say"];

/**
 * The quiz's new 4th and final question. Unlike the gender/age fields this
 * app removed for being collected and read by nothing, this one is read:
 * `lib/safety.ts` flags retinoids, salicylic acid, hydroquinone and
 * essential oils as a caution when the answer is "pregnant" or
 * "breastfeeding" (`lib/pregnancy-caution.ts`).
 *
 * Single-select cards, not the concerns screen's 2-per-row chip grid — same
 * convention as skin-type and sensitivity, the quiz's other single-select
 * steps.
 */
export default function PregnancyStep() {
  const pregnancyStatus = useAppStore((s) => s.profile.pregnancyStatus);
  const setProfile = useAppStore((s) => s.setProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [picked, setPicked] = useState(pregnancyStatus !== null);

  function finish() {
    completeOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizScreen
      step={quizStepNumber("/onboarding/pregnancy")}
      title="Are you pregnant or breastfeeding?"
      subtitle="A few ingredients get an extra caution when this applies."
      illustration={require("@/assets/illustrations/illustration-17.png")}
      onNext={finish}
      nextDisabled={!picked}
      nextLabel="Start scanning"
    >
      <View style={{ gap: 12 }}>
        {OPTIONS.map((value) => {
          const selected = picked && pregnancyStatus === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                setProfile({ pregnancyStatus: value });
                setPicked(true);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                minHeight: 52,
                paddingHorizontal: 16,
                justifyContent: "center",
                borderRadius: RADIUS_SELECTOR,
                borderWidth: selected ? 1.5 : 1,
                borderColor: selected ? INK : BORDER_INACTIVE,
                backgroundColor: selected ? SELECTED : CANVAS,
              }}
            >
              <Text style={{ fontSize: 15.5, fontWeight: "500", color: INK }}>
                {pregnancyLabel(value)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </QuizScreen>
  );
}
