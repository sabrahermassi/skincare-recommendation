import { useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Line } from "react-native-svg";

/**
 * A vertical dotted line that fills its height: the rail between numbered
 * steps. Drawn, not a dotted border: iOS draws a short dotted border as a
 * solid line (the line under a short "Rest night" card, found in the
 * simulator), and this stays dotted at any length.
 */
export function DottedLine({ color, width = 2, style }: { color: string; width?: number; style?: StyleProp<ViewStyle> }) {
  const [height, setHeight] = useState(0);
  return (
    <View onLayout={(event) => setHeight(event.nativeEvent.layout.height)} style={[{ width, alignSelf: "center" }, style]}>
      {height > 0 ? (
        <Svg width={width} height={height}>
          {/* Round dots one line-width wide, two line-widths apart. */}
          <Line x1={width / 2} y1={width / 2} x2={width / 2} y2={height} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={`0.01 ${width * 2}`} />
        </Svg>
      ) : null}
    </View>
  );
}
