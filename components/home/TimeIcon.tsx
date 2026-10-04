import Svg, { Circle, Path } from "react-native-svg";

import type { TimeOfDay } from "@/lib/routine-builder";
import { HOME_TODAY } from "@/lib/tokens";

/** The moon for tonight and the sun for this morning (handoff_home_and_tip), beside the routine card's time line and the tip's label. */
export function TimeIcon({ time }: { time: TimeOfDay }) {
  if (time === "evening") {
    return (
      <Svg width={13} height={13} viewBox="0 0 24 24">
        <Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill={HOME_TODAY.evening.icon} />
      </Svg>
    );
  }
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} fill={HOME_TODAY.morning.active} />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke={HOME_TODAY.morning.icon} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
