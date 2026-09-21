import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

/**
 * The one arrow the whole app uses: a bare chevron, a light stroke with rounded
 * ends, thin and refined rather than the heavy defaults of an icon font. It is
 * the "this goes further" mark on rows and cards and the back mark on headers.
 * Directions turn the same drawing, so every arrow in the app is the same hand.
 */
export type ArrowDirection = "right" | "left" | "up" | "down";

const TURN: Record<ArrowDirection, string> = { right: "0deg", down: "90deg", left: "180deg", up: "270deg" };

/** The default stroke: light. A screen that needs a heavier one passes `strokeWidth`. */
const STROKE = 1.6;

export function ArrowIcon({
  direction = "right",
  size = 20,
  color,
  strokeWidth = STROKE,
  style,
}: {
  direction?: ArrowDirection;
  size?: number;
  color: string;
  strokeWidth?: number;
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
        d="M9.5 5.5 16 12l-6.5 6.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
