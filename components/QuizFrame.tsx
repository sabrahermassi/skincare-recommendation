import { Image } from "expo-image";
import { router } from "expo-router";
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Text";
import { CTA_TEXT, TERRACOTTA } from "@/components/shell/shared";
import { POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { CANVAS, DOT_INACTIVE, INK, MUTED } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// design-watercolor/skin quiz/screens/skin quiz background.png, resized to
// 1440px wide — enough for the densest phone screens, where the 3412px
// original would only add weight to the download. No lettering on it, by
// explicit request: the quiz screens carry no text but their own.
const QUIZ_BACKGROUND = require("@/assets/illustrations/onboarding/quiz-background.png");

/** Top padding of the quiz's first row. Shared so QuizScreen's dots and back
 *  arrow line up with Skip here. */
export function quizTopPadding(insetTop: number) {
  return Math.max(20, insetTop + 10);
}

type QuizFrameValue = {
  /** Called by the step that's showing, so the fixed button acts for it. */
  setFooter: (label: string, disabled: boolean, onPress: () => void) => void;
};

const QuizFrameContext = createContext<QuizFrameValue | null>(null);

export function useQuizFrame(): QuizFrameValue {
  const value = useContext(QuizFrameContext);
  if (!value) throw new Error("QuizScreen must render inside QuizFrame");
  return value;
}

/**
 * Everything on the quiz screens that must not move between steps: the
 * background, Skip, and the Continue / Start scanning button. Rendered once
 * by app/onboarding/(quiz)/_layout.tsx around the step navigator, so tapping
 * Continue only changes the see-through step page inside it.
 */
export function QuizFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [label, setLabel] = useState("Continue");
  const [disabled, setDisabled] = useState(true);
  const [pressed, setPressed] = useState(false);
  const [skipPressed, setSkipPressed] = useState(false);
  // A ref, not state: steps pass a new function on every render, and storing
  // it as state would re-render the frame (and so the step) every time.
  const onPressRef = useRef<() => void>(() => {});

  const value = useMemo<QuizFrameValue>(
    () => ({
      setFooter(nextLabel, nextDisabled, onPress) {
        setLabel(nextLabel);
        setDisabled(nextDisabled);
        onPressRef.current = onPress;
      },
    }),
    [],
  );

  // Skip the quiz, not the app: lands on the scanner exactly like finishing
  // the quiz would, just without the remaining answers.
  function skipQuiz() {
    completeOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizFrameContext.Provider value={value}>
      <View style={{ flex: 1, backgroundColor: CANVAS }}>
        {/* "cover" fills the screen without distorting the art; the image is
            already phone-shaped, so almost nothing is cropped. */}
        <Image
          source={QUIZ_BACKGROUND}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          accessibilityLabel=""
        />

        <View style={{ flex: 1 }}>{children}</View>

        <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(28, insets.bottom + 14) }}>
          <Pressable
            onPress={() => onPressRef.current()}
            disabled={disabled}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            accessibilityRole="button"
            style={{
              minHeight: 48,
              borderRadius: 24,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              backgroundColor: disabled ? DOT_INACTIVE : TERRACOTTA,
              opacity: pressed ? 0.9 : 1,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "500", color: disabled ? MUTED : CTA_TEXT }}>{label}</Text>
            <Text style={{ fontSize: 16, color: disabled ? MUTED : CTA_TEXT }}>→</Text>
          </Pressable>
        </View>

        {/* After the step navigator, so it's drawn (and tappable) above it. */}
        <Pressable
          onPress={skipQuiz}
          onPressIn={() => setSkipPressed(true)}
          onPressOut={() => setSkipPressed(false)}
          hitSlop={10}
          accessibilityRole="button"
          style={{
            position: "absolute",
            top: quizTopPadding(insets.top),
            right: 24,
            minHeight: 44,
            minWidth: 44,
            alignItems: "flex-end",
            justifyContent: "center",
            opacity: skipPressed ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: INK }}>Skip</Text>
        </Pressable>
      </View>
    </QuizFrameContext.Provider>
  );
}
