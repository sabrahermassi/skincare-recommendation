import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Mask, Path, Rect, Stop } from "react-native-svg";

import { TERRACOTTA } from "@/components/shell/shared";
import { CAMERA_STAGE, SCANNER_FRAME, withAlpha } from "@/lib/tokens";

/**
 * The live scanner's framing: the camera dimmed outside a rounded window, its
 * four corners drawn in cream, and a slow terracotta line that sweeps the
 * window. The photo camera draws the same window as a full thin outline and
 * without the line, so switching between the two does not move the frame.
 *
 * `locked` is the moment a barcode has been read. With a `target` (where the
 * camera saw the barcode) the window closes in on it — the dimming and the
 * outline follow — and the outline turns terracotta; without one the window
 * just tightens a touch. With Reduce Motion on, the line stays still in the
 * middle and the lock is instant.
 */

export type Box = { x: number; y: number; width: number; height: number };

/** How far the window sits in from each side; the mode pills line up with it. */
export const SCAN_SIDE_INSET = 33;
const SIDE = SCAN_SIDE_INSET;
const TOP_GAP = 24;
/** Gap between the top inset and the window, for anything placed inside it. */
export const SCAN_TOP_GAP = TOP_GAP;
const WINDOW_RADIUS = 28;
// The four-corner frame (barcode): each corner's arm and its stroke.
const CORNER_RADIUS = 20;
const CORNER_LENGTH = 40;
const CORNER_STROKE = 4;
const OUTLINE_WIDTH = 2.5;
const LINE_BAND = 56;
const LINE_INSET = 16;
const SWEEP_MS = 2200;
const LOCK_MS = 280;
const SCRIM_ALPHA = 0.6;
// Room left around the barcode when the window closes in on it, and the least
// it will close to (a tiny window reads as a glitch, not a lock).
const TARGET_PAD = 16;
const TARGET_MIN_WIDTH = 120;
const TARGET_MIN_HEIGHT = 84;
// With no target to close in on, the window tightens by this fraction.
const FALLBACK_TIGHTEN = 0.035;

