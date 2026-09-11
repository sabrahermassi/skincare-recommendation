import { Ionicons } from "@expo/vector-icons";
import { Image, type ImageSource } from "expo-image";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Text";
import { POST_ONBOARDING_ROUTE, quizStepCount } from "@/lib/profile";
import { CANVAS, CTA, CTA_PRESSED, DOT_INACTIVE, INK, MUTED } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

type Props = {
  /** 1-based index into the quiz. */
  step: number;
  title: string;
  subtitle?: string;
  /**
   * A small companion illustration beside the question, from the same set
   * as the profile avatar — makes each step visually distinct rather than
   * four back-to-back walls of chips. Deliberately optional and small: this
   * is a supporting detail next to the headline, not a hero image, and the
   * headline's fixed-height box is unchanged so nothing shifts between
   * illustrated and non-illustrated steps.
   */
  illustration?: ImageSource;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  children: ReactNode;
};

/**
 * The Manassa-system quiz shell — see design/DESIGN_SYSTEM.md's "Quiz
 * skeleton" section. Replaces `components/QuizStep.tsx`'s purple styling and
 * `StepProgress`'s numbered-circle rail (swapped for the onboarding
 * carousel's dot pattern) for the four quiz screens. Fixed header + scrolling
 * body + fixed footer, not the carousel's elastic spacers — a chip grid can
 * run longer than one screen on a small device, which an elastic-spacer
 * layout has no room to accommodate.
 */
export function QuizScreen({
  step,
  title,
  subtitle,
  illustration,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const totalSteps = quizStepCount();
  const [pressed, setPressed] = useState(false);
  const [skipPressed, setSkipPressed] = useState(false);
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  // Skip the quiz, not the app: lands on the scanner exactly like finishing
  // the quiz normally would, just without answering the remaining
  // questions — same "no profile is a fully supported state" reasoning the
  // onboarding intro's own Skip uses. Added once here, in the shared shell,
  // so all 4 quiz steps get it without a new prop to thread through each one.
  function skipQuiz() {
    completeOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: Math.max(20, insets.top + 10),
          paddingHorizontal: 24,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ minHeight: 44, minWidth: 44, alignItems: "flex-start", justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={22} color={INK} />
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          {steps.map((s) => (
            <View
              key={s}
              style={
                s === step
                  ? { width: 20, height: 6, borderRadius: 3, backgroundColor: INK }
                  : { width: 6, height: 6, borderRadius: 6, backgroundColor: DOT_INACTIVE }
              }
            />
          ))}
        </View>

        <Pressable
          onPress={skipQuiz}
          onPressIn={() => setSkipPressed(true)}
          onPressOut={() => setSkipPressed(false)}
          hitSlop={10}
          accessibilityRole="button"
          style={{
            minHeight: 44,
            minWidth: 44,
            alignItems: "flex-end",
            justifyContent: "center",
            opacity: skipPressed ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 14, color: MUTED }}>Skip</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 26, flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <View style={{ flex: 1, gap: 8 }}>
          {/* Fixed box, not auto-height — see design/DESIGN_SYSTEM.md's
              fixed-height-text rule. A quiz question can run one or two lines
              depending on its wording; without this the content below would
              land at a different y per screen. */}
          <View style={{ height: 70, justifyContent: "center" }}>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 26,
                lineHeight: 26 * 1.15,
                letterSpacing: 26 * -0.018,
                color: INK,
              }}
            >
              {title}
            </Text>
          </View>
          {subtitle ? (
            <View style={{ height: 44, justifyContent: "flex-start" }}>
              <Text style={{ fontSize: 14.5, fontWeight: "400", lineHeight: 14.5 * 1.5, color: MUTED }}>
                {subtitle}
              </Text>
            </View>
          ) : null}
        </View>

        {illustration ? (
          <Image
            source={illustration}
            style={{ width: 60, height: 60, borderRadius: 30, marginTop: 4 }}
            contentFit="cover"
            transition={120}
          />
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(32, insets.bottom + 16) }}>
        <Pressable
          onPress={onNext}
          disabled={nextDisabled}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          accessibilityRole="button"
          style={{
            minHeight: 52,
            borderRadius: 26,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: nextDisabled ? DOT_INACTIVE : pressed ? CTA_PRESSED : CTA,
            // See design/DESIGN_SYSTEM.md's Buttons section — the shadow is
            // load-bearing for the peach fill's low contrast, not decoration.
            // Dropped when disabled: a de-emphasised control shouldn't also
            // read as "raised and ready to tap".
            shadowColor: INK,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: nextDisabled ? 0 : 0.13,
            shadowRadius: 12,
            elevation: nextDisabled ? 0 : 6,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "500", color: nextDisabled ? MUTED : INK }}>
            {nextLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
