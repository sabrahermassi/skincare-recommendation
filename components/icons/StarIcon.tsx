import Svg, { Path } from "react-native-svg";

import { COLORS } from "@/lib/colors";

// The palette has no true yellow; the amber of its "watch" tone is the nearest.
export function StarIcon({ filled, size = 21 }: { filled: boolean; size?: number }) {
  const d =
    "M12 3.4l2.53 5.4 5.87.72-4.34 4.06 1.16 5.83L12 16.4l-5.22 2.99 1.16-5.83-4.34-4.06 5.87-.72Z";
  const color = filled ? COLORS.toneWatch : COLORS.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} fill={filled ? color : "none"} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}