type Rectangle = { x: number; y: number; w: number; h: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function usable(box: Box) {
  return [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 8 && box.height > 8;
}

/**
 * Turns what the camera reported into a box in the camera view's own
 * coordinates, or undefined when it reported nothing usable. Corner points are
 * preferred; `bounds` is documented as sometimes empty and not always the whole
 * barcode.
 */
export function barcodeBox(result: {
  bounds?: { origin: { x: number; y: number }; size: { width: number; height: number } };
  cornerPoints?: { x: number; y: number }[];
}): Box | undefined {
  const points = result.cornerPoints;
  if (points && points.length >= 3) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const box = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    if (usable(box)) return box;
  }
  const b = result.bounds;
  if (b) {
    const box = { x: b.origin.x, y: b.origin.y, width: b.size.width, height: b.size.height };
    if (usable(box)) return box;
  }
  return undefined;
}

function cornerPaths(w: number, h: number, r: number) {
  const s = CORNER_STROKE / 2;
  const L = Math.min(CORNER_LENGTH, w / 2, h / 2);
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

function Corners({ width, height, radius, color }: { width: number; height: number; radius: number; color: string }) {
  return (
    <Svg width={width} height={height}>
      {cornerPaths(width, height, radius).map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={CORNER_STROKE} strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );
}

/** Where the window should end up: around the barcode, padded, kept inside the window. */
function goalFor(window: Rectangle, target: Box | undefined): Rectangle {
  if (!target) {
    const dx = window.w * FALLBACK_TIGHTEN;
    const dy = window.h * FALLBACK_TIGHTEN;
    return { x: window.x + dx, y: window.y + dy, w: window.w - dx * 2, h: window.h - dy * 2 };
  }
  const w = Math.min(window.w, Math.max(TARGET_MIN_WIDTH, target.width + TARGET_PAD * 2));
  const h = Math.min(window.h, Math.max(TARGET_MIN_HEIGHT, target.height + TARGET_PAD * 2));
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  const x = Math.min(Math.max(cx - w / 2, window.x), window.x + window.w - w);
  const y = Math.min(Math.max(cy - h / 2, window.y), window.y + window.h - h);
  return { x, y, w, h };
}

export function ScanViewfinder({
  topInset,
  bottomInset,
  locked,
  target,
  frame = "corners",
  sweep: sweepLine = true,
  description = "Point the camera at a barcode",
  onWindow,
}: {
  /** Distance from the top of the stage to leave clear (safe area, banner). */
  topInset: number;
  /** Distance from the bottom of the stage to leave clear (switcher). */
  bottomInset: number;
  locked: boolean;
  /** Where the barcode was seen, for the window to close in on. */
  target?: Box;
  /** "corners" (barcode) or "full" (photo): the same window either way. */
  frame?: "corners" | "full";
  /** False for the photo camera: the same window, no sweeping line. */
  sweep?: boolean;
  /** What a screen reader is told is being looked for; null for none. */
  description?: string | null;
  /** Called with the window's rectangle, in this view's coordinates, whenever it is set or changes. */
  onWindow?: (window: Box) => void;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [sweep] = useState(() => new Animated.Value(0));
  const [lock] = useState(() => new Animated.Value(0));
  // 0 = the window, 1 = closed in on the barcode. Driven from JS: it moves
  // layout, which the native driver cannot.
  const [closing] = useState(() => new Animated.Value(0));
  const [closed, setClosed] = useState(0);
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
    const id = closing.addListener(({ value }) => setClosed(value));
    return () => closing.removeListener(id);
  }, [closing]);

  useEffect(() => {
    if (!sweepLine) return;
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
  }, [sweepLine, reduceMotion, sweep, useNativeDriver]);

  useEffect(() => {
    const duration = reduceMotion ? 0 : LOCK_MS;
    const easing = Easing.out(Easing.cubic);
    Animated.timing(lock, { toValue: locked ? 1 : 0, duration, easing, useNativeDriver }).start();
    Animated.timing(closing, { toValue: locked ? 1 : 0, duration, easing, useNativeDriver: false }).start();
  }, [locked, reduceMotion, lock, closing, useNativeDriver]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  const window: Rectangle = {
    x: SIDE,
    y: topInset + TOP_GAP,
    w: size ? size.w - SIDE * 2 : 0,
    h: size ? size.h - (topInset + TOP_GAP) - bottomInset : 0,
  };
  const ready = size !== null && window.w > 0 && window.h > 120;
  const goal = goalFor(window, target);
  const rect: Rectangle = {
    x: lerp(window.x, goal.x, closed),
    y: lerp(window.y, goal.y, closed),
    w: lerp(window.w, goal.w, closed),
    h: lerp(window.h, goal.h, closed),
  };
  useEffect(() => {
    if (ready) onWindow?.({ x: window.x, y: window.y, width: window.w, height: window.h });
  }, [ready, window.x, window.y, window.w, window.h, onWindow]);
  const radius = Math.min(frame === "corners" ? CORNER_RADIUS : WINDOW_RADIUS, rect.h / 2, rect.w / 2);
  const lineWidth = window.w - LINE_INSET * 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onLayout}>
      {ready && size ? (
        <>
          {/* What is being looked for, for a screen reader; the layers below are decoration. */}
          {description ? (
            <View
              accessible
              accessibilityLabel={description}
              style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1 }}
            />
          ) : null}

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
                  <Rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={radius} fill="black" />
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

            {/* The sweeping line, kept inside the window; it fades as the window closes. */}
            {sweepLine ? (
            <Animated.View
              style={{
                position: "absolute",
                left: window.x + LINE_INSET,
                top: window.y - LINE_BAND / 2,
                opacity: lock.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [
                  {
                    translateY: sweep.interpolate({
                      inputRange: [0, 1],
                      outputRange: [LINE_INSET, window.h - LINE_INSET],
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
            ) : null}

            {/* A cream frame that hands over to a terracotta one when locked. */}
            {[
              { color: SCANNER_FRAME, opacity: lock.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
              { color: TERRACOTTA, opacity: lock },
            ].map(({ color, opacity }) => (
              <Animated.View
                key={color}
                style={{
                  position: "absolute",
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                  opacity,
                  ...(frame === "full"
                    ? { borderRadius: radius, borderWidth: OUTLINE_WIDTH, borderColor: color }
                    : {}),
                }}
              >
                {frame === "corners" ? <Corners width={rect.w} height={rect.h} radius={radius} color={color} /> : null}
              </Animated.View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
