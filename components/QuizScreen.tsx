import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { quizTopPadding, useQuizFrame } from "@/components/QuizFrame";
import { Text } from "@/components/Text";
import { TERRACOTTA } from "@/components/shell/shared";
import { quizStepCount } from "@/lib/profile";
import { DOT_INACTIVE, INK, MUTED } from "@/lib/tokens";

// How long a step's content takes to fade in when it becomes the one showing.
const CONTENT_FADE_MS = 200;
/** Gaps measured off design-watercolor/skin quiz/screens, at 393pt wide:
 *  Skip sits on the first row, the dots ~95pt below it, then the back arrow,
 *  then the question. */
const DOTS_TOP = 44;
const DOT_SIZE = 12;

type Props = {
  /** 1-based index into the quiz. */
  step: number;
  title: string;
  subtitle?: string;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
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
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const { setFooter, releaseFooter } = useQuizFrame();
  const [opacity] = useState(() => new Animated.Value(0));
  const steps = Array.from({ length: quizStepCount() }, (_, i) => i + 1);

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
  useFocusEffect(
    useCallback(() => {
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: CONTENT_FADE_MS,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    }, [opacity]),
  );

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      <View
        style={{
          marginTop: quizTopPadding(insets.top) + DOTS_TOP,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        {steps.map((s) => (
          <View
            key={s}
            style={{
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: DOT_SIZE / 2,
              backgroundColor: s === step ? TERRACOTTA : DOT_INACTIVE,
            }}
          />
        ))}
      </View>

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
