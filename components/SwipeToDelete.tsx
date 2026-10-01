import { createContext, useContext, useState, type ReactNode } from "react";
import { Animated, PanResponder, Platform, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { reduceMotionNow } from "@/lib/reduce-motion";
import { Text } from "@/components/Text";
import { CARD_RADIUS, DESTRUCTIVE_OUTLINE, TYPE } from "@/lib/tokens";

// How far the card slides to show the bin (v7: 88pt, the bin sitting right
// behind the card rather than a gap away).
const ACTION_WIDTH = 88;
const ACTION_GAP = 0;
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
 *
 * Inside a `SwipeListScope` (see `useSwipeList`), a swipe holds the list still
 * while it lasts, and only one card is open at a time (owner: the page moved
 * up and down under a sideways swipe, which no other app does).
 */
export function SwipeToDelete({
  label,
  action = "Delete",
  onDelete,
  children,
}: {
  label: string;
  /** The word under the bin, and the start of its spoken label ("Remove" on Saved, which only takes it off the shelf). */
  action?: string;
  onDelete: () => void;
  children: ReactNode;
}) {
  const list = useContext(SwipeListContext);
  const [offset] = useState(() => new Animated.Value(0));
  const [swipe] = useState(() => swipeFor(offset, list));
  const ask = () => {
    swipe.close();
    onDelete();
  };

  return (
    <View>
      <Pressable
        onPress={ask}
        accessibilityRole="button"
        accessibilityLabel={`${action} ${label}`}
        className="active:opacity-80"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: ACTION_WIDTH + CARD_RADIUS,
          paddingLeft: CARD_RADIUS,
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
        }}
      >
        {/* The red wash behind the card shows only while it is slid open (v9):
            at rest it would peep out at the card's rounded corners. Faded,
            never hidden, so the bin stays reachable for VoiceOver. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            borderTopRightRadius: CARD_RADIUS,
            borderBottomRightRadius: CARD_RADIUS,
            backgroundColor: DESTRUCTIVE_OUTLINE.fill,
            opacity: offset.interpolate({ inputRange: [-SWIPE_START, 0], outputRange: [1, 0], extrapolate: "clamp" }),
          }}
        />
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 7h16M9.5 7V4.8c0-.4.4-.8.8-.8h3.4c.4 0 .8.4.8.8V7M6.2 7l.9 12.2c.1.9.8 1.6 1.7 1.6h6.4c.9 0 1.6-.7 1.7-1.6L17.8 7M10 11v6M14 11v6"
            stroke={DESTRUCTIVE_OUTLINE.label}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: DESTRUCTIVE_OUTLINE.label }}>{action}</Text>
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
function swipeFor(offset: Animated.Value, list: SwipeList | null) {
  let resting = 0;
  const settle = (to: number) => {
    resting = to;
    // Told first, whatever the motion setting: a list left waiting would stay
    // unable to scroll.
    list?.rested(close, to !== 0);
    // With Reduce Motion on, the card lands where it rests without springing.
    if (reduceMotionNow()) {
      offset.setValue(to);
      return;
    }
    Animated.spring(offset, { toValue: to, useNativeDriver: Platform.OS !== "web", bounciness: 0, speed: 18 }).start();
  };
  const close = () => settle(0);
  // Clearly sideways: the list keeps vertical drags, the card takes these.
  const sideways = (dx: number, dy: number) => Math.abs(dx) > SWIPE_START && Math.abs(dx) > Math.abs(dy);
  const responder = PanResponder.create({
    // Asked on the way down, before the card's own tap handling can keep the
    // touch: without capturing, the card held it and the swipe bounced back.
    onMoveShouldSetPanResponderCapture: (_, g) => sideways(g.dx, g.dy),
    onMoveShouldSetPanResponder: (_, g) => sideways(g.dx, g.dy),
    // Once swiping, the list can't take the gesture back mid-drag.
    onPanResponderTerminationRequest: () => false,
    // The list holds still for the length of the swipe, and closes any other open card.
    onPanResponderGrant: () => list?.began(close),
    onPanResponderMove: (_, g) => offset.setValue(Math.min(0, Math.max(OPEN * 1.2, resting + g.dx))),
    // Opens past a third of the bin's width, or on a quick flick left; a flick
    // right closes. A slow, short drag goes back to where it was.
    onPanResponderRelease: (_, g) => {
      const end = resting + g.dx;
      settle(g.vx < -FLICK ? OPEN : g.vx > FLICK ? 0 : end < OPEN / 3 ? OPEN : 0);
    },
    onPanResponderTerminate: () => settle(resting),
  });
  return { responder, close };
}

/** What a list of swipeable cards shares: its scroll lock, and which card is open. */
type SwipeList = {
  began: (close: () => void) => void;
  rested: (close: () => void, open: boolean) => void;
  closeOpen: () => void;
};

const SwipeListContext = createContext<SwipeList | null>(null);

/**
 * For a scrolling list of `SwipeToDelete` cards: `scrollEnabled` and
 * `onScrollBeginDrag` go on the ScrollView, and `SwipeListScope` with `list`
 * wraps the cards.
 * While a card is being swiped the list can't scroll, so a slightly diagonal
 * swipe no longer drags the page; starting a swipe on one card, or scrolling
 * the list, closes the card that was open.
 */
export function useSwipeList() {
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [list] = useState<SwipeList>(() => {
    let open: (() => void) | null = null;
    return {
      began: (close) => {
        if (open && open !== close) open();
        setScrollEnabled(false);
      },
      rested: (close, isOpen) => {
        setScrollEnabled(true);
        if (isOpen) open = close;
        else if (open === close) open = null;
      },
      closeOpen: () => open?.(),
    };
  });
  return { scrollEnabled, onScrollBeginDrag: list.closeOpen, list };
}

/** Wraps a list's `SwipeToDelete` cards so they share its scroll lock (`useSwipeList`). */
export function SwipeListScope({ list, children }: { list: SwipeList; children: ReactNode }) {
  return <SwipeListContext.Provider value={list}>{children}</SwipeListContext.Provider>;
}
