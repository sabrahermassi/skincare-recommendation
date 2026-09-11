import { Image } from "expo-image";
import { View } from "react-native";

import { Text } from "@/components/Text";
import { CHARCOAL, FONT, TERRACOTTA } from "@/components/shell/shared";

const HEART = require("@/assets/illustrations/onboarding/heart.png");

// Bumped from 58 per explicit "too small compared to full screen" feedback.
const WORDMARK_SIZE = 68;
// This component's parent (OnboardingShell) positions the lockup's
// container at H_PADDING-9 = 15px from the screen edge (9px pulled back to
// give the "f" flourish clip-clearance room — see OnboardingShell's own
// placement comment; not touched here per this change's single-file scope).
// This paddingLeft is what lands the wordmark's visible ink at the
// requested ~27px from the screen edge: 15 (parent) + 12 (here) = 27.
const WORDMARK_LEFT_PAD = 12;

// Explicit bounding box, not derived from the asset's own aspect ratio —
// the spec gives an absolute size ("roughly equal to the wordmark's
// font-size in height"), not a scale factor off the asset. contentFit
// "contain" keeps the asset's own proportions intact inside this box
// rather than stretching it to a different aspect than its native art.
const HEART_WIDTH = 42;
const HEART_HEIGHT = 55;

// Same reasoning as WORDMARK_LEFT_PAD: parent container is at 15px, so 53
// here lands the tagline's own left edge at 15+53=68px from the screen
// edge — under the "o/r" of "for", not under the "f" flourish.
const TAGLINE_LEFT = 53;

/**
 * The for.me wordmark + heart + tagline, as one lockup:
 *
 *   for.me♡
 *      skincare, understood for you
 *
 * The only component allowed to touch any of these three elements — kept
 * isolated specifically so wordmark-only requests never risk the
 * illustration/headline/copy/pagination/button around it.
 */
export function BrandLockup() {
  return (
    <View>
      {/* Ordinary flex-row so the heart's HORIZONTAL position ("right after
          the word") is resolved by normal layout on both platforms — an
          earlier version used position:"absolute" with left:"100%" against
          an alignSelf-shrunk parent, which is a percentage-against-
          auto-width case Yoga (native) and react-native-web's CSS engine
          are known to resolve differently; it looked right on a web
          screenshot and drifted toward "Skip" on device. */}
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        {/* No letterSpacing, no fontWeight override — Mrs Saint Delafield
            only has a 400 weight, and "no artificial bolding" per the
            wordmark spec either way. No explicit lineHeight: a tight
            lineHeight clips the TOP of this script font's tall strokes on
            native (invisible on web — browsers don't clip overflowing
            glyph ink the way RN does). paddingLeft gives RN's native Text
            render box room for the "f"'s full flourish without clipping
            it on the left either. */}
        <Text
          style={{
            fontFamily: FONT.wordmark,
            fontSize: WORDMARK_SIZE,
            letterSpacing: 0,
            color: TERRACOTTA,
            paddingLeft: WORDMARK_LEFT_PAD,
          }}
        >
          for.me
        </Text>
        {/* width:HEART_WIDTH reserves real horizontal space in the row (so
            the heart sits immediately after the text, via ordinary flex
            flow — no percentage-of-unknown-width resolution involved).
            height:0 + overflow:"visible" is what keeps it OUT of the row's
            height calculation despite the Image inside being much taller:
            the wrapper itself contributes zero height to the row (so the
            tagline below isn't pushed down), while the absolutely
            positioned Image inside still paints outside the wrapper's own
            (zero-height) box. `top` on the Image lands its own top edge
            near the x-height of "m"/"e" rather than the tall "f" ascender
            (near this row's own top). tintColor forces the asset's own
            baked-in ink color to match TERRACOTTA exactly. */}
        <View style={{ width: HEART_WIDTH, height: 0, overflow: "visible" }}>
          <Image
            source={HEART}
            style={{
              position: "absolute",
              top: 20,
              left: 2,
              width: HEART_WIDTH,
              height: HEART_HEIGHT,
            }}
            tintColor={TERRACOTTA}
            contentFit="contain"
            accessibilityLabel=""
          />
        </View>
      </View>
      {/* Sized down from 15 per explicit "slightly smaller" feedback,
          paired with the wordmark's own bump above. */}
      <Text
        style={{
          fontFamily: FONT.bodyRegular,
          fontSize: 12,
          letterSpacing: 0,
          color: CHARCOAL,
          marginTop: 2,
          marginLeft: TAGLINE_LEFT,
        }}
        numberOfLines={1}
      >
        skincare, understood for you
      </Text>
    </View>
  );
}
