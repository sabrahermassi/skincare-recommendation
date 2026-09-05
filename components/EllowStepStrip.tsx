import { Image } from "expo-image";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";

import { EllowMarkBrackets } from "@/components/EllowMark";
import { Text } from "@/components/Text";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

/**
 * The three-step strip: scan the product -> get a match score -> see every
 * ingredient, the app's whole loop in three tiles. Per
 * `design_handoff_ellow_welcome/README.md`, every animated part of the strip
 * is driven off ONE 7.5s clock (`useStepClock` below) — the ring's sweep is
 * deliberately phased to start the moment step 2 lands rather than running on
 * its own timer, because an independent loop let it drift out of sync, so the
 * tile often arrived already green and the count-up stopped meaning anything.
 *
 * Resting state (reduced motion, or a paused/frozen frame) is the finished
 * design — all three tiles visible, ring green at 84 — never a blank strip.
 * `RESTING_PROGRESS` sits inside the one window where every element agrees
 * (60%-84%) so that holds even before the entrance animation has run.
 */
const CYCLE_MS = 7500;
const RESTING_PROGRESS = 0.7;
const BEAM_MS = 2400;

function useStepClock() {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(RESTING_PROGRESS);

  useEffect(() => {
    if (reducedMotion) return;
    // Snap to a real cycle start first — animating the resting value (0.7)
    // up to 1 would take the full 7.5s to cover just that last 30%, playing
    // the tail of the first cycle in slow motion.
    progress.value = 0;
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
  }, [reducedMotion, progress]);

  return progress;
}

function useScanBeamStyle() {
  const reducedMotion = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    t.value = 0;
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: BEAM_MS, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
  }, [reducedMotion, t]);

  return useAnimatedStyle(() => ({
    transform: [
      {
        translateY: reducedMotion
          ? 0
          : interpolate(t.value, [0, 0.5, 1], [-23, 23, -23]),
      },
    ],
  }));
}

// cl-s1/-s2/-s3: arrive in order, hold together, clear, brief empty beat.
const S1 = { input: [0, 0.05, 0.84, 0.93, 1], opacity: [0, 1, 1, 0, 0], translateY: [10, 0, 0, -6, -6] };
const S2 = {
  input: [0, 0.14, 0.2, 0.86, 0.95, 1],
  opacity: [0, 0, 1, 1, 0, 0],
  translateY: [10, 10, 0, 0, -6, -6],
};
const S3 = {
  input: [0, 0.32, 0.38, 0.88, 0.97, 1],
  opacity: [0, 0, 1, 1, 0, 0],
  translateY: [10, 10, 0, 0, -6, -6],
};

// cl-ring: circumference is ~94.25, so the dash length IS the percentage.
const RING_INPUT = [0, 0.2, 0.32, 0.46, 0.6, 1];
const RING_DASH = [9, 9, 23, 53, 79, 79];
const RING_COLOR = ["#DE7E93", "#DE7E93", "#DE7E93", "#E2A45E", "#79A98A", "#79A98A"];

const N1 = { input: [0, 0.26, 0.33, 1], opacity: [1, 1, 0, 0] };
const N2 = { input: [0, 0.32, 0.38, 0.5, 0.56, 1], opacity: [0, 0, 1, 1, 0, 0] };
const N3 = { input: [0, 0.54, 0.6, 1], opacity: [0, 0, 1, 1] };

const SERUM_HEIGHT = 53;
const SERUM_WIDTH = SERUM_HEIGHT * (252 / 616);

// All three tiles read the same clock, so it is created once by the strip
// and threaded down via context rather than each tile starting its own.
const StepClockContext = createContext<ReturnType<typeof useSharedValue<number>> | null>(null);

function useStepClockContext() {
  const ctx = useContext(StepClockContext);
  if (!ctx) throw new Error("StepTile must render inside EllowStepStrip");
  return ctx;
}

function StepTile({
  step,
  children,
  label,
}: {
  step: { input: number[]; opacity: number[]; translateY: number[] };
  children: ReactNode;
  label: string;
}) {
  const progress = useStepClockContext();
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, step.input, step.opacity),
    transform: [{ translateY: interpolate(progress.value, step.input, step.translateY) }],
  }));

  return (
    <Animated.View
      style={[
        { flex: 1, alignItems: "center", gap: 10, paddingTop: 2, paddingHorizontal: 6 },
        style,
      ]}
    >
      <View style={{ height: 78, alignItems: "center", justifyContent: "center" }}>{children}</View>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          letterSpacing: 13 * -0.006,
          color: "#463F57",
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Animated.View>
  );
}

