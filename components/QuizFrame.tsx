import { router, useNavigation } from "expo-router";
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { CANVAS, HAIRLINE, MUTED, SPACE, TYPE } from "@/lib/tokens";
import { haptic } from "@/lib/haptics";


/** Top padding of the quiz's first row: back, progress bars and close. */
export function quizTopPadding(insetTop: number) {
  return Math.max(20, insetTop + 10);
}

type QuizFrameValue = {
  /**
   * Called by the step that's showing, so the fixed button acts for it. A
   * step with a count to show (concerns: "2 of 3 chosen") passes it as
   * `counter`, drawn above the button (v9).
   */
  setFooter: (label: string, disabled: boolean, onPress: () => void, counter?: string) => void;
  /** Re-arms the footer button after a step change — see `navigatingRef`. */
  releaseFooter: () => void;
  /** Closes the whole quiz, back to the screen that opened it (#346). */
  close: () => void;
};

const QuizFrameContext = createContext<QuizFrameValue | null>(null);

export function useQuizFrame(): QuizFrameValue {
  const value = useContext(QuizFrameContext);
  if (!value) throw new Error("QuizScreen must render inside QuizFrame");
  return value;
}

/**
 * Everything on the quiz screens that must not move between steps: the
 * background and the Continue / See my match button. No Skip (owner): the quiz is a
 * sheet, so a swipe down closes it like any iOS sheet. Rendered once
 * by app/quiz/_layout.tsx around the step navigator, so tapping
 * Continue only changes the see-through step page inside it.
 *
 * The quiz is a modal over the screen that opened it (#346). The frame sits
 * in the layout, outside the step navigator, so its navigation is the
 * modal's own screen on the root stack: going back from there closes the
 * whole quiz from any step, where a step's own `router.back()` would only
 * return to the step before.
 */
export function QuizFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [label, setLabel] = useState("Continue");
  const [disabled, setDisabled] = useState(true);
  const [counter, setCounter] = useState<string | undefined>(undefined);
  // A ref, not state: steps pass a new function on every render, and storing
  // it as state would re-render the frame (and so the step) every time.
  const onPressRef = useRef<() => void>(() => {});
  // Latched on press, cleared when the next step takes focus. A step's own
  // `next()` calls router.push, which isn't instant — two fast taps would
  // otherwise push the same route twice and leave a duplicate on the back
  // stack. A ref rather than state for the same reason as onPressRef: a
  // state flag here would re-render the frame on every tap.
  const navigatingRef = useRef(false);

  const value = useMemo<QuizFrameValue>(
    () => ({
      // "See my match" on the last step. Every answer is saved as it's tapped, so a
      // quiz swiped away early keeps what was answered too (#346).
      close() {
        // Opened from a link, the quiz can be the only screen there is.
        if (navigation.canGoBack()) navigation.goBack();
        else router.replace(POST_ONBOARDING_ROUTE);
      },
      setFooter(nextLabel, nextDisabled, onPress, nextCounter) {
        setLabel(nextLabel);
        setDisabled(nextDisabled);
        setCounter(nextCounter);
        onPressRef.current = onPress;
      },
      releaseFooter() {
        navigatingRef.current = false;
      },
    }),
    [navigation],
  );

  function pressFooter() {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    haptic.tap();
    onPressRef.current();
  }

  return (
    <QuizFrameContext.Provider value={value}>
      {/* No Skip on screen (owner), so VoiceOver's escape gesture (a two-finger
          Z) closes the quiz too, the way a swipe down does. */}
      <View style={{ flex: 1, backgroundColor: CANVAS }} onAccessibilityEscape={value.close}>
        <View style={{ flex: 1 }}>{children}</View>

        {/* The button on its own bar at the foot (v9), above a hairline, with
            the concerns counter over it. */}
        <View
          style={{
            gap: SPACE.text,
            paddingTop: SPACE.block,
            paddingHorizontal: SPACE.gutter,
            paddingBottom: Math.max(SPACE.section, insets.bottom + SPACE.block),
            borderTopWidth: 0.5,
            borderTopColor: HAIRLINE,
          }}
        >
          {counter ? (
            <Text accessibilityLiveRegion="polite" style={{ textAlign: "center", fontSize: TYPE.caption, color: MUTED }}>
              {counter}
            </Text>
          ) : null}
          <PrimaryButton label={label} onPress={pressFooter} disabled={disabled} />
        </View>
      </View>
    </QuizFrameContext.Provider>
  );
}
