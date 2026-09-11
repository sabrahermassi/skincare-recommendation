import { Image } from "expo-image";
import { View, useWindowDimensions } from "react-native";

import { Text } from "@/components/Text";
import { FONT, TERRACOTTA } from "@/components/shell/shared";

// heart.png with its stroke thickened ~30% ("30% more bold") — same canvas
// size, so HEART_ASPECT still holds. An Image's stroke can't be styled.
const HEART = require("@/assets/illustrations/onboarding/heart-bold.png");
const HEART_ASPECT = 1340 / 1174;
// "20% bigger" — a transform so it grows around its own centre; resizing
// the box instead would drag it off "e" (top/right anchor one corner).
const HEART_SCALE = 1.2;

// The "." in "for.me", replaced by a filled heart the same size. The "."
// stays in the text but invisible, so letter spacing is untouched. Measured
// off a screenshot at fontSize 97.72: the dot's ink is 7x7px, centred 82.7px
// right of the glyph origin (the paddingLeft edge) and 88.6px below the Text
// box's top.
const DOT_HEART = require("@/assets/illustrations/onboarding/heart-filled.png");
const DOT_X_RATIO = 82.7 / 97.72;
const DOT_Y_RATIO = 88.6 / 97.72;
const DOT_SIZE_RATIO = 7 / 97.72;

// This component's parent (OnboardingShell) positions the lockup's
// container at H_PADDING-9 = 15px from the screen edge (9px pulled back to
// give the "f" flourish clip-clearance room — see that file's placement
// comment; not touched here, single-file scope).
const PARENT_LEFT_OFFSET = 15;

// Pixel-measured off design-watercolor/onboarding screen 3.png: the
// wordmark's cap-height ("f" ascender-top to baseline) is 28.2% of screen
// WIDTH there — confirmed by finding the fontSize (111) that reproduces
// that exact cap-height at 393pt width, then screenshot-verified against
// the reference. NOT this change's own suggested 15vw: that ratio would
// shrink the wordmark to roughly half the size just confirmed correct, so
// the measured ratio is used instead of the example figure. min/max keep
// it legible/sane on very narrow or very wide devices.
// 0.2072 * 1.2 (and min/max scaled the same way) — explicit 20% increase.
// Safe to keep growing this now that OnboardingShell reserves the header's
// actual measured height and pushes the illustration below it dynamically
// (see HEADER_SAFETY_GAP_PX there) instead of the two being tuned against
// each other by hand via fixed percentages.
const WORDMARK_WIDTH_RATIO = 0.24864;
const WORDMARK_MIN = 84;
const WORDMARK_MAX = 124.8;

// Explicit request: the wordmark's leftmost visual extent — the "f"
// flourish's tail, which swings further left than the main stem — should
// align with the CTA button's own left edge (OnboardingShell's BANDS.button
// left:"6%"), without clipping it. The tail sits roughly 10 percentage
// points left of the main stem at the size this was originally measured at
// (WORDMARK_WIDTH_RATIO 0.282); scaled down for the current, 20%-smaller
// size, that overshoot is ~8 points, so the main stem is targeted at
// 0.06 (button) + 0.08 (scaled tail overshoot) = 0.14 as a first estimate;
// screenshot-measured the actual result 14px right of the button's own
// left edge, so nudged down to close that gap.
const WORDMARK_LEFT_RATIO = 0.104;

