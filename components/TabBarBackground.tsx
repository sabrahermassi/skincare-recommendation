import { BlurView } from "expo-blur";
import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { makeMutable, ReduceMotion, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { TAB_BAR_HEIGHT, TAB_BAR_RADIUS, TAB_BAR_SIDE_MARGIN } from "@/lib/tab-bar";
import { HAIRLINE, TAB_BAR_GLASS, TAB_PILL } from "@/lib/tokens";

// The pill behind the current tab (v9, read off the hand-off: 64 by 48), a
// capsule like the bar it sits in.
export const PILL_WIDTH = 64;
export const PILL_HEIGHT = 48;
// The bar has five equal places: Home, School, the scan button, Saved, Profile.
const SLOTS = 5;

/** Which of the bar's five places is current. Each tab button sets it when it becomes the current tab. */
export const activeTabSlot = makeMutable(0);

// The pill flows to the next tab like a drop of water (owner): the edge in
// front moves off quickly and the edge behind follows, so it stretches as it
// travels and gathers again where it lands.
const LEAD = { mass: 0.6, stiffness: 260, damping: 20, reduceMotion: ReduceMotion.System } as const;
const TRAIL = { mass: 0.9, stiffness: 130, damping: 19, reduceMotion: ReduceMotion.System } as const;

// How strongly what scrolls under the bar is blurred (expo-blur, 1-100).
const TAB_BAR_BLUR = 14;

/**
 * The tab bar's body: a rounded bar of glass (owner: mostly white, with a
 * faint show of what scrolls under it) and a hairline round it. No shade
 * under it (owner). The scan button is not cut into it; it sits on top of the
 * bar and casts its own shadow.
 */
export function TabBarBackground() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const h = TAB_BAR_HEIGHT;
  const r = TAB_BAR_RADIUS;
  const x0 = TAB_BAR_SIDE_MARGIN;
  const x1 = width - TAB_BAR_SIDE_MARGIN;

  // The pill's two edges, each on its own spring. -1 until the bar has a width.
  const left = useSharedValue(-1);
  const right = useSharedValue(-1);
  useAnimatedReaction(
    () => ({ slot: activeTabSlot.value, width }),
    (now, before) => {
      if (now.width <= 0) return;
      const place = (now.width - 2 * TAB_BAR_SIDE_MARGIN) / SLOTS;
      const to = TAB_BAR_SIDE_MARGIN + place * (now.slot + 0.5) - PILL_WIDTH / 2;
      // First time, or the bar changed width: just be there.
      if (left.value < 0 || !before || before.width !== now.width) {
        left.value = to;
        right.value = to + PILL_WIDTH;
        return;
      }
      const forward = to > left.value;
      left.value = withSpring(to, forward ? TRAIL : LEAD);
      right.value = withSpring(to + PILL_WIDTH, forward ? LEAD : TRAIL);
    },
    [width],
  );
  const pillStyle = useAnimatedStyle(() => ({
    opacity: left.value < 0 ? 0 : 1,
    left: left.value,
    // Never thinner than its own height, however the springs cross.
    width: Math.max(PILL_HEIGHT, right.value - left.value),
  }));

  return (
    <View pointerEvents="none" onLayout={onLayout} style={{ position: "absolute", left: 0, right: 0, top: 0, height: h }}>
      {/* The bar itself, with a hairline round it so its edge shows even over a white card. */}
      {width > 0 ? (
        <View style={{ position: "absolute", top: 0, left: x0, width: x1 - x0, height: h, borderRadius: r, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE }}>
          {/* "light", never "default", which goes dark with the phone's appearance. */}
          <BlurView intensity={TAB_BAR_BLUR} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: TAB_BAR_GLASS }]} />
        </View>
      ) : null}
      <Animated.View style={[{ position: "absolute", top: (h - PILL_HEIGHT) / 2, height: PILL_HEIGHT, borderRadius: PILL_HEIGHT / 2, backgroundColor: TAB_PILL }, pillStyle]} />
    </View>
  );
}
