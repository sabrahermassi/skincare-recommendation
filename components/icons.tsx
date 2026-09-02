import Svg, { Path } from "react-native-svg";

import { COLORS } from "@/lib/colors";

/**
 * The two glyphs the design draws more than once, in one place.
 *
 * The heart path is copied verbatim from the mockups (it appears on the
 * product, result and browse screens at four different sizes). It was inlined
 * in three files and rendered as the text characters "♥" / "♡" in a fourth,
 * where it picked up the font's own metrics and sat a few pixels off centre —
 * a text glyph is not an icon, and on Android it fell back to a different
 * shape entirely.
 */
export function HeartIcon({
  size = 21,
  filled = false,
  color = COLORS.ink,
}: {
  size?: number;
  filled?: boolean;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"}>
      <Path
        d="M12 20.2s-7.6-4.7-7.6-9.7A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.6 2.8c0 5-7.6 9.7-7.6 9.7Z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Compare. The design has no compare entry point — it dropped the grid card
 * that used to carry one — so this glyph is ours, drawn to match the weight
 * and cap height of the design's own stroked icons rather than the "⇄"
 * character it replaced.
 */
export function CompareIcon({
  size = 19,
  color = COLORS.ink,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5h13.5M14 5l3.5 3.5L14 12M20 15.5H6.5M10 12 6.5 15.5 10 19"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
