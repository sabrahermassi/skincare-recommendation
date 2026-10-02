import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, View } from "react-native";

import { BuildingRoutine } from "@/components/BuildingRoutine";
import { QuizOptionCard, QUIZ_OPTION_GRID } from "@/components/QuizOptionCard";
import { useQuizFrame } from "@/components/QuizFrame";
import { QuizScreen } from "@/components/QuizScreen";
import { quizDestination } from "@/lib/open-quiz";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { prepareRoutine } from "@/lib/routine-build";
import { PREGNANCY_OPTIONS, PREGNANCY_QUESTION, PREGNANCY_WHY, pregnancyLabel, pregnancyOption, quizStepNumber } from "@/lib/profile";
import { BUTTON, DIVIDER } from "@/lib/tokens";
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

/** The least time the closing screen shows, and how long its bar takes to fill. */
export const BUILDING_MS = 2400;

/**
 * The closing screen's short bar (v9), filling from empty to full while the
 * routine is built, then calling `onDone` (owner). It moves on when the bar
 * is full and `work` has finished, whichever comes last: with a routine to
 * build, the screen waits for the real thing rather than for a clock, so the
 * routine is there when it opens (owner, 2 October 2026). With Reduce Motion
 * on the bar is full from the start, and waits the same.
 */
function BuildingBar({ work, onDone }: { /** Starts what the screen waits for, and returns a way to call it off. */ work?: (finished: () => void) => () => void; onDone: () => void }) {
  const [fill] = useState(() => new Animated.Value(reduceMotionNow() ? 1 : 0));
  const done = useRef(onDone);
  const start = useRef(work);
  useEffect(() => {
    // A scale, not a width, so the bar runs off the JS thread: that thread is
    // busy building the routine while this fills, and a width would stutter.
    const run = Animated.timing(fill, { toValue: 1, duration: BUILDING_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" });
    run.start();
    let full = false;
    let worked = !start.current;
    const maybeDone = () => full && worked && done.current();
    const timer = setTimeout(() => {
      full = true;
      maybeDone();
    }, BUILDING_MS);
    const callOff = start.current?.(() => {
      worked = true;
      maybeDone();
    });
    return () => {
      run.stop();
      clearTimeout(timer);
      callOff?.();
    };
  }, [fill]);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 160, height: 4, borderRadius: 2, backgroundColor: DIVIDER, overflow: "hidden" }}>
      <Animated.View style={{ width: "100%", height: 4, borderRadius: 2, backgroundColor: BUTTON.primary.fill, transformOrigin: "left", transform: [{ scaleX: fill }] }} />
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
        <BuildingRoutine
          title={toRoutine ? "Building your skincare routine…" : "Matching products to your skin…"}
          line={toRoutine ? "Putting together your morning and evening steps." : "Checking ingredients against your answers."}
        >
          {/* On the way to the routine, the wait is for the routine itself, built from the answers just given. */}
          <BuildingBar work={toRoutine ? (finished) => prepareRoutine(useAppStore.getState().profile, finished) : undefined} onDone={finish} />
        </BuildingRoutine>
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