export function EllowStepStrip() {
  const progress = useStepClock();
  const beamStyle = useScanBeamStyle();

  const ringProps = useAnimatedProps(() => ({
    strokeDasharray: `${interpolate(progress.value, RING_INPUT, RING_DASH)} 94`,
    stroke: interpolateColor(progress.value, RING_INPUT, RING_COLOR),
  }));
  const n1Props = useAnimatedProps(() => ({
    opacity: interpolate(progress.value, N1.input, N1.opacity),
  }));
  const n2Props = useAnimatedProps(() => ({
    opacity: interpolate(progress.value, N2.input, N2.opacity),
  }));
  const n3Props = useAnimatedProps(() => ({
    opacity: interpolate(progress.value, N3.input, N3.opacity),
  }));

  return (
    <StepClockContext.Provider value={progress}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 14,
          paddingTop: 30,
          paddingHorizontal: 24,
        }}
      >
        <StepTile step={S1} label={"Scan the\nproduct"}>
          <View style={{ width: 46, height: 78, alignItems: "center", justifyContent: "center" }}>
            <Svg
              width={46}
              height={78}
              viewBox="0 0 110 110"
              style={{ position: "absolute" }}
              fill="none"
            >
              <EllowMarkBrackets />
            </Svg>
            <Image
              source={require("@/assets/images/v2/btl-serum.png")}
              contentFit="contain"
              style={{ width: SERUM_WIDTH, height: SERUM_HEIGHT }}
            />
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: 13,
                  right: 13,
                  top: 38,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: "#8B7FB6",
                  shadowColor: "#8B7FB6",
                  shadowOpacity: 0.75,
                  shadowRadius: 7,
                  shadowOffset: { width: 0, height: 0 },
                },
                beamStyle,
              ]}
            />
          </View>
        </StepTile>

        <StepTile step={S2} label={"Get a match\nscore"}>
          <Svg width={62} height={62} viewBox="0 0 40 40">
            <Circle cx={20} cy={20} r={15} fill="none" stroke="#DDEAE2" strokeWidth={5} />
            <AnimatedCircle
              cx={20}
              cy={20}
              r={15}
              fill="none"
              strokeWidth={5}
              strokeLinecap="round"
              transform="rotate(-90 20 20)"
              animatedProps={ringProps}
            />
            <AnimatedSvgText
              x={20}
              y={24.5}
              textAnchor="middle"
              fontFamily="-apple-system, system-ui, sans-serif"
              fontSize={12}
              fontWeight="600"
              fill="#B4566B"
              animatedProps={n1Props}
            >
              18
            </AnimatedSvgText>
            <AnimatedSvgText
              x={20}
              y={24.5}
              textAnchor="middle"
              fontFamily="-apple-system, system-ui, sans-serif"
              fontSize={12}
              fontWeight="600"
              fill="#A9713C"
              animatedProps={n2Props}
            >
              56
            </AnimatedSvgText>
            <AnimatedSvgText
              x={20}
              y={24.5}
              textAnchor="middle"
              fontFamily="-apple-system, system-ui, sans-serif"
              fontSize={12}
              fontWeight="600"
              fill="#463F57"
              animatedProps={n3Props}
            >
              84
            </AnimatedSvgText>
          </Svg>
        </StepTile>

        <StepTile step={S3} label={"See every\ningredient"}>
          <Svg width={60} height={60} viewBox="0 0 40 40">
            <Path
              d="M14 12h18M14 20h18M14 28h12"
              stroke="#463F57"
              strokeWidth={2.4}
              strokeLinecap="round"
            />
            <Circle cx={7} cy={12} r={3} fill="#6FA783" />
            <Circle cx={7} cy={20} r={3} fill="#6FA783" />
            <Circle cx={7} cy={28} r={3} fill="#E2A45E" />
          </Svg>
        </StepTile>
      </View>
    </StepClockContext.Provider>
  );
}
