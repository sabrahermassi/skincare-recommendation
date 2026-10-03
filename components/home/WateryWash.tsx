import { useId, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { WHITE } from "@/lib/tokens";

/**
 * The watery background of Home's routine card and the tip's note
 * (handoff_home_and_tip): a base colour, a soft glow in the top-left and the
 * bottom-right corners, and a white bloom in the middle. Drawn, since React
 * Native has no radial gradient. Fills its parent, which clips the corners;
 * drawn at its measured size, since a percentage size on the drawing came out
 * short of the card on iOS (found in the simulator).
 */
export function WateryWash({ a, b, base }: { a: string; b: string; base: string }) {
  // One set of gradient ids per drawing: two washes on screen at once (the card under the note) must not share them.
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      {size ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <RadialGradient id={`${id}a`} cx="0" cy="0" rx="0.9" ry="0.8" fx="0" fy="0" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={a} stopOpacity={1} />
              <Stop offset="0.6" stopColor={a} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`${id}b`} cx="1" cy="1" rx="0.9" ry="0.8" fx="1" fy="1" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={b} stopOpacity={1} />
              <Stop offset="0.6" stopColor={b} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`${id}w`} cx="0.5" cy="0.5" rx="0.6" ry="0.55" fx="0.5" fy="0.5" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={WHITE} stopOpacity={0.85} />
              <Stop offset="0.45" stopColor={WHITE} stopOpacity={0.35} />
              <Stop offset="0.75" stopColor={WHITE} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={size.width} height={size.height} fill={base} />
          <Rect width={size.width} height={size.height} fill={`url(#${id}b)`} />
          <Rect width={size.width} height={size.height} fill={`url(#${id}a)`} />
          <Rect width={size.width} height={size.height} fill={`url(#${id}w)`} />
        </Svg>
      ) : null}
    </View>
  );
}
