import { Text } from "@/components/Text";
import { FONT, TERRACOTTA } from "@/components/shell/shared";

// The design system (design/DESIGN_SYSTEM.md).

/**
 * "for.me", in the same script face and colour as the onboarding hero
 * wordmark (`components/shell/BrandLockup.tsx`'s `FONT.wordmark`/
 * `TERRACOTTA`) — same brand mark, not a second one. `BrandLockup` itself
 * isn't reused here: its ratios (WORDMARK_MIN/MAX, the heart-over-the-dot
 * placement) are hand-tuned specifically for the onboarding hero's large
 * scale and screen-width-relative layout, not this masthead's small,
 * fixed-size row — reusing it verbatim at this size would either render far
 * too large or need most of those ratios re-tuned for a context they
 * weren't built for. No explicit lineHeight: a tight one clips the top of
 * this script font's tall strokes (same note as BrandLockup's own).
 *
 * `paddingBottom` is a separate fix for a separate edge: on web, the
 * browser computes this webfont's line box from its own (miscalibrated)
 * descent metric, which sits above where the "f"'s tail actually draws —
 * clipping it flush against whatever sits below. Padding adds real box
 * space without touching line-height, so it doesn't reintroduce the
 * top-clipping the missing `lineHeight` above is already avoiding.
 */
export function Wordmark({ size = 31 }: { size?: number }) {
  return (
    <Text
      style={{
        fontFamily: FONT.wordmark,
        fontSize: size,
        color: TERRACOTTA,
        paddingBottom: size * 0.18,
      }}
    >
      for.me
    </Text>
  );
}
