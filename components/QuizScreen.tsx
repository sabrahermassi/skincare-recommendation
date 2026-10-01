import { router, useFocusEffect } from "expo-router";
import { useCallback, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackChevron, CloseCross, IconCircle } from "@/components/IconCircle";
import { PageTitle } from "@/components/PageTitle";
import { quizTopPadding, useQuizFrame } from "@/components/QuizFrame";
import { quizStepCount } from "@/lib/profile";
import { BUTTON, CANVAS, DOT_OFF, SPACE } from "@/lib/tokens";

type Props = {
  /** 1-based index into the quiz. */
  step: number;
  title: string;
  subtitle?: string;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /** A count drawn over the footer button (v9: concerns' "2 of 3 chosen"). */
  counter?: string;
  /** True only on the quiz's first step, which the quiz's modal opens on
   *  (`lib/open-quiz.ts`, #346): there is no earlier step behind it, so its
   *  back arrow closes the quiz instead (v9 shows it on every step). */
  first?: boolean;
  children: ReactNode;
};

/**
 * One quiz step's content (v9) — back, progress bars and close, the
 * question, and its answers — on its own painted page, so it can slide. The
 * Continue button belongs to QuizFrame and stay put; this step hands its button
 * label, state and action to QuizFrame while it's the step showing.
 */
export function QuizScreen({
  step,
  title,
  subtitle,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  counter,
  first = false,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const { setFooter, releaseFooter, close } = useQuizFrame();

  // Re-runs whenever the label, state or action changes while this step is
  // showing, and again when it becomes the one showing after Back.
  useFocusEffect(
    useCallback(() => {
      setFooter(nextLabel, nextDisabled, onNext, counter);
      // Re-arms the button for this step: it's latched while a push is in
      // flight, and Back would otherwise return to a step whose button
      // never fires again.
      releaseFooter();
    }, [setFooter, releaseFooter, nextLabel, nextDisabled, onNext, counter]),
  );

  // Each step paints the page colour itself: steps slide in from the right
  // like any iOS push (#313, owner decision), and a see-through page sliding
  // over another would show both questions at once.
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      {/* The top row (v9): back, one bar per step (sage up to this one), and
          close. On the first step there is no step behind it, so back closes
          the quiz, like the close button. */}
      <View style={{ marginTop: quizTopPadding(insets.top), height: 44, paddingHorizontal: SPACE.gutter, flexDirection: "row", alignItems: "center", gap: SPACE.block }}>
        <IconCircle onPress={first ? close : () => router.back()} accessibilityLabel="Back">
          <BackChevron />
        </IconCircle>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${step} of ${quizStepCount()}`}
          style={{ flex: 1, flexDirection: "row", gap: SPACE.text }}
        >
          {Array.from({ length: quizStepCount() }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 5, borderRadius: 2.5, backgroundColor: i < step ? BUTTON.primary.fill : DOT_OFF }} />
          ))}
        </View>
        <IconCircle onPress={close} accessibilityLabel="Close">
          <CloseCross />
        </IconCircle>
      </View>

      <View style={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.gutter }}>
        <PageTitle title={title} line={subtitle} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.gutter, paddingBottom: SPACE.section }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}
