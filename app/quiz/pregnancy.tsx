import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";

import { QuizOptionCard, QUIZ_OPTION_GRID } from "@/components/QuizOptionCard";
import { useQuizFrame } from "@/components/QuizFrame";
import { QuizScreen } from "@/components/QuizScreen";
import { Text } from "@/components/Text";
import { quizDestination } from "@/lib/open-quiz";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { PREGNANCY_OPTIONS, PREGNANCY_QUESTION, PREGNANCY_WHY, pregnancyLabel, pregnancyOption, quizStepNumber } from "@/lib/profile";
import { BUTTON, DISPLAY_FONT, DIVIDER, INK, MUTED, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * The quiz's 4th and final question. Unlike the gender/age fields this app
 * removed for being collected and read by nothing, this one is read:
 * `lib/safety.ts` flags retinoids, salicylic acid, hydroquinone and essential
 * oils as a caution when the answer is "pregnant" or "breastfeeding"
 * (`lib/pregnancy-caution.ts`).
 *
 * Yes, No or Prefer not to say (owner). "Yes" is stored as "pregnant": scoring
 * treats pregnant and breastfeeding the same, so the answer needs no finer
 * split, and an older "breastfeeding" answer still reads as Yes
 * (`pregnancyOption`). Prefer not to say lets someone finish the quiz without
 * answering either way.
 */

const BUILDING_ART = require("@/assets/illustrations/loading-routine.webp");

/** How long the closing screen shows, and its bar takes to fill. */
export const BUILDING_MS = 2400;

/**
 * The closing screen's short bar (v9), filling from empty to full while the
 * routine is "built", then calling `onDone` (owner). With Reduce Motion on it
 * is full from the start, and waits the same time.
 */
function BuildingBar({ onDone }: { onDone: () => void }) {
  const [fill] = useState(() => new Animated.Value(reduceMotionNow() ? 1 : 0));
  useEffect(() => {
    // Width is layout, which the native driver can't animate.
    const run = Animated.timing(fill, { toValue: 1, duration: BUILDING_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: false });
    run.start();
    const done = setTimeout(onDone, BUILDING_MS);
    return () => {
      run.stop();
      clearTimeout(done);
    };
    // `onDone` is read once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill]);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 160, height: 4, borderRadius: 2, backgroundColor: DIVIDER, overflow: "hidden" }}>
      <Animated.View style={{ width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }), height: 4, borderRadius: 2, backgroundColor: BUTTON.primary.fill }} />
    </View>
  );
}

export default function PregnancyStep() {
  const pregnancyStatus = useAppStore((s) => s.profile.pregnancyStatus);
  const setProfile = useAppStore((s) => s.setProfile);
  const markQuizJustFinished = useAppStore((s) => s.markQuizJustFinished);
  const [picked, setPicked] = useState(pregnancyStatus !== null);
  // The quiz's closing moment (v9): the answers are in, and a progress screen
  // shows while the routine is "built", then opens it (owner).
  const [building, setBuilding] = useState(false);

  // Where the quiz leads: opened from the Skincare routine, on to the routine;
  // opened anywhere else (a product's "Take the 1-minute quiz"), back to that
  // screen, which now shows the skin match.
  const toRoutine = quizDestination() === "routine";
  const { close } = useQuizFrame();
  function finish() {
    // Not set by skipping (QuizFrame's close) — there is nothing to
    // acknowledge for a quiz nobody answered. See issue #95.
    markQuizJustFinished();
    if (toRoutine) router.dismissTo("/routine");
    else close();
  }

  if (building) {
    return (
      <QuizScreen
        step={quizStepNumber("/quiz/pregnancy")}
        title=""
        building
        onBack={() => setBuilding(false)}
        // No button here: the screen moves on by itself when the bar is full.
        onNext={() => {}}
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 }}>
          <Image source={BUILDING_ART} contentFit="contain" accessibilityLabel="" style={{ width: 280, height: 280 }} />
          <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
            {toRoutine ? "Building your skincare routine…" : "Matching products to your skin…"}
          </Text>
          <Text style={{ maxWidth: 280, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
            {toRoutine ? "Putting together your morning and evening steps." : "Checking ingredients against your answers."}
          </Text>
          <BuildingBar onDone={finish} />
        </View>
      </QuizScreen>
    );
  }

  return (
    <QuizScreen
      step={quizStepNumber("/quiz/pregnancy")}
      title={PREGNANCY_QUESTION}
      subtitle={PREGNANCY_WHY}
      onNext={() => setBuilding(true)}
      nextDisabled={!picked}
      nextLabel={toRoutine ? "See my routine" : "See my match"}
    >
      <View style={QUIZ_OPTION_GRID}>
        {PREGNANCY_OPTIONS.map((option) => (
          <QuizOptionCard
            key={option}
            label={pregnancyLabel(option)}
            selected={picked && pregnancyStatus !== null && pregnancyOption(pregnancyStatus) === option}
            onPress={() => {
              setProfile({ pregnancyStatus: option });
              setPicked(true);
            }}
          />
        ))}
      </View>
    </QuizScreen>
  );
}
