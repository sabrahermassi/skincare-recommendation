import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import Svg, { Path } from "react-native-svg";

import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { CAMERA_STAGE, SCANNER_FRAME, SURFACE, TYPE, withAlpha } from "@/lib/tokens";

/**
 * The live scanner's framing: the camera blurred and dimmed outside a rounded
 * window, so only the window is sharp (owner, after OnSkin's scanner). Both
 * modes draw the window's four corners in white (v7): Barcode is a small
 * window in the middle with a hint under it, the photo camera a tall one. The
 * window grows and shrinks between the two as the mode changes.
 *
 * `locked` is the moment a barcode has been read. With a `target` (where the
 * camera saw the barcode) the window closes in on it — the dimming and the
 * corners follow — and the corners turn terracotta; without one the window
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
// The corner brackets (v7): each corner's curve (the window's too), arm and stroke.
export const WINDOW_RADIUS = 18;
const CORNER_LENGTH = 34;
const CORNER_STROKE = 4;
const LOCK_MS = 280;
const FRAME_MIX_MS = 360;
// Over the blur, a light darkening, so the sharp window stands out.
const SCRIM_ALPHA = 0.25;
// How strongly the camera is blurred outside the window (expo-blur, 1-100).
const BLUR_INTENSITY = 40;
// The blur fades in over this many points out from the window's edge, in
// FEATHER_STEPS rings, so the window has a soft rounded edge, not a cut one.
const FEATHER = 18;
const FEATHER_STEPS = 9;
// The barcode window (v7, 280 × 170 on a 402pt-wide phone): this share of the
// screen's width, and this much wider than tall.
const BARCODE_WIDTH_SHARE = 280 / 402;
const BARCODE_ASPECT = 280 / 170;
// The hint's gap below the barcode window.
const HINT_GAP = 16;
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
  description = null,
  hint = null,
  onWindow,
}: {
  /** Distance from the top of the stage to leave clear (safe area, banner). */
  topInset: number;
  /** Distance from the bottom of the stage to leave clear (switcher). */
  bottomInset: number;
  locked: boolean;
  /** Where the barcode was seen, for the window to close in on. */
  target?: Box;
  /** "corners" (barcode, a small window) or "full" (photo, a tall one). */
  frame?: "corners" | "full";
  /** What a screen reader is told is being looked for; null for none. */
  description?: string | null;
  /** Shown in a pill under the barcode window; null for none. */
  hint?: string | null;
  /** Called with the window's rectangle, in this view's coordinates, whenever it is set or changes. */
  onWindow?: (window: Box) => void;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [lock] = useState(() => new Animated.Value(0));
  // 0 = the window, 1 = closed in on the barcode. Driven from JS: it moves
  // layout, which the native driver cannot.
  const [closing] = useState(() => new Animated.Value(0));
  const [closed, setClosed] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const useNativeDriver = Platform.OS !== "web";
  // 0 = the barcode window, 1 = the photo one. Eased when the mode changes, so
  // the frame flows from one to the other. Two copies of the value: one for the
  // hint's fade (native), one for the window's shape, which is layout (JS).
  const [frameMix] = useState(() => new Animated.Value(frame === "full" ? 1 : 0));
  const [frameMixJS] = useState(() => new Animated.Value(frame === "full" ? 1 : 0));
  const [mixed, setMixed] = useState(frame === "full" ? 1 : 0);
  // How visible each layer is, from the two animated values above.
  const [fades] = useState(() => {
    const notLocked = Animated.subtract(1, lock);
    const notFull = Animated.subtract(1, frameMix);
    return {
      open: notLocked,
      locked: lock,
      hint: Animated.multiply(notFull, notLocked),
    };
  });

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
    const id = frameMixJS.addListener(({ value }) => setMixed(value));
    return () => frameMixJS.removeListener(id);
  }, [frameMixJS]);

  useEffect(() => {
    const duration = reduceMotion ? 0 : FRAME_MIX_MS;
    const easing = Easing.inOut(Easing.cubic);
    const toValue = frame === "full" ? 1 : 0;
    Animated.timing(frameMix, { toValue, duration, easing, useNativeDriver }).start();
    Animated.timing(frameMixJS, { toValue, duration, easing, useNativeDriver: false }).start();
  }, [frame, reduceMotion, frameMix, frameMixJS, useNativeDriver]);

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

  // The photo window fills the room between the top and bottom insets; the
  // barcode window is a small one in the middle of that room.
  const photoWindow: Rectangle = {
    x: SIDE,
    y: topInset + TOP_GAP,
    w: size ? size.w - SIDE * 2 : 0,
    h: size ? size.h - (topInset + TOP_GAP) - bottomInset : 0,
  };
  const barcodeW = size ? size.w * BARCODE_WIDTH_SHARE : 0;
  const barcodeH = barcodeW / BARCODE_ASPECT;
  const barcodeWindow: Rectangle = {
    x: size ? (size.w - barcodeW) / 2 : 0,
    y: photoWindow.y + (photoWindow.h - barcodeH) / 2,
    w: barcodeW,
    h: barcodeH,
  };
  // Where the mode is going: what the camera and the photo crop read.
  const settled = frame === "full" ? photoWindow : barcodeWindow;
  // Where it is on the way there, as the mode changes.
  const window: Rectangle = {
    x: lerp(barcodeWindow.x, photoWindow.x, mixed),
    y: lerp(barcodeWindow.y, photoWindow.y, mixed),
    w: lerp(barcodeWindow.w, photoWindow.w, mixed),
    h: lerp(barcodeWindow.h, photoWindow.h, mixed),
  };
  const ready = size !== null && photoWindow.w > 0 && photoWindow.h > 120;
  const goal = goalFor(window, target);
  const rect: Rectangle = {
    x: lerp(window.x, goal.x, closed),
    y: lerp(window.y, goal.y, closed),
    w: lerp(window.w, goal.w, closed),
    h: lerp(window.h, goal.h, closed),
  };
  useEffect(() => {
    if (ready) onWindow?.({ x: settled.x, y: settled.y, width: settled.w, height: settled.h });
  }, [ready, settled.x, settled.y, settled.w, settled.h, onWindow]);
  const radius = Math.min(WINDOW_RADIUS, rect.h / 2, rect.w / 2);
  // The blur's mask: opaque everywhere but a rounded hole the window's shape,
  // whose edge fades from clear (at the window) to full (FEATHER out) in rings.
  const screenPath = size ? `M0 0H${size.w}V${size.h}H0Z` : "";
  const grown = (by: number) => roundedRectPath(rect.x - by, rect.y - by, rect.w + by * 2, rect.h + by * 2, radius + by);
  const step = FEATHER / FEATHER_STEPS;
  const rings = Array.from({ length: FEATHER_STEPS }, (_, i) => ({
    d: `${grown((i + 1) * step)} ${grown(i * step)}`,
    opacity: (i + 1) / (FEATHER_STEPS + 1),
  }));

  return (
    <View testID="scan-viewfinder" style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onLayout}>
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
            {/* One blur over the whole camera, masked to everything but the
                window: a single surface, so no seams, and its hole has the
                window's rounded corners and a soft edge. */}
            <MaskedView
              style={StyleSheet.absoluteFill}
              maskElement={
                <Svg width={size.w} height={size.h}>
                  <Path d={`${screenPath} ${grown(FEATHER)}`} fill="black" fillRule="evenodd" />
                  {rings.map((ring, i) => (
                    <Path key={i} d={ring.d} fill="black" fillOpacity={ring.opacity} fillRule="evenodd" />
                  ))}
                </Svg>
              }
            >
              <BlurView intensity={BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(CAMERA_STAGE, SCRIM_ALPHA) }]} />
            </MaskedView>

            {/* Two layers — white and terracotta — faded into each other as a barcode locks. */}
            {(
              [
                { key: "open", color: SCANNER_FRAME, opacity: fades.open },
                { key: "locked", color: TERRACOTTA, opacity: fades.locked },
              ] as const
            ).map(({ key, color, opacity }) => (
              <Animated.View
                key={key}
                style={{
                  position: "absolute",
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                  opacity,
                }}
              >
                <Corners width={rect.w} height={rect.h} radius={radius} color={color} />
              </Animated.View>
            ))}

            {/* The barcode hint, under its window; it fades with the corners. */}
            {hint ? (
              <Animated.View
                style={{ position: "absolute", left: 0, right: 0, top: rect.y + rect.h + HINT_GAP, alignItems: "center", opacity: fades.hint }}
              >
                <Text style={{ fontSize: TYPE.body, color: withAlpha(SURFACE, 0.85) }}>{hint}</Text>
              </Animated.View>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** A rounded rectangle as an SVG path, for the blur's mask. */
function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${x + radius} ${y}H${x + w - radius}A${radius} ${radius} 0 0 1 ${x + w} ${y + radius}` +
    `V${y + h - radius}A${radius} ${radius} 0 0 1 ${x + w - radius} ${y + h}` +
    `H${x + radius}A${radius} ${radius} 0 0 1 ${x} ${y + h - radius}` +
    `V${y + radius}A${radius} ${radius} 0 0 1 ${x + radius} ${y}Z`
  );
}
