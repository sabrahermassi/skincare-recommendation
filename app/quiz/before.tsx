import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CloseCross, IconCircle } from "@/components/IconCircle";
import { FitScrollView } from "@/components/FitScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { quizTopPadding, useQuizFrame } from "@/components/QuizFrame";
import { Text } from "@/components/Text";
import { CONSENT_COPY } from "@/lib/consent-copy";
import { hasAnswers, quizRoutes } from "@/lib/profile";
import { noOrphan } from "@/lib/text";
import { CANVAS, DISPLAY_FONT, INK, LEADING, LINK, SPACE, TOUCH_TARGET, TRACKING, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * Shown once, before the first question (#471): what the quiz asks, what the
 * answers are for, where they stay, and the age line. It is not a step, so it
 * has no count and no progress line; the footer button belongs to QuizFrame as
 * on every step.
 *
 * Two ways in. A new person opens the quiz and lands here first: agreeing goes
 * on to question 1, Not now closes the quiz. Someone who already has answers
 * (from before this screen existed) is sent here once by the tabs: agreeing
 * records it and closes, Not now clears the answers, so there is no profile and
 * no score until they choose to take the quiz.
 */
export default function BeforeWeAsk() {
  const insets = useSafeAreaInsets();
  const { setFooter, releaseFooter, close } = useQuizFrame();
  const agreeToProfile = useAppStore((s) => s.agreeToProfile);
  const declineProfile = useAppStore((s) => s.declineProfile);

  const agree = useCallback(() => {
    // Read when pressed, not at render: this is about answers already on the phone.
    const hadAnswers = hasAnswers(useAppStore.getState().profile);
    agreeToProfile();
    // Replace, not push: the quiz's back arrow must close it, not return here.
    if (hadAnswers) close();
    else router.replace(quizRoutes()[0]);
  }, [agreeToProfile, close]);

  const notNow = () => {
    declineProfile();
    close();
  };

  useFocusEffect(
    useCallback(() => {
      setFooter(CONSENT_COPY.agree, false, agree);
      releaseFooter();
    }, [setFooter, releaseFooter, agree]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <View style={{ marginTop: quizTopPadding(insets.top), height: 44, paddingHorizontal: SPACE.gutter, flexDirection: "row", justifyContent: "flex-end" }}>
        <IconCircle onPress={close} accessibilityLabel="Close">
          <CloseCross />
        </IconCircle>
      </View>
      <FitScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.section, paddingBottom: SPACE.section, gap: SPACE.block }}
      >
        <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: LEADING.heading, letterSpacing: TRACKING.heading, color: INK, paddingBottom: SPACE.text }}>
          {noOrphan(CONSENT_COPY.title)}
        </Text>
        {CONSENT_COPY.lines.map((line) => (
          <Text key={line} style={{ fontSize: TYPE.body, lineHeight: LEADING.body, color: INK }}>
            {line}
          </Text>
        ))}
        <Pressable
          onPress={() => router.push("/privacy")}
          accessibilityRole="link"
          style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
          className="active:opacity-70"
        >
          <Text style={{ fontSize: TYPE.body, lineHeight: LEADING.body, fontWeight: "600", color: LINK }}>{CONSENT_COPY.privacyLink}</Text>
        </Pressable>
        <PrimaryButton variant="tertiary" label={CONSENT_COPY.notNow} onPress={notNow} />
      </FitScrollView>
    </View>
  );
}