// Calibrated from the font's own rendering, not guessed: RN gives Text no
// way to read its own ascender/baseline metrics, so these ratios were
// derived by pixel-measuring this exact font at fontSize 111 (where the
// wordmark was already confirmed to match the reference) and expressing
// each hand-tuned pixel offset as a fraction of that fontSize, so they
// scale correctly if fontSize changes instead of needing re-tuning by hand
// each time. This is also why the heart's top/right below use different
// values than this change's own -0.15em/-0.3em suggestion: those assume a
// browser's line-box model, and RN's Text (no lineHeight, to avoid
// clipping the flourish — see below) reserves a different, larger amount
// of invisible ascender/descender space that these ratios account for.
const WORDMARK_TOP_COMPENSATION = -43 / 111; // pulls visible "f" top up to the nominal position
// Repositioned alongside the tilt increase (20deg->50deg): the rotation
// swings the heart's own tip away from "e", not toward it, so getting the
// tip close to "e" again is a position fix, not a rotation fix. Iterating
// via screenshot rather than computing this analytically — the asset is
// an asymmetric shape, so where its "tip" actually lands post-rotation
// isn't something to derive from the rotation angle alone.
const HEART_TOP_RATIO = 0.22;
// This change's own suggested -0.3/0.9 combination, screenshot-checked,
// covered most of the "e" instead of touching it: at 0.9× fontSize height,
// aspectRatio gives the heart a ~114px width at fontSize 111, and a -0.3em
// right offset (~33px) isn't nearly enough to keep a shape that wide from
// extending back over the letter. Sized down and the right offset
// recalculated so the heart's own left edge lands close to, not deep
// inside, the wordmark-wrap's right edge (a small intentional overlap for
// "touching the terminal stroke", not full coverage).
// -0.38: nudged from -0.25 specifically to open a ~2mm gap between the
// heart's own tip and "e"'s terminal-stroke tip (they'd drifted to
// touching/near-zero gap after the wordmark itself shrank above, since
// this is a ratio of wordmarkSize). Only this value changed for this
// request — tilt, size, and top position are untouched.
const HEART_RIGHT_RATIO = -0.38;
// 0.4 * 0.7 ("30% smaller") — scaling this one constant shrinks both width
// and height proportionally (both formulas below multiply through it), so
// the overall size drops 30% while the slimmer/taller shape from
// HEART_WIDTH_SCALE/HEART_TALL_SCALE stays intact.
const HEART_HEIGHT_RATIO = 0.28;
// "A bit slimmer and taller" — deliberately breaks from the asset's own
// native aspect ratio (HEART_ASPECT), unlike every other heart size
// change so far, which all preserved it via contentFit="contain". Applied
// as separate width/height multipliers on top of the aspect-derived base
// size, not baked into HEART_ASPECT itself, since that constant describes
// the asset file, not how it's meant to be displayed.
const HEART_WIDTH_SCALE = 0.85;
const HEART_TALL_SCALE = 1.15;
// Tilted right (clockwise) so its own point aims back down-left toward
// where "e" ends, rather than sitting perfectly upright. 20deg -> 50deg
// (30 more) per explicit request. Rotation pivots around the Image's own
// center by default, which shifts where its visual tip actually lands —
// HEART_RIGHT_RATIO/HEART_TOP_RATIO were re-tuned alongside this, not left
// as-is, to keep the tip near "e" rather than drifting off as the angle
// changed.
// 50 * 1.15 = 57.5, then * 0.8 = 46, then * 0.8 again = 36.8 ("20% tilted
// to the left" again — same multiply-the-current-value convention).
const HEART_TILT_DEG = 36.8;
// Target was ~1mm between the heart's own tip and "e"'s terminal-stroke
// tip — RN gives no way to read either shape's actual rendered geometry
// to hit that analytically, so HEART_TOP_RATIO/HEART_RIGHT_RATIO were
// tuned empirically via screenshot instead until the gap read as close to
// that target as could be judged visually.

// The wordmark Text's layout box ends 16px below the "f" descender's lowest
// ink at fontSize 97.7 (393pt-wide screen) — measured on web and on a device
// screenshot (design-now/screen 1), same on both. That strip is invisible
// font line-box space, so anything that must clear the wordmark should clear
// its ink, not its box.
const BOX_BELOW_INK_RATIO = 16 / 97.7;

function wordmarkSizeFor(width: number) {
  return Math.min(WORDMARK_MAX, Math.max(WORDMARK_MIN, width * WORDMARK_WIDTH_RATIO));
}

/** How far the lockup's layout box extends below the wordmark's visible ink, in px. */
export function wordmarkBoxBelowInk(width: number) {
  return wordmarkSizeFor(width) * BOX_BELOW_INK_RATIO;
}

/**
 * The for.me wordmark + heart, as one connected, proportionally scaling
 * lockup:
 *
 *   for.me♡
 *
 * Every size/offset below is a ratio of either screen width or the
 * wordmark's own computed font-size, not a fixed pixel — the wordmark and
 * heart should hold their proportions relative to each other and to the
 * screen if the wordmark's font or size ever changes, rather than needing
 * hand-tuned pixels re-measured for every change (which is how they
 * drifted out of proportion with each other across several rounds before
 * this one).
 *
 * The only component allowed to touch these elements — kept isolated
 * specifically so wordmark-only requests never risk the
 * illustration/headline/copy/pagination/button around it.
 */
