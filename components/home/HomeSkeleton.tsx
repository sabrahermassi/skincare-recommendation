import { useEffect, useState } from "react";
import { Animated, Easing, View, type StyleProp, type ViewStyle } from "react-native";

import { reduceMotionNow } from "@/lib/reduce-motion";
import { DIVIDER, LINE, STONE } from "@/lib/tokens";

// The same room the real card and tip take, so nothing jumps when they arrive.
const SKELETON_CARD_HEIGHT = 212;
const SKELETON_TIP_HEIGHT = 160;
const CARD_RADIUS = 24;
const PULSE_MS = 900;

/**
 * Grey shapes where Home's routine card and tip will be while the routine is
 * built (Apple's loading guidance: placeholders where content isn't ready,
 * never a blank). They breathe slowly; with Reduce Motion they hold still.
 * One pulse is shared by every shape, so they move together.
 */
export function HomeSkeleton({ part }: { part: "card" | "tip" }) {
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotionNow()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: PULSE_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View accessible accessibilityRole="progressbar" accessibilityLabel={part === "card" ? "Loading your skincare routine" : "Loading your skincare tip"} style={{ opacity: pulse }}>
      {part === "card" ? <CardShape /> : <TipShape />}
    </Animated.View>
  );
}

function Bar({ width, height = 14, style }: { width: number | `${number}%`; height?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width, height, borderRadius: height / 2, backgroundColor: LINE }, style]} />;
}

/** The routine card: its two title lines, the time line, the active, and a row of pills. */
function CardShape() {
  return (
    <View style={{ height: SKELETON_CARD_HEIGHT, borderRadius: CARD_RADIUS, backgroundColor: DIVIDER, padding: 20, justifyContent: "space-between" }}>
      <View style={{ gap: 10 }}>
        <Bar width="52%" height={22} />
        <Bar width="40%" height={14} />
        <Bar width="34%" height={18} style={{ marginTop: 6 }} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, height: 36, borderRadius: 18, backgroundColor: STONE }} />
        ))}
      </View>
    </View>
  );
}

/** The tip: the envelope's place, then its title, line and "Tap to open". */
function TipShape() {
  return (
    <View style={{ height: SKELETON_TIP_HEIGHT, flexDirection: "row", alignItems: "center", gap: 16 }}>
      <View style={{ width: 120, height: 120, borderRadius: 24, backgroundColor: DIVIDER }} />
      <View style={{ flex: 1, gap: 10 }}>
        <Bar width="62%" height={22} />
        <Bar width="86%" height={14} />
        <Bar width="40%" height={14} />
      </View>
    </View>
  );
}
