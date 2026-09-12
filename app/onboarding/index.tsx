import { router } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, View } from "react-native";

import { OnboardingShell, type OnboardingScreenContent } from "@/components/shell/OnboardingShell";
import { quizRoutes } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

// Extracted from correctly-proportioned source art (real iPhone aspect, not
// the old 1:2.55 mockup phone) — full compositions with generous margin on
// every side, not tight cutouts. Downsized to ~1400px on the long edge from
// ~3400px originals before bundling; full-resolution source lives in
// design-watercolor/.
const ONB2_SCAN = require("@/assets/illustrations/onboarding/onb2-scan.png");
const ONB2_INGREDIENTS = require("@/assets/illustrations/onboarding/onb2-ingredients.png");
const ONB2_CONFIDENCE = require("@/assets/illustrations/onboarding/onb2-confidence.png");

const SCREENS: OnboardingScreenContent[] = [
  {
    headline: ["Scan any", "skincare product"],
    supportingCopy: ["Point your camera at a barcode", "or ingredient list."],
    buttonLabel: "Continue",
    illustrationSource: ONB2_SCAN,
  },
  {
    headline: ["Ingredients,", "made simple"],
    supportingCopy: ["See what the ingredients", "mean for your skin."],
    buttonLabel: "Continue",
    illustrationSource: ONB2_INGREDIENTS,
  },
  {
    headline: ["Choose with", "confidence"],
    supportingCopy: ["Discover products that fit", "your skin, goals and lifestyle."],
    buttonLabel: "Continue",
    illustrationSource: ONB2_CONFIDENCE,
  },
];

/**
 * Onboarding — the three-screen first-launch carousel, reskinned to the
 * FOR.ME watercolor design (design-watercolor/FOR_ME_Onboarding_Design_Spec.md).
 *
 * All chrome (wordmark, tagline, Skip, hero, dots, CTA) lives in
 * `OnboardingShell`, rendered ONCE for the whole flow — this file owns only
 * which screen is active, Android back, and where Continue/Skip lead. There
 * is deliberately no ScrollView/paging here any more: an earlier version
 * rendered one full `OnboardingShell` per screen side-by-side in a
 * horizontally-paged ScrollView, so tapping Continue animated the whole
 * page — including its own copy of the button — across the screen. Content
 * now just swaps via `activeIndex` inside one persistent shell instance.
 */
export default function Onboarding() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [index, setIndex] = useState(0);

  // Skipping the intro and finishing it both mean the same thing now: mark
  // onboarding seen, go to the quiz's first step. Skip used to jump straight
  // to the scanner, bypassing the quiz the user was never offered a choice
  // about — it now only skips the 3 intro screens it's attached to.
  //
  // replace, not push: onboarding is finished either way this is called, so
  // it has no business staying on the back stack. With push, Back from the
  // first quiz step returned to a completed onboarding screen with nothing
  // left to do on it.
  function goToQuiz() {
    completeOnboarding();
    router.replace(quizRoutes()[0]);
  }

  function onNext() {
    if (index === SCREENS.length - 1) {
      goToQuiz();
      return;
    }
    setIndex(index + 1);
  }

  // "Back from screen 2 or 3 should return to the previous screen, not exit
  // the flow" — Android's hardware back button is the one way to trigger
  // that outside the carousel's own UI. On screen 1 there's nothing to
  // intercept: falling through to the default behaviour is correct there.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (index === 0) return false;
      setIndex(index - 1);
      return true;
    });
    return () => sub.remove();
  }, [index]);

  return (
    <View style={{ flex: 1 }}>
      <OnboardingShell screens={SCREENS} activeIndex={index} onNext={onNext} onSkip={goToQuiz} />
    </View>
  );
}
