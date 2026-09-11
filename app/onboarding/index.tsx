import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  BackHandler,
  Dimensions,
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Text";

import { POST_ONBOARDING_ROUTE, quizRoutes } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { CANVAS, CTA, CTA_PRESSED, DOT_INACTIVE, INK, MUTED } from "@/lib/tokens";

const ONB_SCAN = require("@/assets/illustrations/onboarding/onb-scan.png");
const ONB_THINK = require("@/assets/illustrations/onboarding/onb-think.png");
const ONB_FACE = require("@/assets/illustrations/onboarding/onb-face.png");

// Measured from the actual files, not the handoff's rounded ~650×1050 /
// ~920×1045 — see design_handoff_manassa_onboarding_3/README.md's Assets
// section for why these three can't share one sizing rule.
const SCAN_ASPECT = 637 / 541;
const THINK_ASPECT = 766 / 1228;
const FACE_ASPECT = 927 / 1056;

type ScreenContent = {
  headline: string;
  copy: string;
  buttonLabel: string;
  illustration: () => ReactElement;
};

const SCREENS: ScreenContent[] = [
  {
    headline: "Scan any product",
    copy: "Point your camera at a barcode or ingredient list",
    buttonLabel: "Next",
    illustration: () => (
      // Sized by width, not height — at 400px wide it deliberately bleeds
      // ~12px past the frame on each side (the block below clips it), which
      // is what lets the figure read at a comparable size to screens 2 and 3
      // without cutting her hair or the dropper bottle. See the handoff's
      // Assets section — this is the one most likely to get "fixed" wrong.
      <Image
        source={ONB_SCAN}
        style={{ width: 400, aspectRatio: SCAN_ASPECT }}
        contentFit="contain"
        accessibilityLabel=""
      />
    ),
  },
  {
    headline: "We check every ingredient",
    copy: "Matched against your skin profile",
    buttonLabel: "Next",
    illustration: () => (
      <Image
        source={ONB_THINK}
        style={{ height: 404, maxWidth: 375, aspectRatio: THINK_ASPECT }}
        contentFit="contain"
        accessibilityLabel=""
      />
    ),
  },
  {
    headline: "Know what suits you",
    copy: "Clear answers in seconds, wherever you’re shopping",
    buttonLabel: "Get started",
    illustration: () => (
      <Image
        source={ONB_FACE}
        style={{ height: 404, maxWidth: 375, aspectRatio: FACE_ASPECT }}
        contentFit="contain"
        accessibilityLabel=""
      />
    ),
  },
];

/**
 * Onboarding — the three-screen first-launch carousel, from
 * `design_handoff_manassa_onboarding_3` (`onboarding.html`). Replaces the
 * earlier single-screen Welcome.
 *
 * All three screens share one layout (`Page` below); only the illustration,
 * the two copy lines, the active dot and the button label differ. Two things
 * from the handoff are load-bearing, not styling flourish:
 *
 * - The headline (68px) and supporting-copy (44px) boxes are fixed height.
 *   Screen 2's headline and screen 3's copy each wrap to two lines while the
 *   other screens' don't — with auto height, the dots and button would land
 *   at a different y per screen and visibly jump while swiping.
 * - The two spacers are weighted 1.9 : 1 (not equal), so the air above the
 *   text group is roughly double the air below it.
 *
 * `hasSeenOnboarding` (via `completeOnboarding`) is set on both `Get
 * started` and `Skip` — same destination either way: the quiz, always. This
 * used to branch on whether the profile already had answers, so `Skip` sent
 * an answered profile straight to the scanner — which broke the moment
 * "Retake the quiz" on the profile screen became the only way back into this
 * carousel, since retaking the quiz is exactly the case where the profile is
 * already answered. Which screen a mid-carousel exit leaves on is not persisted (`onboardingIndex` in the
 * handoff's own State Management section is just what drives the dots here,
 * as local state) — restarting the carousel from screen 1 on a relaunch
 * before it's been completed is an entirely reasonable outcome, and
 * `store/useAppStore.ts` is the one file allowed to touch device storage
 * (see `docs/device-storage-policy.md`), so this doesn't add a second,
 * screen-local key to approximate it.
 */
