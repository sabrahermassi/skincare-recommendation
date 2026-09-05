import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";

/**
 * The "Ellow" wordmark — Playfair Display 500, drawn at whatever size the
 * caller needs. Unlike the old "SkinTell" mark, this one has no oversized
 * letters to draw by hand; it is plain text.
 */
export function EllowWordmark({ size = 42 }: { size?: number }) {
  return (
    <Text
      className="font-display"
      style={{ fontSize: size, lineHeight: size, letterSpacing: size * -0.016, color: "#463F57" }}
    >
      Ellow
    </Text>
  );
}

const ARROW_PATH = "M1 4h9M7.4 1 10.8 4 7.4 7";

/**
 * SCAN → ANALYZE → KNOW, drawn in IBM Plex Mono — a signature of the system,
 * not a fallback (per the handoff), which is why this is the one place in the
 * app that loads a third font family. The arrow is drawn inline rather than
 * the `→` character: at 8.5px its weight and baseline don't match the mono
 * face, a mismatch that has regressed twice during design.
 */
export function EllowTagline({ size = 8.5 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      {["SCAN", "ANALYZE", "KNOW"].map((word, i) => (
        <View key={word} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          {i > 0 ? (
            <Svg width={11} height={7} viewBox="0 0 12 8" fill="none">
              <Path
                d={ARROW_PATH}
                stroke="#B3A9DC"
                strokeWidth={1.3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          ) : null}
          <Text
            style={{
              fontFamily: "IBMPlexMono_500Medium",
              fontSize: size,
              letterSpacing: size * 0.19,
              color: "#8C8592",
            }}
          >
            {word}
          </Text>
        </View>
      ))}
    </View>
  );
}
