import { router, useFocusEffect } from "expo-router";
import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { useCallback, type ReactNode } from "react";
import { Image } from "expo-image";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { QUIZ_BACKGROUND, quizTopPadding, useQuizFrame } from "@/components/QuizFrame";
import { Text } from "@/components/Text";
import { ProgressDots } from "@/components/shell/shared";
import { quizStepCount } from "@/lib/profile";
import { INK, MUTED } from "@/lib/tokens";

/** Gaps measured off design-watercolor/skin quiz/screens, at 393pt wide:
 *  Skip sits on the first row, the dots ~95pt below it, then the back arrow,
 *  then the question. */
const DOTS_TOP = 44;

type Props = {
  /** 1-based index into the quiz. */
  step: number;
  title: string;
  subtitle?: string;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /** False only on the quiz's first step, which the quiz's modal opens on
   *  (`lib/open-quiz.ts`, #346): there is no earlier step behind it, and
   *  Skip closes the quiz. Every later step is reached by push (see
   *  nextQuizRoute), so it has a real previous step to return to and keeps
   *  the arrow. */
  showBack?: boolean;
  children: ReactNode;
};

/**
 * One quiz step's content — progress dots, back arrow, question and answers —
 * on its own copy of the quiz background, so it can slide. Skip and the
 * Continue button belong to QuizFrame and stay put; this step hands its button
 * label, state and action to QuizFrame while it's the step showing.
 */
export function QuizScreen({
  step,
  title,
  subtitle,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  showBack = true,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const { setFooter, releaseFooter } = useQuizFrame();
  const window = useWindowDimensions();

  // Re-runs whenever the label, state or action changes while this step is
  // showing, and again when it becomes the one showing after Back.
  useFocusEffect(
    useCallback(() => {
      setFooter(nextLabel, nextDisabled, onNext);
      // Re-arms the button for this step: it's latched while a push is in
      // flight, and Back would otherwise return to a step whose button
      // never fires again.
      releaseFooter();
    }, [setFooter, releaseFooter, nextLabel, nextDisabled, onNext]),
  );

  // Each step draws the quiz background itself, sized to the whole window so it
  // lines up exactly with QuizFrame's copy behind the footer: steps now slide in
  // from the right like any iOS push (#313, owner decision), and a see-through
  // page sliding over another would show both questions at once.
  return (
    <View style={{ flex: 1 }}>
      <Image
        source={QUIZ_BACKGROUND}
        style={{ position: "absolute", top: 0, left: 0, width: window.width, height: window.height }}
        contentFit="cover"
        accessibilityLabel=""
      />
      {/* The quiz's own dots, one per step. The 3-screen intro before it
          draws its own 3 (OnboardingShell). */}
      <View style={{ marginTop: quizTopPadding(insets.top) + DOTS_TOP }}>
        <ProgressDots count={quizStepCount()} activeIndex={step - 1} />
      </View>

      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            marginLeft: 20,
            minHeight: 44,
            minWidth: 44,
            alignItems: "flex-start",
            justifyContent: "center",
          }}
          className="active:opacity-70"
        >
          <ArrowIcon direction="left" size={26} color={INK} />
        </Pressable>
      ) : (
        // Same-height empty spacer, not just omitted: dropping the row
        // entirely would pull this step's question title up ~44pt relative
        // to the other three screens, which all still show the arrow.
        <View style={{ minHeight: 44 }} />
      )}

      <View style={{ paddingHorizontal: 24, paddingTop: 6, gap: 8 }}>
        {/* Reserved box, not auto-height — see design/DESIGN_SYSTEM.md's
            fixed-height-text rule. A question can run one or two lines
            depending on its wording; without this the answers below would
            land at a different y per screen.
            minHeight, not height: 64pt holds two lines at 28pt, but a narrow
            screen (<=375pt) wraps the longest question onto a third, and a
            hard height clipped it. The reservation still aligns every screen
            that fits; only a screen that would otherwise be cut grows. */}
        <View style={{ minHeight: 64, justifyContent: "center" }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_600SemiBold",
              fontSize: 28,
              lineHeight: 28 * 1.12,
              letterSpacing: 28 * -0.015,
              color: INK,
            }}
          >
            {title}
          </Text>
        </View>
        {subtitle ? (
          <View style={{ minHeight: 34, justifyContent: "flex-start" }}>
            <Text style={{ fontSize: 15, lineHeight: 15 * 1.45, color: MUTED }}>{subtitle}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}
