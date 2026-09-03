import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

/**
 * The bubble motion layer for the Welcome screen's avatar — ported from
 * `design_handoff_skintel_bubbles`. Purely decorative (`pointerEvents="none"`):
 * eight soap bubbles drift, swell, pop and refill around the avatar, plus a
 * breathing halo behind it.
 *
 * Every bubble's resting value (progress 0) IS its visible steady frame —
 * opacity 1, no drift, no scale — so a device with reduced motion enabled
 * simply never starts the loop and is left looking at bubbles sitting calmly
 * around the avatar, never an empty field. The burst ring is the one
 * exception: it legitimately rests hidden, since a pop is inherently
 * transient and the steady bubbles already carry the design.
 */

type BubbleSpec = {
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  tint: string;
  rim: string;
};

const BUBBLES: BubbleSpec[] = [
  { x: 6, y: 24, size: 26, delay: 0.8, duration: 4.2, tint: "#BFDCE8", rim: "#9FC6D6" },
  { x: 86, y: 14, size: 34, delay: 1.5, duration: 5.0, tint: "#CFE3EC", rim: "#A8CCDA" },
  { x: 96, y: 48, size: 19, delay: 2.4, duration: 3.8, tint: "#D8D2EE", rim: "#B3A9DC" },
  { x: 78, y: 80, size: 28, delay: 1.1, duration: 4.6, tint: "#C7E2E0", rim: "#9CC8C4" },
  { x: 14, y: 84, size: 21, delay: 3.0, duration: 4.0, tint: "#D8D2EE", rim: "#B3A9DC" },
  { x: 1, y: 62, size: 31, delay: 2.0, duration: 5.4, tint: "#BFDCE8", rim: "#9FC6D6" },
  { x: 48, y: -3, size: 17, delay: 3.5, duration: 3.6, tint: "#CFE3EC", rim: "#A8CCDA" },
  { x: 62, y: 4, size: 14, delay: 4.1, duration: 3.4, tint: "#C7E2E0", rim: "#9CC8C4" },
];

// bb-float: rest -> drift up while swelling (52%) -> swell hard, the
// about-to-go beat (64%) -> vanish (70%) -> stay gone, sinking back below
// rest (80%) -> fade in at rest and hold (92% -> 100%).
const FLOAT_INPUT = [0, 0.52, 0.64, 0.7, 0.8, 0.92, 1];
const FLOAT_OPACITY = [1, 1, 1, 0, 0, 1, 1];
const FLOAT_TRANSLATE = [0, -16, -20, -22, 8, 0, 0];
const FLOAT_SCALE = [1, 1.05, 1.24, 0.3, 0.4, 1, 1];

// bb-burst fires its ring at 70% — the exact frame the bubble disappears.
// Shares the bubble's own progress value, which is what keeps them locked.
const BURST_INPUT = [0, 0.62, 0.7, 0.82, 1];
const BURST_OPACITY = [0, 0, 0.95, 0, 0];
const BURST_TRANSLATE = [-18, -18, -20, -30, -30];
const BURST_SCALE = [0.35, 0.35, 1, 1.5, 1.5];

function Bubble({
  x,
  y,
  size,
  delay,
  duration,
  tint,
  rim,
  animate,
}: BubbleSpec & { animate: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!animate) return;
    // withTiming always animates FROM the current value, so a bare repeat
    // would run 0->1 once and then sit at 1 forever (1->1 is a no-op). The
    // zero-duration snap back to 0 is what makes this a real repeating cycle.
    progress.value = withDelay(
      delay * 1000,
      withRepeat(
        withSequence(
          withTiming(1, { duration: duration * 1000, easing: Easing.linear }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      )
    );
  }, [animate, delay, duration, progress]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, FLOAT_INPUT, FLOAT_OPACITY),
    transform: [
      { translateY: interpolate(progress.value, FLOAT_INPUT, FLOAT_TRANSLATE) },
      { scale: interpolate(progress.value, FLOAT_INPUT, FLOAT_SCALE) },
    ],
  }));

  const burstStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, BURST_INPUT, BURST_OPACITY),
    transform: [
      { translateY: interpolate(progress.value, BURST_INPUT, BURST_TRANSLATE) },
      { scale: interpolate(progress.value, BURST_INPUT, BURST_SCALE) },
    ],
  }));

  const burstSize = size * 1.5;

  return (
    <>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: `${x}%`,
            top: `${y}%`,
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
          },
          bubbleStyle,
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 40 40">
          <Circle cx={20} cy={20} r={17.5} fill={tint} fillOpacity={0.55} stroke={rim} strokeWidth={2.2} />
          <Ellipse
            cx={14}
            cy={13.5}
            rx={5}
            ry={3.6}
            fill="#FFFFFF"
            fillOpacity={0.85}
            transform="rotate(-28 14 13.5)"
          />
          <Circle cx={26.5} cy={25.5} r={2} fill="#FFFFFF" fillOpacity={0.5} />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: "absolute",
            left: `${x}%`,
            top: `${y}%`,
            width: burstSize,
            height: burstSize,
            marginLeft: -burstSize / 2,
            marginTop: -burstSize / 2,
          },
          burstStyle,
        ]}
      >
        <Svg width={burstSize} height={burstSize} viewBox="0 0 60 60">
          <Circle
            cx={30}
            cy={30}
            r={16}
            fill="none"
            stroke={rim}
            strokeWidth={2.4}
            strokeDasharray="5 7"
            strokeLinecap="round"
          />
          <Circle cx={30} cy={8} r={2.6} fill={rim} />
          <Circle cx={52} cy={30} r={2.2} fill={rim} />
          <Circle cx={30} cy={52} r={2.6} fill={rim} />
          <Circle cx={8} cy={30} r={2.2} fill={rim} />
        </Svg>
      </Animated.View>
    </>
  );
}

/**
 * Positioned over the avatar with an asymmetric bleed — the bottom is only
 * 8px (not 38px like the other three sides), because the lockup starts just
 * 24px below the avatar row and a symmetric bleed would let a low bubble
 * land on the wordmark. Constrain the field; don't nudge individual bubbles.
 */
export function BubbleField() {
  const reducedMotion = useReducedMotion();

  return (
    <View
      style={{ position: "absolute", top: -38, right: -38, bottom: -8, left: -38 }}
      pointerEvents="none"
    >
      {BUBBLES.map((bubble, index) => (
        <Bubble key={index} {...bubble} animate={!reducedMotion} />
      ))}
    </View>
  );
}

/** A breathing radial-gradient halo behind the avatar. */
export function AvatarHalo() {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    progress.value = withDelay(
      1000,
      withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }), -1, true)
    );
  }, [reducedMotion, progress]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.3, 0.6]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.05]) }],
  }));

  return (
    <Animated.View
      style={[{ position: "absolute", left: -26, top: -26, width: 204, height: 204 }, haloStyle]}
      pointerEvents="none"
    >
      <Svg width={204} height={204} viewBox="0 0 204 204">
        <Defs>
          <RadialGradient id="welcomeHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#C4DEE8" stopOpacity={0.55} />
            <Stop offset="0.68" stopColor="#C4DEE8" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={102} cy={102} r={102} fill="url(#welcomeHalo)" />
      </Svg>
    </Animated.View>
  );
}
