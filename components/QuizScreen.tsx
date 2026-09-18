import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { quizTopPadding, useQuizFrame } from "@/components/QuizFrame";
import { Text } from "@/components/Text";
import { ProgressDots } from "@/components/shell/shared";
import { ONBOARDING_INTRO_SCREEN_COUNT, TOTAL_ONBOARDING_STEPS } from "@/lib/profile";
import { INK, MUTED } from "@/lib/tokens";

// How long a step's content takes to fade in when it becomes the one showing.
const CONTENT_FADE_MS = 200;
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
  /** False only on the quiz's first step. Onboarding's Skip/Continue lands
   *  here via router.replace (see app/onboarding/index.tsx and QuizFrame's
   *  skipQuiz), not push, specifically so a finished onboarding screen never
   *  sits on the back stack — which means the first quiz step has nothing
   *  behind it. router.back() there threw, since there was nothing to pop.
   *  Every later step is reached by push (see nextQuizRoute), so it does
   *  have a real previous step to return to and keeps the arrow. */
  showBack?: boolean;
  children: ReactNode;
};

/**
 * One quiz step's content — progress dots, back arrow, question and answers —
 * on a see-through page. The background, the hand-lettered lines, Skip and the
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
  const [opacity] = useState(() => new Animated.Value(0));

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

  // Steps switch with no slide (a see-through page sliding over another
  // would show both questions at once), so the content fades in instead.
  //
  // Skipped entirely when the system asks for reduced motion. The fade is
  // decorative — it conveys nothing the layout does not — so the honest
  // response to that setting is no animation at all rather than a shorter
  // one. Onboarding is also the first thing anyone sees, which makes it the
  // worst place to ignore the preference. Checked on each focus rather than
  // once at mount: the setting can change while the app is open.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      opacity.setValue(0);

      AccessibilityInfo.isReduceMotionEnabled()
        .catch(() => false)
        .then((reduced) => {
          if (cancelled) return;
          if (reduced) {
            opacity.setValue(1);
            return;
          }
          Animated.timing(opacity, {
            toValue: 1,
            duration: CONTENT_FADE_MS,
            useNativeDriver: Platform.OS !== "web",
          }).start();
        });

      return () => {
        cancelled = true;
      };
    }, [opacity]),
  );

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      {/* Part of the same rail the intro's 3 dots draw (see
          lib/profile.ts's TOTAL_ONBOARDING_STEPS) rather than a fresh 4-dot
          sequence of its own — finishing the intro used to look like
          finishing onboarding, right before a second countdown started. */}
      <View style={{ marginTop: quizTopPadding(insets.top) + DOTS_TOP }}>
        <ProgressDots
          count={TOTAL_ONBOARDING_STEPS}
          activeIndex={ONBOARDING_INTRO_SCREEN_COUNT + step - 1}
        />
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
        >
          <Ionicons name="chevron-back" size={24} color={INK} />
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
    </Animated.View>
  );
}
