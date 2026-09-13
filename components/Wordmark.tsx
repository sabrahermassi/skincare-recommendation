import { View } from "react-native";

import { Text } from "@/components/Text";
import { FONT, TERRACOTTA } from "@/components/shell/shared";
import { MUTED, MUTED_FAINT } from "@/lib/tokens";

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
 */
export function Wordmark({ size = 31 }: { size?: number }) {
  return (
    <Text style={{ fontFamily: FONT.wordmark, fontSize: size, color: TERRACOTTA }}>for.me</Text>
  );
}

/**
 * SCAN · ANALYZE · KNOW.
 *
 * A plain separator between three words, not a sequence needing arrows.
 * Plain sans with wide tracking, not a monospace face — the app is down to
 * two families (Playfair for display, the OS UI font for everything else)
 * and one small line does not earn a third.
 */
export function Eyebrow({ size = 9.5 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.74 }}>
      {["SCAN", "ANALYZE", "KNOW"].map((word, i) => (
        <View
          key={word}
          style={{ flexDirection: "row", alignItems: "center", gap: size * 0.74 }}
        >
          {i > 0 ? (
            <Text style={{ fontSize: size, color: MUTED_FAINT }}>·</Text>
          ) : null}
          <Text
            style={{ fontSize: size, letterSpacing: size * 0.17, fontWeight: "600", color: MUTED }}
          >
            {word}
          </Text>
        </View>
      ))}
    </View>
  );
}
