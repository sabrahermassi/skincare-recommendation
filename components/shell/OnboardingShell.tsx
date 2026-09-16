import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import { CANVAS, CHARCOAL, FONT, H_PADDING, PrimaryButton, ProgressDots, TERRACOTTA } from "@/components/shell/shared";

const HEADLINE_SIZE = 44;
const BODY_SIZE = 17;

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
  headline: { top: 68.8, bottom: 79.0 },
  copy: { top: 80.7, bottom: 85.3 },
  dots: { top: 87.4, bottom: 88.8 },
  button: { top: 90.5, bottom: 96.0 },
} as const;

function pct(n: number) {
  return `${n}%` as const;
}

function bandHeight(band: { top: number; bottom: number }) {
  return pct(band.bottom - band.top);
}

/** Screens 2/3's art already spans the full screen width, so "5% bigger"
 *  has to scale the image itself — the PNGs' 5-8% transparent side margins
 *  are what go off-screen, not artwork. */
const ILLUSTRATION_SCALE = 1.05;

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

export type OnboardingScreenContent = {
  /** Explicit line breaks, not auto-wrap — up to 2 lines; the headline band
   *  reserves the same height whether 1 or 2 lines are passed. */
  headline: string[];
  /** Up to 2 lines. */
  supportingCopy: string[];
  buttonLabel: string;
  illustrationSource: number;
};

type OnboardingShellProps = {
  screens: OnboardingScreenContent[];
  /** 0-based index into `screens` of the screen currently showing. */
  activeIndex: number;
  onNext: () => void;
  onSkip: () => void;
  /** Dot count to draw, when the intro's dots are part of a longer combined
   *  sequence (see lib/profile.ts's TOTAL_ONBOARDING_STEPS) rather than just
   *  this carousel's own 3. Defaults to `screens.length`, i.e. unchanged. */
  totalDots?: number;
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
export function OnboardingShell({ screens, activeIndex, onNext, onSkip, totalDots }: OnboardingShellProps) {
  const [skipPressed, setSkipPressed] = useState(false);
  const screen = screens[activeIndex];

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <Pressable
        onPress={onSkip}
        onPressIn={() => setSkipPressed(true)}
        onPressOut={() => setSkipPressed(false)}
        accessibilityRole="button"
        style={{
          position: "absolute",
          top: pct(BANDS.skip.top),
          right: H_PADDING,
          minHeight: 44,
          minWidth: 44,
          alignItems: "center",
          justifyContent: "center",
          opacity: skipPressed ? 0.6 : 1,
        }}
      >
        {/* Same font+size as the supporting-copy text (BODY_SIZE, bodyRegular).
            TERRACOTTA, not the old MUTED grey — that grey cleared AA (5.35:1)
            but still read as washed-out low-contrast on cream; terracotta is
            the app's own accent and is unambiguously legible here (6.1:1 on
            CANVAS). */}
        <Text style={{ fontFamily: FONT.bodyRegular, fontSize: BODY_SIZE, color: TERRACOTTA }}>Skip</Text>
      </Pressable>

      <View
        style={{
          position: "absolute",
          top: pct(BANDS.illustration.top),
          height: bandHeight(BANDS.illustration),
          left: 0,
          right: 0,
          alignItems: "center",
          justifyContent: "center",
          // The scaled image extends ~9pt past this box; onb2-scan has no
          // transparent top margin, so clipping here would cut the hair.
          overflow: "visible",
        }}
      >
        <Image
          source={screen.illustrationSource}
          style={{ width: "100%", height: "100%", transform: [{ scale: ILLUSTRATION_SCALE }] }}
          contentFit="contain"
          accessibilityLabel=""
        />
      </View>

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
        {screen.headline.map((line) => (
          <Text
            key={line}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{
              fontFamily: FONT.headline,
              fontSize: HEADLINE_SIZE,
              lineHeight: HEADLINE_SIZE * 1.0,
              letterSpacing: HEADLINE_SIZE * -0.02,
              color: CHARCOAL,
              textAlign: "center",
            }}
          >
            {line}
          </Text>
        ))}
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
        {screen.supportingCopy.map((line) => (
          <Text
            key={line}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{
              fontFamily: FONT.bodyRegular,
              fontSize: BODY_SIZE,
              // 1.3 * 1.16: explicit "16% more space between lines". Same
              // 1.3 number as MAX_FONT_SCALE above by coincidence, not
              // relation — that one caps accessibility scaling, this one is
              // the design's own line-height multiplier.
              lineHeight: BODY_SIZE * 1.3 * 1.16,
              color: CHARCOAL,
              textAlign: "center",
            }}
          >
            {line}
          </Text>
        ))}
      </View>

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
        <ProgressDots count={totalDots ?? screens.length} activeIndex={activeIndex} />
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
        <PrimaryButton label={screen.buttonLabel} onPress={onNext} size="large" />
      </View>
    </View>
  );
}
