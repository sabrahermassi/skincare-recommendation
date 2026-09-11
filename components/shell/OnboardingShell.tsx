import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import { BrandLockup } from "@/components/shell/BrandLockup";
import { CANVAS, CHARCOAL, FONT, H_PADDING, MUTED, PrimaryButton, ProgressDots } from "@/components/shell/shared";

// NOTE: pixel-measuring design-watercolor/onboarding screen 1.png found the
// wordmark's own leftmost ink (in its top band, 11-14% of screen height —
// the top of the "f" stem, before its tail loops down-left) sits at 17-22%
// of screen width, not the ~7% the loop's tail swings down/left to. That
// repositioning (from the current H_PADDING-based left edge to a ~17%-based
// one) is a separate, not-yet-applied change — paused mid-edit pending
// confirmation, tracked here rather than silently dropped.
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
  wordmark: { top: 10.4, bottom: 14.2 },
  tagline: { top: 14.2, bottom: 21.2 },
  skip: { top: 13.9, bottom: 15.8 },
  // top nudged from 21.3 to 23.8: the wordmark's own font-size grew across
  // several rounds (44 -> 52 -> 58) after these bands were first measured
  // against a much smaller wordmark, and at 58px its natural (uncapped,
  // to avoid clipping — see BrandLockup) rendered height plus the tagline
  // below it were consuming the entire original 21.3-10.4=10.9% budget,
  // with no margin — reported as the tagline overlapping the illustration.
  // This is the one exception to BrandLockup being the only file touched
  // for wordmark-lockup requests: the fix genuinely requires more room
  // from its neighbour, not just tighter internal spacing. Shrinks the
  // illustration band by ~2.5% of screen height (~21px at 852pt) — a
  // small, mostly imperceptible reduction in hero size, not a layout change.
  illustration: { top: 23.8, bottom: 67.9 },
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
};

/**
 * Owns the entire onboarding flow's chrome — wordmark, tagline, Skip, the
 * hero/headline/copy content, dots, and the CTA — as ONE persistent tree,
 * not one instance per screen. Only the hero/headline/copy region reads
 * `screens[activeIndex]` and re-renders in place when it changes; the
 * header and footer (dots + button) are written unconditionally, so they
 * are never inside anything that mounts per-screen and can never visibly
 * shift or remount when `activeIndex` changes — that used to be a real bug
 * here: an earlier version rendered a full `OnboardingShell` per screen
 * inside a horizontally-paged ScrollView, so navigating animated the whole
 * page (button included) across the screen as part of the transition.
 */
export function OnboardingShell({ screens, activeIndex, onNext, onSkip }: OnboardingShellProps) {
  const [skipPressed, setSkipPressed] = useState(false);
  const screen = screens[activeIndex];

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      {/* Left-aligned at the same content edge as the hero/headline/button
          below (H_PADDING) — the reference screenshot's own "~17% from left
          edge" reading is where the rendered script glyph's ink begins, not
          this container's edge. The 9pt pullback matches BrandLockup's own
          paddingLeft-9 clip-clearance fix for the "f" flourish (RN's native
          Text clips glyph overshoot at the text's own box edge — see that
          component for the full explanation), keeping the visible letters
          aligned with H_PADDING like everything else while giving the
          flourish room to render without being cut off. */}
      <View style={{ position: "absolute", top: pct(BANDS.wordmark.top), left: H_PADDING - 9 }}>
        <BrandLockup />
      </View>

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
        {/* Same font+size as the supporting-copy text (BODY_SIZE, bodyRegular)
            per explicit request — kept on MUTED grey rather than the copy's
            CHARCOAL, since Skip is a secondary action, not body content. */}
        <Text style={{ fontFamily: FONT.bodyRegular, fontSize: BODY_SIZE, color: MUTED }}>Skip</Text>
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
        }}
      >
        <Image
          source={screen.illustrationSource}
          style={{ width: "100%", height: "100%" }}
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
            style={{
              fontFamily: FONT.bodyRegular,
              fontSize: BODY_SIZE,
              lineHeight: BODY_SIZE * 1.3,
              color: CHARCOAL,
              textAlign: "center",
            }}
          >
            {line}
          </Text>
        ))}
      </View>

      {/* Hidden on screen 1 (activeIndex 0) — per explicit request, dots
          only appear once the user has advanced past the first screen,
          starting at position 2 of 3 (activeIndex 1) on screen 2. */}
      {activeIndex > 0 && (
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
          <ProgressDots count={screens.length} activeIndex={activeIndex} />
        </View>
      )}

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
