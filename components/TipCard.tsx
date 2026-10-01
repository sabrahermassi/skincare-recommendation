import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Platform, Pressable, View } from "react-native";
import Svg, { Path, Polygon } from "react-native-svg";

import { Text } from "@/components/Text";
import { haptic } from "@/lib/haptics";
import { useNoteTextStyle } from "@/lib/note-font";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { anotherTip, localDay, tipOfTheDay } from "@/lib/tips";
import { ICON_MUTED, INK, MUTED, SPACE, TIP_NOTE, TYPE, WHITE } from "@/lib/tokens";

// The tape across the card's top (v7): 80 × 22, 10pt above the edge, a few
// degrees off straight, its short ends cut in a small zigzag like scissors.
const TAPE = { width: 80, height: 22, rise: 10, tilt: "-4deg" } as const;
const TAPE_POINTS = [
  [0, 0], [4, 16.7], [0, 33.3], [4, 50], [0, 66.7], [4, 83.3], [0, 100],
  [100, 100], [96, 83.3], [100, 66.7], [96, 50], [100, 33.3], [96, 16.7], [100, 0],
]
  .map(([x, y]) => `${(x / 100) * TAPE.width},${(y / 100) * TAPE.height}`)
  .join(" ");

// The shuffle's timing and easing (v7 hand-off).
const EASE = Easing.bezier(0.3, 0.7, 0.2, 1);
const WIGGLE_MS = 720;
const ICON_SPIN_MS = 600;
const OUT_MS = 220;
const WRITE_IN_MS = 650;
const SPARKLE_MS = 700;
const SPARKLE_START_MS = 140;
const SPARKLE_STAGGER_MS = 70;
// Where the four sparkles sit around the card, and their sizes.
const SPARKLES = [
  { size: 12, style: { top: -8, left: -6 } },
  { size: 14, style: { top: "40%", right: -10 } },
  { size: 10, style: { bottom: 14, left: -10 } },
  { size: 12, style: { bottom: -8, right: 28 } },
] as const;

/**
 * Tip of the day on Home (v7): a white paper note held on by a strip of tape,
 * "Tip of the day" and "Tap for another" across the top, the tip in
 * handwriting. It opens on the day's tip; a tap shuffles to another with a
 * wiggle from the tape, a spin of the shuffle icon, a few sparkles, the old
 * tip lifting away and the new one written in from the left. With Reduce
 * Motion on, the text just changes. Large text, Bold Text or a font not loaded
 * yet show the tip in the UI font (`useNoteTextStyle`), so it always reads.
 */
