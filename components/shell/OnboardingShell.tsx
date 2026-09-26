import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Text";
import { slideDirection } from "@/lib/onboarding-slide";
import { H_PADDING, INTRO, INTRO_INACTIVE_DOT_OPACITY, ProgressDots, ShellBackButton, SkipButton } from "@/components/shell/shared";
import { CANVAS } from "@/lib/tokens";

// The intro's type (owner, 26 September 2026): a Playfair headline whose first
// line is in the accent colour and the rest in ink; system-font subtext; a
// flat pill button.
const HEADLINE_FONT = "PlayfairDisplay_500Medium";
const HEADLINE_SIZE = 29;
const BODY_SIZE = 16;
const SKIP_SIZE = 15;
const BUTTON_LABEL_SIZE = 17;
const BUTTON_HEIGHT = 56;

/**
 * Percentage-of-screen-height positions, measured directly off the approved
 * reference screenshot (390×844, real iPhone proportions ≈1:2.167) — not
 * flex flow, not an approximation. These are relative to the raw window
 * height, not a safe-area-reduced content height: the dots band's own
 * height (87.4–88.8%, 1.4% of 844 ≈ 11.8pt) was originally sized against
 * `ProgressDots`' dot size before that shrank to 7.2px — the match no
 * longer holds exactly, but the underlying point (these percentages
 * already have the reference screenshot's own safe-area margins baked in)
 * still does.
 *
 * Every element below is positioned from this table, independently — that's
 * what makes it identical across all three screens regardless of how much
 * text any one of them carries above or below it, rather than relying on
 * flex flow to keep things from drifting.
 */
const BANDS = {
  // The wordmark/heart lockup that used to anchor this band is gone —
  // branding no longer lives on onboarding at all. Skip moved up into the
  // space that freed (was 10.4/15.8, matched to the old wordmark's own
  // top), and the illustration was given the rest of it (was 21.9/66.0)
  // rather than leaving a bare gap at the top of every screen.
  skip: { top: 6.0, bottom: 11.4 },
  illustration: { top: 13.0, bottom: 66.0 },
  // The headline is two lines at 29pt now, and the subtext wraps to two lines,
  // so the headline gives the copy some of its old room.
  headline: { top: 68.8, bottom: 77.0 },
  copy: { top: 77.8, bottom: 85.8 },
  dots: { top: 87.4, bottom: 88.8 },
  button: { top: 90.5, bottom: 96.0 },
} as const;

function pct(n: number) {
  return `${n}%` as const;
}

function bandHeight(band: { top: number; bottom: number }) {
  return pct(band.bottom - band.top);
}

/**
 * Caps how far accessibility text scaling can stretch the headline and
 * supporting-copy regions — not a ban on scaling, a ceiling on it.
 *
 * Those two regions sit in `BANDS`' fixed-percentage boxes, which is what
 * keeps all three screens pixel-identical after everything measured against
 * the reference art today — a genuine reflow (letting the boxes grow) means
 * redesigning that system, not a two-line fix. These three screens are also
 * the one place in the app where that trade-off is reasonable: seen once,
 * always skippable via Skip, with generous base sizes already (44px
 * headline, 17px body) — nothing past this screen (the quiz, the product
 * detail, ingredient lists) is capped like this.
 *
 * 1.3 was picked as the largest multiplier that still fits two wrapped
 * lines inside the headline/copy bands at 375pt width without visibly
 * colliding with their neighbours — verified against the longest line in
 * `app/onboarding/index.tsx`'s SCREENS ("We analyse the ingredients and
 * explain what they mean for your skin" reflowed). It is a real, meaningful
 * increase for a "Larger Text" setting, just not RN's full ~3x accessibility
 * range, which this fixed layout cannot survive.
 */
const MAX_FONT_SCALE = 1.3;

// Moving between screens: the pictures stay where they are and cross-fade, while
// the words slide out one way and the next ones slide in from the other. The
// cross-fade lasts as long as the words take, so the new picture is arriving as
// the new words do. Skip, the dots and the button stay put — animating the whole
// page is what this shell used to get wrong.
const SLIDE_OFFSET = 48;
const SLIDE_OUT_MS = 150;
const SLIDE_IN_MS = 250;
const PICTURE_FADE_MS = SLIDE_OUT_MS + SLIDE_IN_MS;

