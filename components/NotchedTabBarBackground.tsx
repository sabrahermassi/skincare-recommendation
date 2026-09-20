import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";

import { SCAN_BUTTON, SCAN_BUTTON_LIFT, SCAN_NOTCH_GAP, TAB_BAR_HEIGHT, TAB_BAR_RADIUS, TAB_BAR_SIDE_MARGIN } from "@/lib/tab-bar";
import { INK, SURFACE, TAB_BAR_SHADE } from "@/lib/tokens";

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
  const x0 = TAB_BAR_SIDE_MARGIN;
  const x1 = width - TAB_BAR_SIDE_MARGIN;

  const d =
    width > 0
      ? [
          `M ${x0 + r} 0`,
          `L ${cx - half} 0`,
          `A ${notchR} ${notchR} 0 1 0 ${cx + half} 0`,
          `L ${x1 - r} 0`,
          `Q ${x1} 0 ${x1} ${r}`,
          `L ${x1} ${h - r}`,
          `Q ${x1} ${h} ${x1 - r} ${h}`,
          `L ${x0 + r} ${h}`,
          `Q ${x0} ${h} ${x0} ${h - r}`,
          `L ${x0} ${r}`,
          `Q ${x0} 0 ${x0 + r} 0`,
          "Z",
        ].join(" ")
      : "";

  return (
    <View pointerEvents="none" onLayout={onLayout} style={{ position: "absolute", left: 0, right: 0, top: 0, height: h }}>
      {width > 0 ? (
        <Svg width={width} height={h + TAB_BAR_SHADE.reach} style={{ position: "absolute", top: 0, left: 0 }}>
          {Array.from({ length: TAB_BAR_SHADE.layers }, (_, i) => (
            <Path
              key={i}
              d={d}
              fill={INK}
              fillOpacity={TAB_BAR_SHADE.opacity}
              transform={`translate(0 ${((i + 1) * TAB_BAR_SHADE.reach) / TAB_BAR_SHADE.layers})`}
            />
          ))}
          <Path d={d} fill={SURFACE} />
        </Svg>
      ) : null}
    </View>
  );
}
