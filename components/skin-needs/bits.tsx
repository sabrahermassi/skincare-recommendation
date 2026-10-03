import type { ReactNode } from "react";
import type { StyleProp, TextStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";
import { HAND_FONT, MUTED_FAINT } from "@/lib/tokens";

/**
 * A handwritten note on Skin needs (hand-off: Kalam), tilted a touch where the
 * design tilts it. Its size stays put at larger text sizes where the note sits
 * on a picture, placed by hand; one that tells something (`says`) grows like
 * any other line.
 */
export function Hand({
  children,
  size = 20,
  color = MUTED_FAINT,
  tilt = 0,
  says = false,
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  tilt?: number;
  /** A note that tells something ("we recommend swapping"): it grows with the text size like any line. One placed on a picture stays put. */
  says?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    // Kalam's letters rise and lean past an ordinary line box: a taller line and
    // a little room at the sides, or their tops and right edges are cut off.
    <Text maxFontSizeMultiplier={says ? undefined : 1.2} style={[{ fontFamily: HAND_FONT, fontSize: size, lineHeight: Math.round(size * 1.5), paddingHorizontal: 3, color, transform: tilt ? [{ rotate: `${tilt}deg` }] : undefined }, style]}>
      {children}
    </Text>
  );
}

/** The tick on a chosen chip, the goal chip and a toast. */
export function Tick({ size, color, weight = 3 }: { size: number; color: string; weight?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6 9 17l-5-5" stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The star that saves an ingredient: an outline, or filled once saved. */
export function StarIcon({ filled, color, size = 20 }: { filled: boolean; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Two arrows passing: swap, or alternate. */
export function SwapIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