export type OnboardingScreenContent = {
  /** Explicit line breaks, not auto-wrap — up to 2 lines; the headline band
   *  reserves the same height whether 1 or 2 lines are passed. */
  headline: string[];
  /** One sentence; the screen wraps it (up to 2 lines). */
  supportingCopy: string;
  buttonLabel: string;
  illustrationSource: number;
};

type OnboardingShellProps = {
  screens: OnboardingScreenContent[];
  /** 0-based index into `screens` of the screen currently showing. */
  activeIndex: number;
  onNext: () => void;
  onSkip: () => void;
  /** Absent on the first screen, which has nothing to go back to. */
  onBack?: () => void;
};

/**
 * Owns the entire onboarding flow's chrome — Skip, the hero/headline/copy
 * content, dots, and the CTA — as ONE persistent tree,
 * not one instance per screen. Only the hero/headline/copy region reads
 * `screens[activeIndex]` and re-renders in place when it changes; the
 * header and footer (dots + button) are written unconditionally, so they
 * are never inside anything that mounts per-screen and can never visibly
 * shift or remount when `activeIndex` changes — that used to be a real bug
 * here: an earlier version rendered a full `OnboardingShell` per screen
 * inside a horizontally-paged ScrollView, so navigating animated the whole
 * page (button included) across the screen as part of the transition.
 */
