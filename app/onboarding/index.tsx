import { router } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnboardingShell, type OnboardingScreenContent } from "@/components/shell/OnboardingShell";
import { Text } from "@/components/Text";
import { TERRACOTTA } from "@/components/shell/shared";
import { clearProfileErasedNotice, profileErasedNoticePending } from "@/lib/erase-notice";
import { POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { CANVAS, FLOATING_SHADOW, INK } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// Watercolor heroes, one per screen, each with its own handwritten line
// ("let's take a look", "what's really in here?", "this one's for me") and
// transparent margins, so they sit on the canvas without a box.
const HERO_SCAN = require("@/assets/illustrations/onboarding/hero-scan.webp");
const HERO_INGREDIENTS = require("@/assets/illustrations/onboarding/hero-ingredients.webp");
const HERO_FOR_ME = require("@/assets/illustrations/onboarding/hero-for-me.webp");

const SCREENS: OnboardingScreenContent[] = [
  {
    headline: ["Scan any", "skincare product"],
    supportingCopy: ["Point your camera at a barcode", "or ingredient list."],
    buttonLabel: "Continue",
    illustrationSource: HERO_SCAN,
  },
  {
    headline: ["Ingredients,", "made simple"],
    supportingCopy: ["See what the ingredients", "mean for your skin."],
    buttonLabel: "Continue",
    illustrationSource: HERO_INGREDIENTS,
  },
  {
    headline: ["Choose with", "confidence"],
    supportingCopy: ["Discover products that fit", "your skin, goals and lifestyle."],
    // Lands on Home now, not the quiz (#346), so it no longer promises one.
    buttonLabel: "Get started",
    illustrationSource: HERO_FOR_ME,
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
  const insets = useSafeAreaInsets();

  // Profile's "Erase my profile" confirm lands here (a wiped profile has
  // nothing left to do but re-onboard). Landing on a fresh
  // onboarding screen is itself proof the wipe worked, but a silent
  // redirect with no acknowledgment at all still reads as "did that
  // actually do anything?" for a second — this brief toast closes that gap
  // without needing a toast library this app doesn't otherwise have.
  //
  // The erase leaves a note in memory (`lib/erase-notice.ts`), never a URL
  // parameter a link could set (#29). Read on mount, cleared once shown.
  const [showErasedToast, setShowErasedToast] = useState(profileErasedNoticePending);
  useEffect(() => clearProfileErasedNotice(), []);
  useEffect(() => {
    if (!showErasedToast) return;
    const timer = setTimeout(() => setShowErasedToast(false), 3000);
    return () => clearTimeout(timer);
  }, [showErasedToast]);

  // Skipping the intro and finishing it mean the same thing: mark onboarding
  // seen and go Home. Scan first, quiz later (#346): the skin questions are
  // asked when someone taps for a personal match, not before they have seen
  // anything.
  //
  // replace, not push: onboarding is finished either way this is called, so
  // it has no business staying on the back stack.
  function finishIntro() {
    completeOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  function onNext() {
    if (index === SCREENS.length - 1) {
      finishIntro();
      return;
    }
    setIndex(index + 1);
  }

  // "Back from screen 2 or 3 should return to the previous screen, not exit
  // the flow" — the shell's Back arrow on iOS, and Android's hardware back
  // too. On screen 1 there's nothing to intercept: falling through to the
  // default behaviour is correct there.
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
      <OnboardingShell
        screens={SCREENS}
        activeIndex={index}
        onNext={onNext}
        onSkip={finishIntro}
        onBack={index > 0 ? () => setIndex(index - 1) : undefined}
      />

      {/* First screen only: from the second on, Back sits where the toast would. */}
      {showErasedToast && index === 0 && (
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          // Stops short of Skip instead of spanning the full width. Skip sits
          // at H_PADDING (24) from the right with a 44pt minimum target, so
          // the box ends clear of it — someone who just erased their profile
          // is on their way somewhere, and the confirmation must not stand in
          // the doorway for its full 3s. Deliberately NOT `pointerEvents:
          // "none"`: the geometry is what keeps Skip tappable, and that prop
          // takes the toast out of the accessibility tree on iOS, where
          // `accessibilityLiveRegion` does nothing and being focusable is the
          // only way this text reaches VoiceOver.
          style={{
            position: "absolute",
            left: 20,
            right: 80,
            top: insets.top + 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 12,
            // The page's own cream, so the box sits flush on it.
            backgroundColor: CANVAS,
            borderWidth: 1,
            borderColor: TERRACOTTA,
            ...FLOATING_SHADOW,
          }}
        >
          <View
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: TERRACOTTA,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "700", color: CANVAS }}>✓</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>Your profile is erased</Text>
        </View>
      )}
    </View>
  );
}