export function TipCard() {
  const [tip, setTip] = useTipOfTheDay();
  const style = useNoteTextStyle(tip, "tip");
  const busy = useRef(false);
  const [width, setWidth] = useState(0);
  const [motion] = useState(() => ({
    wiggle: new Animated.Value(0),
    spin: new Animated.Value(0),
    out: new Animated.Value(0),
    write: new Animated.Value(1),
    sparkles: SPARKLES.map(() => new Animated.Value(0)),
  }));

  const shuffle = () => {
    if (busy.current) return;
    haptic.select();
    const next = anotherTip(tip);
    if (reduceMotionNow()) {
      setTip(next);
      return;
    }
    busy.current = true;
    const native = Platform.OS !== "web";
    const { wiggle, spin, out, write, sparkles } = motion;
    [wiggle, spin, out].forEach((value) => value.setValue(0));
    sparkles.forEach((value) => value.setValue(0));
    Animated.parallel([
      Animated.timing(wiggle, { toValue: 1, duration: WIGGLE_MS, easing: EASE, useNativeDriver: native }),
      Animated.timing(spin, { toValue: 1, duration: ICON_SPIN_MS, easing: EASE, useNativeDriver: native }),
      Animated.sequence([
        Animated.delay(SPARKLE_START_MS),
        Animated.stagger(
          SPARKLE_STAGGER_MS,
          sparkles.map((value) => Animated.timing(value, { toValue: 1, duration: SPARKLE_MS, easing: Easing.out(Easing.quad), useNativeDriver: native })),
        ),
      ]),
    ]).start();
    // The old tip lifts away; at the swap point the new one is written in.
    Animated.timing(out, { toValue: 1, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: native }).start(() => {
      setTip(next);
      write.setValue(0);
      out.setValue(0);
      // Width is layout, which the native driver can't animate.
      Animated.timing(write, { toValue: 1, duration: WRITE_IN_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(() => {
        busy.current = false;
      });
    });
  };

  const { wiggle, spin, out, write, sparkles } = motion;
  const cardTransform = [
    { translateY: wiggle.interpolate({ inputRange: [0, 0.25, 0.6, 0.82, 1], outputRange: [0, 2, -3, 0, 0] }) },
    { rotate: wiggle.interpolate({ inputRange: [0, 0.25, 0.6, 0.82, 1], outputRange: ["0deg", "-3deg", "2.5deg", "-1deg", "0deg"] }) },
    { scale: wiggle.interpolate({ inputRange: [0, 0.25, 0.6, 0.82, 1], outputRange: [1, 0.96, 1.03, 1, 1] }) },
  ];

  return (
    <View style={{ marginTop: SPACE.section }}>
      <Pressable onPress={shuffle} accessibilityRole="button" accessibilityLabel="Show another tip" accessibilityHint={`Tip of the day: ${tip}`}>
        <Animated.View
          style={{
            borderRadius: TIP_NOTE.radius,
            backgroundColor: WHITE,
            boxShadow: TIP_NOTE.shadow,
            paddingTop: SPACE.section,
            paddingHorizontal: SPACE.gutter,
            paddingBottom: SPACE.gutter,
            // The wiggle pivots on the tape.
            transformOrigin: "50% 0%",
            transform: cardTransform,
          }}
        >
          <Svg
            width={TAPE.width}
            height={TAPE.height}
            style={{ position: "absolute", top: -TAPE.rise, alignSelf: "center", transform: [{ rotate: TAPE.tilt }] }}
          >
            <Polygon points={TAPE_POINTS} fill={TIP_NOTE.tape} />
          </Svg>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.text }}>
            <Text style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>Tip of the day</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
                <Ionicons name="shuffle" size={15} color={ICON_MUTED} />
              </Animated.View>
              <Text style={{ fontSize: TYPE.caption, color: ICON_MUTED }}>Tap for another</Text>
            </View>
          </View>

          {/* The tip, written in from the left: a window that widens over it,
              the text inside held at the full width so it never reflows. */}
          <View style={{ marginTop: SPACE.text, minHeight: TIP_NOTE.minHeight }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
            {/* Two views, since one can't take both drivers: the lift away runs
                natively, the widening window (layout) on the JS side. */}
            <Animated.View
              style={{
                opacity: out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [{ translateY: out.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
              }}
            >
              <Animated.View
                style={{
                  width: width > 0 ? write.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) : "100%",
                  overflow: "hidden",
                }}
              >
                <Text style={[style, { width: width > 0 ? width : undefined, color: INK }]}>{tip}</Text>
              </Animated.View>
            </Animated.View>
          </View>
        </Animated.View>

        {sparkles.map((value, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: "absolute",
              ...SPARKLES[i].style,
              opacity: value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
              transform: [
                { scale: value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1.25, 0.4] }) },
                { rotate: value.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) },
              ],
            }}
          >
            <Sparkle size={SPARKLES[i].size} />
          </Animated.View>
        ))}
      </Pressable>
    </View>
  );
}

/** A small four-point star. */
function Sparkle({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 0c.9 6.6 4.5 10.2 12 12-7.5 1.8-11.1 5.4-12 12-.9-6.6-4.5-10.2-12-12C7.5 10.2 11.1 6.6 12 0z" fill={TIP_NOTE.sparkle} />
    </Svg>
  );
}

/**
 * The tip showing: the day's tip to start, a shuffled one after a tap. Home
 * stays mounted across days, so when the app comes back to the front on a new
 * day it moves to that day's tip.
 */
function useTipOfTheDay(): [string, (tip: string) => void] {
  const [tip, setTip] = useState(() => tipOfTheDay());
  const day = useRef(localDay());
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || localDay() === day.current) return;
      day.current = localDay();
      setTip(tipOfTheDay());
    });
    return () => subscription.remove();
  }, []);
  return [tip, setTip];
}
