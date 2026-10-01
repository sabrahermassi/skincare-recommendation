import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";

import { QuizOptionCard, QUIZ_OPTION_GRID } from "@/components/QuizOptionCard";
import { useQuizFrame } from "@/components/QuizFrame";
import { QuizScreen } from "@/components/QuizScreen";
import { Text } from "@/components/Text";
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

/** How long the closing screen's bar takes to fill. */
const BUILDING_MS = 2400;

/**
 * The closing screen's short bar (v9), filling from empty to full as the
 * screen "builds" (owner). With Reduce Motion on it is simply full.
 */
function BuildingBar() {
  const [fill] = useState(() => new Animated.Value(reduceMotionNow() ? 1 : 0));
  useEffect(() => {
    // Width is layout, which the native driver can't animate.
    const run = Animated.timing(fill, { toValue: 1, duration: BUILDING_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: false });
    run.start();
    return () => run.stop();
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
  const { close } = useQuizFrame();
  const markQuizJustFinished = useAppStore((s) => s.markQuizJustFinished);
  const [picked, setPicked] = useState(pregnancyStatus !== null);
  // The quiz's closing moment (v9): the answers are in, and one more screen
  // says so before handing back to the screen the quiz opened over.
  const [building, setBuilding] = useState(false);

  // Back to the screen the quiz opened over, which now shows the score (#346).
  function finish() {
    // Not set by skipping (QuizFrame's close) — there is nothing to
    // acknowledge for a quiz nobody answered. See issue #95.
    markQuizJustFinished();
    close();
  }

  if (building) {
    return (
      <QuizScreen
        step={quizStepNumber("/quiz/pregnancy")}
        title=""
        building
        onBack={() => setBuilding(false)}
        onNext={finish}
        // The hand-off's label (v9). The quiz still closes back to the screen
        // it opened over, which now scores for the answers.
        nextLabel="See my routine"
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 }}>
          <Image source={BUILDING_ART} contentFit="contain" accessibilityLabel="" style={{ width: 280, height: 280 }} />
          <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
            Building your skincare routine…
          </Text>
          <Text style={{ maxWidth: 280, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
            Putting together your morning and evening steps.
          </Text>
          <BuildingBar />
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
      nextLabel="Build my profile"
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
