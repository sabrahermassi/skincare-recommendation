import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";
import { COLORS } from "@/lib/colors";

/**
 * "SkinTel", drawn rather than typed: the S and T are set larger than the stem
 * letters, which is the whole of the logotype. It appears on Welcome, Browse
 * and the Scanner at three sizes, and was written out by hand in each — so the
 * three had drifted to different proportions and different colours.
 */
export function Wordmark({ size = 31 }: { size?: number }) {
  return (
    <Text
      className="font-display leading-none text-[#463F57]"
      style={{ fontSize: size, letterSpacing: size * -0.011 }}
    >
      <Text style={{ fontSize: size * 1.19 }}>S</Text>kin
      <Text style={{ fontSize: size * 1.19 }}>T</Text>el
    </Text>
  );
}

/**
 * SCAN → ANALYZE → KNOW.
 *
 * Arrows rather than slashes: it is a sequence, and the slashes read as a
 * generic strapline. Plain sans with wide tracking, not a monospace face —
 * the app is down to two families (Playfair for display, the OS UI font for
 * everything else) and one small line does not earn a third.
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
            <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
              <Path
                d="m9 5 7 7-7 7"
                stroke={COLORS.inkFaint}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          ) : null}
          <Text
            className="font-semibold text-ink-muted"
            style={{ fontSize: size, letterSpacing: size * 0.17 }}
          >
            {word}
          </Text>
        </View>
      ))}
    </View>
  );
}