export function OnboardingShell({ screens, activeIndex, onNext, onSkip, onBack }: OnboardingShellProps) {
  // `shownIndex` trails `activeIndex` by the slide-out: the content on screen is
  // the old screen's until it has faded away, and only then swaps to the new one.
  const [shownIndex, setShownIndex] = useState(activeIndex);
  const screen = screens[shownIndex];
  // The button and dots answer the tap at once; only the content transitions.
  const buttonLabel = screens[activeIndex].buttonLabel;

  const previousIndex = useRef(activeIndex);
  const [opacity] = useState(() => new Animated.Value(1));
  const [translateX] = useState(() => new Animated.Value(0));
  // One opacity per picture: they sit on top of each other and cross-fade.
  const [pictureOpacity] = useState(() => screens.map((_, i) => new Animated.Value(i === activeIndex ? 1 : 0)));
  // `null` until the phone has answered, and treated as "reduce" until then, so no
  // slide plays on a guess.
  const reduceMotion = useRef<boolean | null>(null);

  // With Reduce Motion on, the swap still happens through the same path but with
  // zero-length animations, so there is no slide and no separate code path.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reduceMotion.current = enabled;
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      reduceMotion.current = enabled;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (activeIndex === previousIndex.current) return;
    const direction = slideDirection(previousIndex.current, activeIndex);
    previousIndex.current = activeIndex;

    const useNativeDriver = Platform.OS !== "web";
    const reduced = reduceMotion.current !== false;
    const outMs = reduced ? 0 : SLIDE_OUT_MS;
    const inMs = reduced ? 0 : SLIDE_IN_MS;

    const pictures = Animated.parallel(
      pictureOpacity.map((value, i) =>
        Animated.timing(value, {
          toValue: i === activeIndex ? 1 : 0,
          duration: reduced ? 0 : PICTURE_FADE_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver,
        })
      )
    );
    pictures.start();

    const slideOut = Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: outMs, useNativeDriver }),
      Animated.timing(translateX, { toValue: -direction * SLIDE_OFFSET, duration: outMs, useNativeDriver }),
    ]);
    slideOut.start(({ finished }) => {
      if (!finished) return;
      setShownIndex(activeIndex);
      translateX.setValue(direction * SLIDE_OFFSET);
      // One frame for the new content to commit before it starts fading in,
      // so the old screen never flashes back at partial opacity. If another tap
      // moved on in that frame, this run is stale: skip it, or its fade-in
      // would cancel the newer slide-out and strand the wrong screen.
      requestAnimationFrame(() => {
        if (previousIndex.current !== activeIndex) return;
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: inMs, useNativeDriver }),
          Animated.timing(translateX, { toValue: 0, duration: inMs, useNativeDriver }),
        ]).start();
      });
    });
    return () => {
      slideOut.stop();
      pictures.stop();
    };
  }, [activeIndex, opacity, translateX, pictureOpacity]);

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      {/* The pictures: they do not move, they cross-fade. Decorative, so out of
          the way of touches and the accessibility tree alike. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View
          style={{
            position: "absolute",
            top: pct(BANDS.illustration.top),
            height: bandHeight(BANDS.illustration),
            left: 0,
            right: 0,
          }}
        >
          {screens.map((screenContent, i) => (
            <Animated.View
              key={i}
              style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", opacity: pictureOpacity[i] }]}
            >
              <Image
                source={screenContent.illustrationSource}
                // Unscaled: the heroes are taller than wide, so at full size
                // the box's height decides, and any zoom pushed the wider one
                // (the magnifier) off the side of the screen.
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
                accessibilityLabel=""
              />
            </Animated.View>
          ))}
        </View>
      </View>

      {/* The words: they slide out one way and in from the other. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateX }] }]}
      >
        <View
          style={{
            position: "absolute",
            top: pct(BANDS.headline.top),
            height: bandHeight(BANDS.headline),
            left: 0,
            right: 0,
            paddingHorizontal: H_PADDING,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* One heading for a screen reader, drawn a line at a time: the first
              line in the accent colour, the rest in ink. (Nested text with its
              own line height drew only the first line on iOS.) */}
          <View accessible accessibilityRole="header" accessibilityLabel={screen.headline.join(" ")} style={{ alignItems: "center" }}>
            {screen.headline.map((line, i) => (
              <Text
                key={line}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{
                  fontFamily: HEADLINE_FONT,
                  fontSize: HEADLINE_SIZE,
                  lineHeight: HEADLINE_SIZE * 1.2,
                  color: i === 0 ? INTRO.accent : INTRO.ink,
                  textAlign: "center",
                }}
              >
                {line}
              </Text>
            ))}
          </View>
        </View>

        <View
          style={{
            position: "absolute",
            top: pct(BANDS.copy.top),
            height: bandHeight(BANDS.copy),
            left: 0,
            right: 0,
            // Tighter than H_PADDING: at 375pt width, H_PADDING left the
            // longer of the two reflowed lines ("We analyse the ingredients
            // and explain") just wide enough to auto-wrap onto a 3rd line,
            // which the copy band's fixed height doesn't have room for. The
            // design spec's own body-copy max-width (330-360pt) already
            // assumes narrower side margins than the headline gets.
            paddingHorizontal: 16,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* One sentence, wrapped by the screen rather than by hand. */}
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ fontSize: BODY_SIZE, lineHeight: BODY_SIZE * 1.4, fontWeight: "400", color: INTRO.muted, textAlign: "center" }}
          >
            {screen.supportingCopy}
          </Text>
        </View>
      </Animated.View>

      {/* After the content, not before it: the content wrapper fills the screen,
          and a later sibling is what sits on top of it and stays tappable.
          `pointerEvents="none"` on the wrapper would do the same but takes its
          text out of the VoiceOver tree on iOS. */}
      {onBack ? <ShellBackButton onPress={onBack} color={INTRO.accent} /> : null}
      <SkipButton onPress={onSkip} color={INTRO.muted} fontSize={SKIP_SIZE} fontFamily={null} />

      {/* Shown on every screen, including the first — per the redesign
          spec, dots are no longer withheld until the user has advanced. */}
      <View
        style={{
          position: "absolute",
          top: pct(BANDS.dots.top),
          height: bandHeight(BANDS.dots),
          left: 0,
          right: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ProgressDots
          count={screens.length}
          activeIndex={activeIndex}
          activeColor={INTRO.accent}
          inactiveColor={INTRO.muted}
          inactiveOpacity={INTRO_INACTIVE_DOT_OPACITY}
        />
      </View>

      <View
        style={{
          position: "absolute",
          top: pct(BANDS.button.top),
          height: bandHeight(BANDS.button),
          left: "6%",
          right: "6%",
          justifyContent: "center",
        }}
      >
        {/* A flat pill in the intro's own colour (owner), not the app's
            watercolor call to action. */}
        <Pressable
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          style={{ height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: INTRO.button, alignItems: "center", justifyContent: "center" }}
          className="active:opacity-80"
        >
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: BUTTON_LABEL_SIZE, fontWeight: "600", color: INTRO.buttonText }}>
            {buttonLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
