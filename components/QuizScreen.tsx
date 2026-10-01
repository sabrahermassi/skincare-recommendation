import { useFocusEffect } from "expo-router";
import { useCallback, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackChevron, CloseCross, IconCircle } from "@/components/IconCircle";
import { quizTopPadding, useQuizFrame } from "@/components/QuizFrame";
import { Text } from "@/components/Text";
import { goBackOrHome } from "@/lib/go-back";
import { quizStepCount } from "@/lib/profile";
import { BUTTON, CANVAS, DISPLAY_FONT, DIVIDER, INK, MUTED, SPACE, TYPE } from "@/lib/tokens";

type Props = {
  /** 1-based index into the quiz. */
  step: number;
  title: string;
  subtitle?: string;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /**
   * The quiz's closing moment (v9): the questions are done and `children` is
   * the "building" picture, not answers. The header drops its count and its
   * line, and `onBack` returns to the last question.
   */
  building?: boolean;
  onBack?: () => void;
  /** True only on the quiz's first step, which the quiz's modal opens on
   *  (`lib/open-quiz.ts`, #346): there is no earlier step behind it, so its
   *  back arrow closes the quiz instead (v9 shows it on every step). */
  first?: boolean;
  children: ReactNode;
};

/**
 * One quiz step's content (v9) — back, the question count and close, the
 * progress line, the question, and its answers — on its own painted page, so
 * it can slide. The Next button belongs to QuizFrame and stays put; this step hands its button
 * label, state and action to QuizFrame while it's the step showing.
 */
export function QuizScreen({
  step,
  title,
  subtitle,
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  building = false,
  onBack,
  first = false,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const { setFooter, releaseFooter, close } = useQuizFrame();

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

  // Each step paints the page colour itself: steps slide in from the right
  // like any iOS push (#313, owner decision), and a see-through page sliding
  // over another would show both questions at once.
  const total = quizStepCount();
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      {/* The top row (v9): back, "Question 2 of 4", and close, over a thin
          line that fills as the quiz goes. On the first step there is no step
          behind it, so back closes the quiz, like the close button. While the
          profile is "building" the count and the line are gone. */}
      <View style={{ marginTop: quizTopPadding(insets.top), height: 44, paddingHorizontal: SPACE.gutter, flexDirection: "row", alignItems: "center", gap: SPACE.block }}>
        <IconCircle onPress={onBack ?? (first ? close : goBackOrHome)} accessibilityLabel="Back">
          <BackChevron />
        </IconCircle>
        <Text style={{ flex: 1, textAlign: "center", fontSize: TYPE.card, fontWeight: "600", color: INK }}>{building ? "" : `Question ${step} of ${total}`}</Text>
        <IconCircle onPress={close} accessibilityLabel="Close">
          <CloseCross />
        </IconCircle>
      </View>
      {/* No line while the profile is "building": that screen has its own bar (owner). */}
      {building ? null : (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${step} of ${total}`}
          style={{ marginTop: SPACE.block, height: 2, backgroundColor: DIVIDER }}
        >
          <View style={{ height: 2, width: `${Math.round((step / total) * 100)}%`, backgroundColor: BUTTON.primary.fill }} />
        </View>
      )}

      {building ? (
        children
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.section, paddingBottom: SPACE.section }}
          alwaysBounceVertical={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", gap: SPACE.text, paddingHorizontal: SPACE.text, paddingBottom: SPACE.section }}>
            <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
              {title}
            </Text>
            {subtitle ? <Text style={{ maxWidth: 320, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{subtitle}</Text> : null}
          </View>
          {children}
        </ScrollView>
      )}
    </View>
  );
}
