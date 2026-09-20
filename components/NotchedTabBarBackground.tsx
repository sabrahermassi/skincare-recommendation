import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";

import { SCAN_BUTTON, SCAN_BUTTON_LIFT, SCAN_NOTCH_GAP, TAB_BAR_HEIGHT, TAB_BAR_RADIUS } from "@/lib/tab-bar";
import { INK, SURFACE } from "@/lib/tokens";

/** How far the drawn shade reaches below the bar, and how many soft layers make it. */
const SHADE_REACH = 10;
const SHADE_LAYERS = 4;
const SHADE_LAYER_OPACITY = 0.045;

/**
 * The tab bar's body: a rounded bar with a circular bite out of its top edge,
 * in the middle, where the scan button sits. The bar curves around the button
 * instead of the button lying on top of it. Drawn rather than styled so the cut
 * is a real cut (the screen shows through it), and the shade under the bar is
 * drawn with it — a box shadow would run straight across the bite.
 */
export function NotchedTabBarBackground() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const h = TAB_BAR_HEIGHT;
  const r = TAB_BAR_RADIUS;
  // The button's centre sits this far below the bar's top edge.
  const centreY = SCAN_BUTTON / 2 - SCAN_BUTTON_LIFT;
  const notchR = SCAN_BUTTON / 2 + SCAN_NOTCH_GAP;
  const half = Math.sqrt(notchR * notchR - centreY * centreY);
  const cx = width / 2;

  const d =
    width > 0
      ? [
          `M ${r} 0`,
          `L ${cx - half} 0`,
          `A ${notchR} ${notchR} 0 1 0 ${cx + half} 0`,
          `L ${width - r} 0`,
          `Q ${width} 0 ${width} ${r}`,
          `L ${width} ${h - r}`,
          `Q ${width} ${h} ${width - r} ${h}`,
          `L ${r} ${h}`,
          `Q 0 ${h} 0 ${h - r}`,
          `L 0 ${r}`,
          `Q 0 0 ${r} 0`,
          "Z",
        ].join(" ")
      : "";

  return (
    <View pointerEvents="none" onLayout={onLayout} style={{ position: "absolute", left: 0, right: 0, top: 0, height: h }}>
      {width > 0 ? (
        <Svg width={width} height={h + SHADE_REACH} style={{ position: "absolute", top: 0, left: 0 }}>
          {Array.from({ length: SHADE_LAYERS }, (_, i) => (
            <Path
              key={i}
              d={d}
              fill={INK}
              fillOpacity={SHADE_LAYER_OPACITY}
              transform={`translate(0 ${((i + 1) * SHADE_REACH) / SHADE_LAYERS})`}
            />
          ))}
          <Path d={d} fill={SURFACE} />
        </Svg>
      ) : null}
    </View>
  );
}
