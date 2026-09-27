import { useState, type ReactNode } from "react";
import { Animated, PanResponder, Platform, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { DANGER, VERDICT } from "@/lib/tokens";

// How far the card slides to show the bin, and the gap left between them.
const ACTION_WIDTH = 84;
const ACTION_GAP = 12;
const OPEN = -(ACTION_WIDTH + ACTION_GAP);
// A drag counts as a swipe only once it is clearly sideways, so the list still scrolls.
const SWIPE_START = 8;
// How fast a flick (points per millisecond) opens or closes the card on its own.
const FLICK = 0.3;

/**
 * A card that slides left to show a bin behind it, like a row in Mail. The bin
 * doesn't delete: it asks (`onDelete` opens the confirmation), and the card
 * slides back as it does.
 *
 * Built on React Native's own responder rather than the gesture library, which
 * this app doesn't otherwise load. A swipe is invisible to VoiceOver, but the
 * bin stays in the accessibility tree while the card covers it, so VoiceOver
 * reaches "Delete …" without swiping.
 */
export function SwipeToDelete({ label, onDelete, children }: { label: string; onDelete: () => void; children: ReactNode }) {
  const [offset] = useState(() => new Animated.Value(0));
  const [swipe] = useState(() => swipeFor(offset));
  const ask = () => {
    swipe.close();
    onDelete();
  };

  return (
    <View>
      <Pressable
        onPress={ask}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${label}`}
        className="active:opacity-80"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: ACTION_WIDTH,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 24,
          backgroundColor: VERDICT.low.tint,
        }}
      >
        <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 7h16M9.5 7V4.8c0-.4.4-.8.8-.8h3.4c.4 0 .8.4.8.8V7M6.2 7l.9 12.2c.1.9.8 1.6 1.7 1.6h6.4c.9 0 1.6-.7 1.7-1.6L17.8 7M10 11v6M14 11v6"
            stroke={DANGER}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
      <Animated.View {...swipe.responder.panHandlers} style={{ transform: [{ translateX: offset }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

/**
 * The drag itself, kept outside the component: where the card last came to
 * rest is only read and written by the gesture, never by rendering.
 */
function swipeFor(offset: Animated.Value) {
  let resting = 0;
  const settle = (to: number) => {
    resting = to;
    Animated.spring(offset, { toValue: to, useNativeDriver: Platform.OS !== "web", bounciness: 0, speed: 18 }).start();
  };
  // Clearly sideways: the list keeps vertical drags, the card takes these.
  const sideways = (dx: number, dy: number) => Math.abs(dx) > SWIPE_START && Math.abs(dx) > Math.abs(dy);
  const responder = PanResponder.create({
    // Asked on the way down, before the card's own tap handling can keep the
    // touch: without capturing, the card held it and the swipe bounced back.
    onMoveShouldSetPanResponderCapture: (_, g) => sideways(g.dx, g.dy),
    onMoveShouldSetPanResponder: (_, g) => sideways(g.dx, g.dy),
    // Once swiping, the list can't take the gesture back mid-drag.
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => offset.setValue(Math.min(0, Math.max(OPEN * 1.2, resting + g.dx))),
    // Opens past a third of the bin's width, or on a quick flick left; a flick
    // right closes. A slow, short drag goes back to where it was.
    onPanResponderRelease: (_, g) => {
      const end = resting + g.dx;
      settle(g.vx < -FLICK ? OPEN : g.vx > FLICK ? 0 : end < OPEN / 3 ? OPEN : 0);
    },
    onPanResponderTerminate: () => settle(resting),
  });
  return { responder, close: () => settle(0) };
}
