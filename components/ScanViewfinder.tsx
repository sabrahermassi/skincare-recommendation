import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Mask, Path, Rect, Stop } from "react-native-svg";

import { Text } from "@/components/Text";
import { TERRACOTTA } from "@/components/shell/shared";
import { CAMERA_STAGE, CANVAS, INK, SCANNER_FRAME, TYPE, withAlpha } from "@/lib/tokens";

/**
 * The live scanner's framing: the camera dimmed outside a rounded window, cream
 * corners, a slow terracotta line that sweeps the window, and a chip with the
 * instruction underneath (not laid over the camera image).
 *
 * `locked` is the moment a barcode has been read: the corners close in a touch
 * and turn terracotta while the line fades, before the status panel takes over.
 * With Reduce Motion on, the line stays still in the middle and the lock is
 * instant.
 */

const SIDE = 33;
const TOP_GAP = 24;
const CORNER_LENGTH = 40;
const CORNER_RADIUS = 18;
const CORNER_STROKE = 4;
const LINE_BAND = 56;
const LINE_INSET = 16;
const SWEEP_MS = 2200;
const LOCK_MS = 220;
const CHIP_HEIGHT = 36;
const CHIP_GAP = 14;
const SCRIM_ALPHA = 0.6;

/** Vertical room the chip takes below the window, for the caller's own layout. */
const CHIP_SPACE = CHIP_HEIGHT + CHIP_GAP;

function cornerPaths(w: number, h: number) {
  const s = CORNER_STROKE / 2;
  const L = CORNER_LENGTH;
  const r = CORNER_RADIUS;
  const x0 = s;
  const y0 = s;
  const x1 = w - s;
  const y1 = h - s;
  return [
    `M${x0} ${y0 + L}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}H${x0 + L}`,
    `M${x1 - L} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y0 + L}`,
    `M${x1} ${y1 - L}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x1 - L}`,
    `M${x0 + L} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y1 - L}`,
  ];
}

function Corners({ width, height, color }: { width: number; height: number; color: string }) {
  return (
    <Svg width={width} height={height}>
      {cornerPaths(width, height).map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={CORNER_STROKE} strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );
}

export function ScanViewfinder({
  topInset,
  bottomInset,
  locked,
}: {
  /** Distance from the top of the stage to leave clear (safe area, banner). */
  topInset: number;
  /** Distance from the bottom of the stage to leave clear (switcher). */
  bottomInset: number;
  locked: boolean;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [sweep] = useState(() => new Animated.Value(0));
  const [lock] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);
  const useNativeDriver = Platform.OS !== "web";

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      sweep.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver }),
        Animated.timing(sweep, { toValue: 0, duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, sweep, useNativeDriver]);

  useEffect(() => {
    Animated.timing(lock, {
      toValue: locked ? 1 : 0,
      duration: reduceMotion ? 0 : LOCK_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    }).start();
  }, [locked, reduceMotion, lock, useNativeDriver]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  const frameTop = topInset + TOP_GAP;
  const frameLeft = SIDE;
  const frameWidth = size ? size.w - SIDE * 2 : 0;
  const frameHeight = size ? size.h - frameTop - bottomInset - CHIP_SPACE : 0;
  const ready = size !== null && frameWidth > 0 && frameHeight > CORNER_LENGTH * 2;
  const lineWidth = frameWidth - LINE_INSET * 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onLayout}>
      {ready && size ? (
        <>
          {/* Decorative: nothing here is announced or touchable. */}
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
              <Defs>
                <Mask id="scan-window" x={0} y={0} width={size.w} height={size.h}>
                  <Rect x={0} y={0} width={size.w} height={size.h} fill="white" />
                  <Rect
                    x={frameLeft}
                    y={frameTop}
                    width={frameWidth}
                    height={frameHeight}
                    rx={CORNER_RADIUS + 2}
                    fill="black"
                  />
                </Mask>
              </Defs>
              <Rect
                x={0}
                y={0}
                width={size.w}
                height={size.h}
                fill={withAlpha(CAMERA_STAGE, SCRIM_ALPHA)}
                mask="url(#scan-window)"
              />
            </Svg>

            <View style={{ position: "absolute", left: frameLeft, top: frameTop, width: frameWidth, height: frameHeight }}>
              {/* The sweeping line, kept inside the window. */}
              <Animated.View
                style={{
                  position: "absolute",
                  left: LINE_INSET,
                  top: -LINE_BAND / 2,
                  opacity: lock.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                  transform: [
                    {
                      translateY: sweep.interpolate({
                        inputRange: [0, 1],
                        outputRange: [LINE_INSET, frameHeight - LINE_INSET],
                      }),
                    },
                  ],
                }}
              >
                <Svg width={lineWidth} height={LINE_BAND}>
                  <Defs>
                    <LinearGradient id="scan-glow" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor={TERRACOTTA} stopOpacity={0} />
                      <Stop offset="0.5" stopColor={TERRACOTTA} stopOpacity={0.32} />
                      <Stop offset="1" stopColor={TERRACOTTA} stopOpacity={0} />
                    </LinearGradient>
                  </Defs>
                  <Rect x={0} y={0} width={lineWidth} height={LINE_BAND} fill="url(#scan-glow)" />
                  <Rect x={0} y={LINE_BAND / 2 - 1} width={lineWidth} height={2} rx={1} fill={TERRACOTTA} />
                </Svg>
              </Animated.View>

              {/* Cream corners that hand over to terracotta ones when locked. */}
              <Animated.View
                style={{
                  ...StyleSheet.absoluteFill,
                  transform: [{ scale: lock.interpolate({ inputRange: [0, 1], outputRange: [1, 0.965] }) }],
                }}
              >
                <Animated.View
                  style={{
                    ...StyleSheet.absoluteFill,
                    opacity: lock.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                  }}
                >
                  <Corners width={frameWidth} height={frameHeight} color={SCANNER_FRAME} />
                </Animated.View>
                <Animated.View style={{ ...StyleSheet.absoluteFill, opacity: lock }}>
                  <Corners width={frameWidth} height={frameHeight} color={TERRACOTTA} />
                </Animated.View>
              </Animated.View>
            </View>
          </View>

          {/* The instruction sits under the window, not on the camera image. Not
              inside the decorative layer above, so it stays readable to a
              screen reader. */}
          <Animated.View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: frameTop + frameHeight + CHIP_GAP,
              alignItems: "center",
              opacity: lock.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            }}
          >
            <View
              style={{
                height: CHIP_HEIGHT,
                paddingHorizontal: 16,
                borderRadius: CHIP_HEIGHT / 2,
                justifyContent: "center",
                backgroundColor: withAlpha(CANVAS, 0.95),
              }}
            >
              <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: INK }}>
                Position barcode or ingredient list in the frame
              </Text>
            </View>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}