export function BrandLockup() {
  const { width } = useWindowDimensions();

  const wordmarkSize = wordmarkSizeFor(width);
  const wordmarkLeftPad = width * WORDMARK_LEFT_RATIO - PARENT_LEFT_OFFSET;

  return (
    <View>
      {/* Single relatively-positioned wrapper around the wordmark AND the
          heart, per this change's own structure — the heart is anchored to
          THIS box (via its font-size-relative top/right below), not
          positioned independently, so it moves and rescales with the
          wordmark automatically. alignSelf:"flex-start" shrinks this
          wrapper to the Text's own rendered width — RN's default
          alignItems:"stretch" would otherwise expand it to the full
          available width, which is exactly what made an earlier
          percentage-based attempt at this same "position the heart right
          after the text" problem drift toward "Skip" on a real device.
          overflow:"visible" is required for the "f" flourish (which
          extends past this box on the left/top via the negative margins
          below) and the heart (which can extend past the box on the
          right) to render without being clipped. */}
      <View style={{ position: "relative", alignSelf: "flex-start", overflow: "visible" }}>
        {/* No letterSpacing, no fontWeight override — Mrs Saint Delafield
            only has a 400 weight, and "no artificial bolding" either way.
            No explicit lineHeight: a tight lineHeight clips the TOP of
            this script font's tall strokes on native (invisible on web —
            browsers don't clip overflowing glyph ink the way RN does).
            paddingLeft gives RN's native Text render box room for the
            "f"'s full flourish without clipping it on the left, and lands
            the visible ink at the target left position (see
            WORDMARK_LEFT_RATIO above). marginTop is
            WORDMARK_TOP_COMPENSATION — see that constant's comment. */}
        <Text
          style={{
            fontFamily: FONT.wordmark,
            fontSize: wordmarkSize,
            letterSpacing: 0,
            color: TERRACOTTA,
            paddingLeft: wordmarkLeftPad,
            marginTop: wordmarkSize * WORDMARK_TOP_COMPENSATION,
          }}
        >
          for<Text style={{ color: "transparent" }}>.</Text>me
        </Text>
        {/* Explicit width AND height (width computed from HEART_ASPECT in
            JS), not RN's `aspectRatio` style with only height set — that
            was the previous approach here, and aspectRatio resolution for
            an absolutely-positioned node is a known Yoga/native vs.
            react-native-web CSS-engine divergence, the same category of
            bug as the heart-drift issue a few rounds back that looked
            correct on a web screenshot and wasn't on device. Both
            dimensions being plain computed numbers here removes that risk
            entirely rather than trusting either engine to resolve it the
            same way. tintColor forces the asset's own baked-in ink color
            to match TERRACOTTA exactly. */}
        <Image
          source={HEART}
          style={{
            position: "absolute",
            // top: -15 total (..., -2, then -1 more for "1px higher").
            // right: +1 total (..., +4, then +2 more for "2px to the
            // left"). Fixed pixels throughout, not ratios — deliberate,
            // unlike every other heart offset here. height/width also
            // carry HEART_TALL_SCALE/HEART_WIDTH_SCALE — see those
            // constants.
            // Compensated for the 30% size reduction above: shrinking the
            // box while top/right stay anchored at the same point pulls
            // the visible heart up and right, away from "e" (top/right
            // anchor the box's top-right corner, so a smaller box moves
            // its bottom-left inward toward that fixed corner). Estimated
            // then screenshot-corrected, not computed exactly.
            // Then -3 on top ("3px higher") and +7 on right ("7px to the left"),
            // then -2 on top ("2px higher") and +7 on right ("7px to the left"),
            // then -3 on top ("3px higher") and +4 on right ("4px to the left").
            top: wordmarkSize * HEART_TOP_RATIO - 9,
            right: wordmarkSize * HEART_RIGHT_RATIO + 8,
            height: wordmarkSize * HEART_HEIGHT_RATIO * HEART_TALL_SCALE,
            width: wordmarkSize * HEART_HEIGHT_RATIO * HEART_ASPECT * HEART_WIDTH_SCALE,
            transform: [{ rotate: `${HEART_TILT_DEG}deg` }, { scale: HEART_SCALE }],
          }}
          tintColor={TERRACOTTA}
          contentFit="contain"
          accessibilityLabel=""
        />
        <Image
          source={DOT_HEART}
          style={{
            position: "absolute",
            left: wordmarkLeftPad + wordmarkSize * (DOT_X_RATIO - DOT_SIZE_RATIO / 2),
            top: wordmarkSize * (WORDMARK_TOP_COMPENSATION + DOT_Y_RATIO - DOT_SIZE_RATIO / 2),
            width: wordmarkSize * DOT_SIZE_RATIO,
            height: wordmarkSize * DOT_SIZE_RATIO,
          }}
          tintColor={TERRACOTTA}
          contentFit="contain"
          accessibilityLabel=""
        />
      </View>
    </View>
  );
}
