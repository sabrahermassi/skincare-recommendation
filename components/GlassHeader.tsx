import { useMemo, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Glass } from "@/components/Glass";

// How strongly what scrolls behind the header is blurred (expo-blur, 1-100):
// light, so it reads as glass (owner).
const BLUR = 12;
// The soft edge under the header: how tall it is, and how far the list has to
// scroll before the glass and the edge are fully there.
const FADE = 24;
const FADE_AFTER = 16;

/**
 * A screen's fixed top on glass (owner, 2 October 2026): it holds still over a
 * scroll view, and what scrolls up passes behind it, lightly blurred. At rest
 * it is the page's own plain colour (`solid`); the glass (`glass`, that colour
 * let through) and a soft lower edge come in as `scrollY` leaves zero.
 *
 * It sits over the scroll view, so the scroll view must leave room for it:
 * `onHeight` reports how much.
 */
export function GlassHeader({
  scrollY,
  solid,
  glass,
  onHeight,
  children,
}: {
  scrollY: Animated.Value;
  solid: string;
  glass: string;
  onHeight: (height: number) => void;
  children: ReactNode;
}) {
  const scrolled = useMemo(() => scrollY.interpolate({ inputRange: [0, FADE_AFTER], outputRange: [0, 1], extrapolate: "clamp" }), [scrollY]);
  const atRest = useMemo(() => scrollY.interpolate({ inputRange: [0, FADE_AFTER], outputRange: [1, 0], extrapolate: "clamp" }), [scrollY]);
  return (
    <View onLayout={(event) => onHeight(event.nativeEvent.layout.height)} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
      {/* Liquid Glass on iOS 26 and later, the frosted blur elsewhere (`Glass`). */}
      <Glass style={StyleSheet.absoluteFill} blur={BLUR} fill={glass} tint={glass} />
      {/* Plain until the list scrolls, so at rest the header is exactly the
          page's own colour, whatever the blur does. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: solid, opacity: atRest }]} />
      {children}
      {/* Once scrolled, the header's lower edge is a soft fade, not a straight
          cut across whatever is passing under it. */}
      <Animated.View pointerEvents="none" style={{ position: "absolute", top: "100%", left: 0, right: 0, height: FADE, opacity: scrolled }}>
        <Svg width="100%" height={FADE}>
          <Defs>
            <LinearGradient id="glassHeaderFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={solid} stopOpacity={0.9} />
              <Stop offset="1" stopColor={solid} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height={FADE} fill="url(#glassHeaderFade)" />
        </Svg>
      </Animated.View>
    </View>
  );
}
