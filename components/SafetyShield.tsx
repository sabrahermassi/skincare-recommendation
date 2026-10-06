import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { VERDICT } from "@/lib/tokens";

/**
 * The small shield with an exclamation mark for the EU safety notice (#404):
 * a red row on Skin match, and (#405) beside a verdict in lists. Drawn in the
 * app's red, never in a verdict's score colours. `label` is its accessibility
 * label; leave it out where the sentence beside it already says the same.
 */
export function SafetyShield({ size = 20, label }: { size?: number; label?: string }) {
  const colour = VERDICT.low.deep;
  return (
    <View accessible={label !== undefined} accessibilityLabel={label} accessibilityRole={label ? "image" : undefined} importantForAccessibility={label ? "yes" : "no-hide-descendants"}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
          stroke={colour}
          strokeWidth={1.9}
          strokeLinejoin="round"
        />
        <Path d="M12 8v4M12 16h.01" stroke={colour} strokeWidth={1.9} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
