import { useEffect, useState } from "react";
import { Animated, Platform, Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/Text";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { CANVAS, CHIP_SHADOW, CTA, GRAY_FILL, INK, SURFACE, TYPE } from "@/lib/tokens";

/** The switch's height: the owner's reference, measured off its screenshot. */
export const SWITCH_HEIGHT = 56;
// The gap between the capsule and the thumb that slides in it.
const SWITCH_PADDING = 4;
// Apple's spring at a segmented control's pace (response 0.35 s), critically
// damped (fraction 1) so the thumb stops at its segment instead of
// overshooting past the capsule's end: stiffness = (2π / response)²,
// damping = 4π × fraction / response, for a mass of 1.
const IOS_SPRING = { mass: 1, stiffness: 322, damping: 35.9 };

// The two looks (owner's references). Dark over the camera: an ink capsule
// with a peach thumb. Light on the page: a pale warm track with a white thumb
// and ink words throughout.
const TONES = {
  dark: { track: INK, thumb: CTA, label: CANVAS, chosenLabel: INK, thumbShadow: null },
  light: { track: GRAY_FILL, thumb: SURFACE, label: INK, chosenLabel: INK, thumbShadow: CHIP_SHADOW },
} as const;

/**
 * A row of choices in one capsule, the chosen one on a thumb that springs
 * across to it: the scanner's Barcode / Photo (dark, over the camera), and
 * Saved's Saved / History / Ingredients (light). Words only. With Reduce
 * Motion on, the thumb just moves.
 */
export function SegmentedSwitch<T extends string>({
  options,
  selected,
  onSelect,
  tone = "dark",
  style,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  tone?: keyof typeof TONES;
  style?: StyleProp<ViewStyle>;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === selected));
  const [width, setWidth] = useState(0);
  const [slide] = useState(() => new Animated.Value(index));
  useEffect(() => {
    if (reduceMotionNow()) {
      slide.setValue(index);
      return;
    }
    Animated.spring(slide, { toValue: index, ...IOS_SPRING, useNativeDriver: Platform.OS !== "web" }).start();
  }, [index, slide]);

  const segment = width > 0 ? (width - 2 * SWITCH_PADDING) / options.length : 0;
  const look = TONES[tone];

  return (
    <View accessibilityRole="tablist" style={style}>
      {/* Measured here, on the capsule itself: the wrapper may carry the
          caller's padding, which is not room the thumb can use. */}
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: SWITCH_HEIGHT, borderRadius: SWITCH_HEIGHT / 2, padding: SWITCH_PADDING, flexDirection: "row", backgroundColor: look.track }}
      >
        {segment > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: SWITCH_PADDING,
              bottom: SWITCH_PADDING,
              left: SWITCH_PADDING,
              width: segment,
              borderRadius: (SWITCH_HEIGHT - 2 * SWITCH_PADDING) / 2,
              backgroundColor: look.thumb,
              ...look.thumbShadow,
              transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, segment] }) }],
            }}
          />
        ) : null}
        {options.map(({ value, label }) => {
          const on = value === selected;
          return (
            <Pressable
              key={value}
              onPress={() => onSelect(value)}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}
              className="active:opacity-70"
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ fontSize: TYPE.body, fontWeight: "600", color: on ? look.chosenLabel : look.label }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
