import Svg, { Circle, Path } from "react-native-svg";

/**
 * A magnifying glass, drawn here rather than taken from an icon set because the
 * tab bar wants a state the sets do not have: an outline lens when unselected
 * and the lens filled in when selected — the handle and the ring unchanged.
 */
export function SearchIcon({ size = 26, color, filled = false }: { size?: number; color: string; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.6} stroke={color} strokeWidth={2.2} fill={filled ? color : "none"} />
      <Path d="M15.6 15.6 20.6 20.6" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}
