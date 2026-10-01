import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";

import { TAB_BAR_HEIGHT, TAB_BAR_RADIUS, TAB_BAR_SIDE_MARGIN } from "@/lib/tab-bar";
import { INK, TAB_BAR_SHADE, WHITE } from "@/lib/tokens";

/**
 * The tab bar's body: a plain rounded bar with a soft shade under it. The scan
 * button is not cut into it; it sits on top of the bar and casts its own shadow.
 * Drawn rather than styled so the shade can be built from a few soft layers
 * (`TAB_BAR_SHADE`) instead of one box shadow.
 */
export function TabBarBackground() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const h = TAB_BAR_HEIGHT;
  const r = TAB_BAR_RADIUS;
  const x0 = TAB_BAR_SIDE_MARGIN;
  const x1 = width - TAB_BAR_SIDE_MARGIN;

  const d =
    width > 0
      ? [
          // True arcs at the corners: a quadratic curve only approximates a
          // quarter circle, and at a capsule's full radius the ends looked pinched.
          `M ${x0 + r} 0`,
          `L ${x1 - r} 0`,
          `A ${r} ${r} 0 0 1 ${x1} ${r}`,
          `L ${x1} ${h - r}`,
          `A ${r} ${r} 0 0 1 ${x1 - r} ${h}`,
          `L ${x0 + r} ${h}`,
          `A ${r} ${r} 0 0 1 ${x0} ${h - r}`,
          `L ${x0} ${r}`,
          `A ${r} ${r} 0 0 1 ${x0 + r} 0`,
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
          <Path d={d} fill={WHITE} />
        </Svg>
      ) : null}
    </View>
  );
}
