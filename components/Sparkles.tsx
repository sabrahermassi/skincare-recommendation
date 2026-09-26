import { useEffect, useState } from "react";
import { Animated, Easing, Platform, View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import { reduceMotionNow } from "@/lib/reduce-motion";
import { CANVAS } from "@/lib/tokens";

/**
 * Four-point stars twinkling over a photo while it is read, so the wait looks
 * like work being done (owner). Decorative: hidden from screen readers, which
 * hear the reading message instead. With Reduce Motion on they stay still.
 *
 * Fills whatever it is placed in; the stars sit at fixed spots across it
 * (fractions of its size), each with its own size and moment in the twinkle.
 */
const STARS: { x: number; y: number; size: number; delay: number }[] = [
  { x: 0.18, y: 0.14, size: 18, delay: 0 },
  { x: 0.72, y: 0.1, size: 12, delay: 500 },
  { x: 0.46, y: 0.28, size: 22, delay: 900 },
  { x: 0.85, y: 0.36, size: 16, delay: 250 },
  { x: 0.12, y: 0.46, size: 12, delay: 1200 },
  { x: 0.58, y: 0.52, size: 14, delay: 650 },
  { x: 0.3, y: 0.66, size: 20, delay: 350 },
  { x: 0.8, y: 0.7, size: 12, delay: 1050 },
  { x: 0.48, y: 0.84, size: 16, delay: 150 },
];
const TWINKLE_MS = 900;

export function Sparkles({ style }: { style?: ViewStyle }) {
  const [layout, setLayout] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      testID="sparkles"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}
      onLayout={(e) => setLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {layout
        ? STARS.map((star, i) => (
            <Star key={i} left={star.x * layout.w - star.size / 2} top={star.y * layout.h - star.size / 2} size={star.size} delay={star.delay} />
          ))
        : null}
    </View>
  );
}

function Star({ left, top, size, delay }: { left: number; top: number; size: number; delay: number }) {
  const [twinkle] = useState(() => new Animated.Value(reduceMotionNow() ? 1 : 0));
  useEffect(() => {
    if (reduceMotionNow()) return;
    const useNativeDriver = Platform.OS !== "web";
    const easing = Easing.inOut(Easing.quad);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 1, duration: TWINKLE_MS, easing, useNativeDriver }),
        Animated.timing(twinkle, { toValue: 0, duration: TWINKLE_MS, easing, useNativeDriver }),
      ]),
    );
    const start = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [twinkle, delay]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left,
        top,
        opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }),
        transform: [{ scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 0C12.9 7.2 16.8 11.1 24 12C16.8 12.9 12.9 16.8 12 24C11.1 16.8 7.2 12.9 0 12C7.2 11.1 11.1 7.2 12 0Z" fill={CANVAS} />
      </Svg>
    </Animated.View>
  );
}
