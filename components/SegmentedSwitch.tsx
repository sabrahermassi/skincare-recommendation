import { useEffect, useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/Text";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { INK, MUTED, SEGMENT_TRACK, TYPE, WHITE, withAlpha } from "@/lib/tokens";

/** Every segmented control's height in v7 (read off the hand-off). */
const SWITCH_HEIGHT = 40;
// The gap between the capsule and the thumb that slides in it.
const SWITCH_PADDING = 3;
// The thumb's own soft lift off the track (v7: 0 1 3 at 10%).
const THUMB_SHADOW = { shadowColor: INK, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 1 } as const;
// Apple's spring at a segmented control's pace (response 0.35 s), critically
// damped (fraction 1) so the thumb stops at its segment instead of
// overshooting past the capsule's end: stiffness = (2π / response)²,
// damping = 4π × fraction / response, for a mass of 1.
const IOS_SPRING = { mass: 1, stiffness: 322, damping: 35.9 };

// The two looks (v7). Over the camera: a see-through white track, a white
// thumb, 13pt words. On the page: a pale warm track, a white thumb, the chosen
// word in ink and the others in secondary grey.
export type SwitchLook = {
  track: string;
  thumb: string;
  label: string;
  chosenLabel: string;
  thumbShadow: ViewStyle | null;
  fontSize: number;
};
const TONES: Record<"dark" | "light", SwitchLook> = {
  dark: { track: withAlpha(WHITE, 0.14), thumb: WHITE, label: WHITE, chosenLabel: INK, thumbShadow: null, fontSize: TYPE.caption },
  light: { track: SEGMENT_TRACK, thumb: WHITE, label: MUTED, chosenLabel: INK, thumbShadow: THUMB_SHADOW, fontSize: TYPE.label },
};

/**
 * A row of choices in one capsule, the chosen one on a thumb that springs
 * across to it: the scanner's Barcode / Photo (dark, over the camera), and
 * Saved's Saved / History / Ingredients (light). A screen with its own
 * colours passes a whole `SwitchLook` (the routine's morning and evening), and
 * an option can carry an icon before its word. With Reduce Motion on, the
 * thumb just moves.
 */
export function SegmentedSwitch<T extends string>({
  options,
  selected,
  onSelect,
  tone = "dark",
  style,
}: {
  options: { value: T; label: string; icon?: (on: boolean) => ReactNode }[];
  selected: T;
  onSelect: (value: T) => void;
  tone?: keyof typeof TONES | SwitchLook;
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
  const look = typeof tone === "string" ? TONES[tone] : tone;

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
        {options.map(({ value, label, icon }) => {
          const on = value === selected;
          return (
            <Pressable
              key={value}
              onPress={() => onSelect(value)}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: on }}
              style={{ flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}
              className="active:opacity-70"
            >
              {icon ? icon(on) : null}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ fontSize: look.fontSize, fontWeight: "600", color: on ? look.chosenLabel : look.label }}
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
