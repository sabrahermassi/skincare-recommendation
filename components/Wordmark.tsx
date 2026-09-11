import { View } from "react-native";

import { Text } from "@/components/Text";
import { INK, MUTED, MUTED_FAINT } from "@/lib/tokens";

// Manassa system (design/DESIGN_SYSTEM.md).

/**
 * "Manassa", drawn rather than typed: the leading M is set larger than the
 * rest of the word, the single-oversized-letter version of the app's former
 * "SkinTell" mark (which had two capitals mid-word to enlarge). Appears on
 * Browse (its only consumer) at one size.
 */
export function Wordmark({ size = 31 }: { size?: number }) {
  return (
    <Text
      className="font-display"
      // `leading-none` set the line height to 1x the *outer* font size — no
      // room for the M, which renders at 1.19x that and would clip along the
      // top edge otherwise. Line height is sized off the larger nested glyph,
      // with a little headroom, not off the smaller letters around it.
      style={{ fontSize: size, letterSpacing: size * -0.011, lineHeight: size * 1.32, color: INK }}
    >
      <Text style={{ fontSize: size * 1.19 }}>M</Text>anassa
    </Text>
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
