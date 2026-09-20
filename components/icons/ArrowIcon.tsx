import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

/**
 * The one arrow the whole app uses: a light stroke with rounded ends, thin and
 * refined rather than the heavy defaults of an icon font. `chevron` is the small
 * "this goes further" mark on rows and the back mark on headers; `arrow` is the
 * longer arrow that points at where a button leads. Directions turn the same
 * drawing, so every arrow in the app is the same hand.
 */
export type ArrowDirection = "right" | "left" | "up" | "down";

const TURN: Record<ArrowDirection, string> = { right: "0deg", down: "90deg", left: "180deg", up: "270deg" };

const STROKE = 1.6;

export function ArrowIcon({
  direction = "right",
  kind = "chevron",
  size = 20,
  color,
  style,
}: {
  direction?: ArrowDirection;
  kind?: "chevron" | "arrow";
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={[{ transform: [{ rotate: TURN[direction] }] }, style]}
    >
      <Path
        d={kind === "arrow" ? "M4.5 12h15M14 6.5 19.5 12 14 17.5" : "M9.5 5.5 16 12l-6.5 6.5"}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
