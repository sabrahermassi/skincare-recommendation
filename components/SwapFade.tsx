import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, type StyleProp, type ViewStyle } from "react-native";

import { reduceMotionNow } from "@/lib/reduce-motion";
import { SPACE } from "@/lib/tokens";

// As quick as the switch's own thumb (`lib/flow.ts`), so the two land together.
const SWAP_MS = 200;
const SWAP_RISE = SPACE.text;

/**
 * What a switch shows under itself (the result's two tabs, the routine's
 * morning and evening). When `on` changes, the new content fades in and
 * settles up into place rather than cutting in. Whatever is there first is
 * simply there; with Reduce Motion on, so is everything after it.
 */
export function SwapFade({ on, style, children }: { on: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const [first] = useState(on);
  const [swapped, setSwapped] = useState(false);
  if (!swapped && on !== first) setSwapped(true);
  return (
    <Arriving key={on} animate={swapped} style={style}>
      {children}
    </Arriving>
  );
}

function Arriving({ animate, style, children }: { animate: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  // Starts hidden only when it is going to move, so nothing flashes in first.
  const [shown] = useState(() => new Animated.Value(animate && !reduceMotionNow() ? 0 : 1));
  useEffect(() => {
    const animation = Animated.timing(shown, { toValue: 1, duration: SWAP_MS, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" });
    animation.start();
    return () => animation.stop();
  }, [shown]);
  return (
    <Animated.View
      testID="swap-fade"
      style={[style, { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [SWAP_RISE, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}