export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [pageWidth, setPageWidth] = useState(Dimensions.get("window").width);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function onLayout(e: LayoutChangeEvent) {
    setPageWidth(e.nativeEvent.layout.width);
  }

  function onMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
  }

  function goTo(i: number) {
    scrollRef.current?.scrollTo({ x: i * pageWidth, animated: true });
    setIndex(i);
  }

  function finish() {
    completeOnboarding();
    // "Get started" only - completing the carousel intentionally leads into
    // the quiz. This used to also be Skip's destination, branching on
    // `isPersonalized(profile)` to send an already-answered profile straight
    // to the scanner. That reads sensibly until you notice the only way to
    // re-enter this carousel is "Retake the quiz" on the profile screen -
    // which left you skipping past the very quiz you asked to retake, back
    // to where you started. A first run has an empty profile and lands on
    // the quiz either way, so the branch never bought anything it did not
    // also break.
    router.push(quizRoutes()[0]);
  }

  // Skip means skip - straight to the scanner, not a detour through four
  // more mandatory screens. The rest of the app already treats "no profile"
  // as a fully supported state (browse's `isPersonalized` branch, the
  // "Answer four quick questions" banner it shows there), so there is
  // nothing the quiz provides that Skip needs to force.
  function skipToApp() {
    completeOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  // "Back from screen 2 or 3 should return to the previous screen, not exit
  // the flow" — Android's hardware back button is the one way to trigger
  // that outside the carousel's own UI. On screen 1 there's nothing to
  // intercept: falling through to the default behaviour is correct there.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (index === 0) return false;
      goTo(index - 1);
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pageWidth]);

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }} onLayout={onLayout}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
      >
        {SCREENS.map((screen, i) => (
          <Page
            key={screen.headline}
            width={pageWidth}
            insets={insets}
            screen={screen}
            activeIndex={i}
            onNext={() => (i === SCREENS.length - 1 ? finish() : goTo(i + 1))}
            onSkip={skipToApp}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Page({
  width,
  insets,
  screen,
  activeIndex,
  onNext,
  onSkip,
}: {
  width: number;
  insets: { top: number; bottom: number };
  screen: ScreenContent;
  activeIndex: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [nextPressed, setNextPressed] = useState(false);
  const [skipPressed, setSkipPressed] = useState(false);

  return (
    <View style={{ width, flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingTop: Math.max(54, insets.top + 16),
          paddingHorizontal: 16,
        }}
      >
        <Pressable
          onPress={onSkip}
          onPressIn={() => setSkipPressed(true)}
          onPressOut={() => setSkipPressed(false)}
          accessibilityRole="button"
          style={{
            minHeight: 44,
            minWidth: 56,
            alignItems: "center",
            justifyContent: "center",
            opacity: skipPressed ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: "500", color: MUTED }}>Skip</Text>
        </Pressable>
      </View>

      {/* Fixed 430 regardless of which illustration it holds — see the
          handoff's "Do not simplify these" #3. Only screen 1 needs the clip:
          it's the one sized by width, deliberately bleeding past the frame. */}
      <View
        style={{
          height: 430,
          alignItems: "center",
          justifyContent: "center",
          overflow: activeIndex === 0 ? "hidden" : "visible",
        }}
      >
        {screen.illustration()}
      </View>

      <View style={{ flex: 1.9, minHeight: 18 }} />

      <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 22 }}>
        {/* Explicit width, not the parent's alignItems:"center" shrink-wrap
            — screen 2's headline and screen 3's copy must wrap to two lines
            to fit these fixed-height boxes, and a box with no width of its
            own is not a reliable way to guarantee that wrap happens at the
            same point CSS's version does. */}
        <View style={{ height: 68, width: width - 44, justifyContent: "center" }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 30,
              lineHeight: 30 * 1.08,
              letterSpacing: 30 * -0.018,
              color: INK,
              textAlign: "center",
            }}
          >
            {screen.headline}
          </Text>
        </View>
        <View style={{ height: 44, width: width - 44, justifyContent: "flex-start" }}>
          <Text
            style={{
              fontSize: 14.5,
              fontWeight: "400",
              lineHeight: 14.5 * 1.5,
              color: MUTED,
              textAlign: "center",
            }}
          >
            {screen.copy}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          {SCREENS.map((s, i) => (
            <View
              key={s.headline}
              style={
                i === activeIndex
                  ? { width: 20, height: 6, borderRadius: 3, backgroundColor: INK }
                  : { width: 6, height: 6, borderRadius: 6, backgroundColor: DOT_INACTIVE }
              }
            />
          ))}
        </View>
      </View>

      <View style={{ flex: 1, minHeight: 12 }} />

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(32, insets.bottom + 16) }}>
        <Pressable
          onPress={onNext}
          onPressIn={() => setNextPressed(true)}
          onPressOut={() => setNextPressed(false)}
          accessibilityRole="button"
          style={{
            minHeight: 52,
            paddingHorizontal: 20,
            borderRadius: 26,
            backgroundColor: nextPressed ? CTA_PRESSED : CTA,
            alignItems: "center",
            justifyContent: "center",
            // The fill is only 1.51:1 against the canvas (no border, per
            // spec) — this shadow is the one thing separating the CTA from
            // the page. Do not remove it. Android has no colour-matched
            // shadow API via plain elevation; it still reads as "raised".
            shadowColor: INK,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.13,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "500", color: INK }}>{screen.buttonLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
