import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { Glass, hasLiquidGlass } from "@/components/Glass";
import { Text } from "@/components/Text";
import { FLOW_LEAD, FLOW_TRAIL } from "@/lib/flow";
import { INK, MUTED, SWITCH_TRACK_GLASS, TYPE, WHITE, withAlpha, SPACE } from "@/lib/tokens";


// The two looks (v7). Over the camera: a see-through white track, a white
// thumb, 13pt words. On the page: a pale warm track, a white thumb, the chosen
// word in ink and the others in secondary grey.
/** Every segmented control's height (owner, 2 October 2026: 44, Apple's smallest comfortable tap; the hand-off's was 40). */
const SWITCH_HEIGHT = 44;
// The gap between the capsule and the thumb that slides in it.
const SWITCH_PADDING = 3;
// The thumb's soft lift off the track, two layers (v9, read off the hand-off:
// 0 1 3 at 12% and 0 3 8 at 6%). A view casts one shadow, so the far one is
// drawn by a layer inside the thumb.
const THUMB_SHADOW = { shadowColor: INK, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 1 } as const;
const THUMB_SHADOW_FAR = { shadowColor: INK, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 } as const;

export type SwitchLook = {
  track: string;
  thumb: string;
  label: string;
  chosenLabel: string;
  thumbShadow: ViewStyle | null;
  /** A second, wider shadow under the thumb (v9's light look). */
  thumbShadowFar?: ViewStyle;
  fontSize: number;
};
const TONES: Record<"dark" | "light" | "stone", SwitchLook> = {
  dark: { track: withAlpha(WHITE, 0.14), thumb: WHITE, label: WHITE, chosenLabel: INK, thumbShadow: null, fontSize: TYPE.label },
  light: { track: SWITCH_TRACK_GLASS, thumb: WHITE, label: MUTED, chosenLabel: INK, thumbShadow: THUMB_SHADOW, thumbShadowFar: THUMB_SHADOW_FAR, fontSize: TYPE.label },
  // The light look on the product result's stone header (v9).
  stone: { track: SWITCH_TRACK_GLASS, thumb: WHITE, label: MUTED, chosenLabel: INK, thumbShadow: THUMB_SHADOW, fontSize: TYPE.label },
};

/**
 * A row of choices in one capsule, the chosen one on a thumb that springs
 * across to it: the scanner's Barcode / Photo (dark, over the camera), and
 * Saved's Saved / History / Ingredients (light). A screen with its own
 * colours passes a whole `SwitchLook` (the routine's morning and evening), and
 * an option can carry an icon before its word. The thumb flows to the next
 * choice like a drop of water (`lib/flow.ts`); with Reduce Motion on it just
 * moves.
 */
export function SegmentedSwitch<T extends string>({
  options,
  selected,
  onSelect,
  tone = "dark",
  height = SWITCH_HEIGHT,
  style,
}: {
  options: { value: T; label: string; icon?: (on: boolean) => ReactNode }[];
  selected: T;
  onSelect: (value: T) => void;
  tone?: keyof typeof TONES | SwitchLook;
  /** Taller than the usual 44 where the switch is a screen's main bar (the scanner's, as tall as the tab bar). */
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === selected));
  const [width, setWidth] = useState(0);
  const segment = width > 0 ? (width - 2 * SWITCH_PADDING) / options.length : 0;
  // The thumb's two edges, each on its own spring (`lib/flow.ts`): it flows to
  // the next choice like the tab bar's pill. -1 until the capsule has a width.
  const left = useSharedValue(-1);
  const right = useSharedValue(-1);
  const placed = useRef(0);
  useEffect(() => {
    if (segment <= 0) return;
    const to = SWITCH_PADDING + index * segment;
    // First time, or the capsule changed width: just be there.
    if (placed.current !== segment) {
      placed.current = segment;
      left.value = to;
      right.value = to + segment;
      return;
    }
    const forward = to > left.value;
    left.value = withSpring(to, forward ? FLOW_TRAIL : FLOW_LEAD);
    right.value = withSpring(to + segment, forward ? FLOW_LEAD : FLOW_TRAIL);
  }, [index, segment, left, right]);
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: left.value < 0 ? 0 : 1,
    left: left.value,
    // Never thinner than half a place, however the springs cross.
    width: Math.max(segment / 2, right.value - left.value),
  }));

  // The glass thumb is never faded (a glass at opacity 0 stops drawing): until the capsule has a width it waits off to the side.
  const glassThumbStyle = useAnimatedStyle(() => ({
    left: left.value < 0 ? -9999 : left.value,
    width: Math.max(segment / 2, right.value - left.value),
  }));

  const look = typeof tone === "string" ? TONES[tone] : tone;
  // The white thumb of the two page looks is Liquid Glass where the phone has it, like iOS 26's own segmented control. The camera's and the routine's coloured thumbs stay as they are.
  const glassThumb = hasLiquidGlass && (tone === "light" || tone === "stone");

  return (
    <View accessibilityRole="tablist" style={style}>
      {/* Measured here, on the capsule itself: the wrapper may carry the
          caller's padding, which is not room the thumb can use. */}
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height, borderRadius: height / 2, padding: SWITCH_PADDING, flexDirection: "row", backgroundColor: look.track }}
      >
        {segment > 0 && glassThumb ? (
          <Animated.View
            pointerEvents="none"
            style={[{ position: "absolute", top: SWITCH_PADDING, bottom: SWITCH_PADDING, borderRadius: (height - 2 * SWITCH_PADDING) / 2 }, glassThumbStyle]}
          >
            <Glass style={[StyleSheet.absoluteFill, { borderRadius: (height - 2 * SWITCH_PADDING) / 2 }]} />
          </Animated.View>
        ) : null}
        {segment > 0 && !glassThumb ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: SWITCH_PADDING,
                bottom: SWITCH_PADDING,
                borderRadius: (height - 2 * SWITCH_PADDING) / 2,
                backgroundColor: look.thumb,
                ...look.thumbShadow,
              },
              thumbStyle,
            ]}
          >
            {look.thumbShadowFar ? (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  borderRadius: (height - 2 * SWITCH_PADDING) / 2,
                  backgroundColor: look.thumb,
                  ...look.thumbShadowFar,
                }}
              />
            ) : null}
          </Animated.View>
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
              style={{ flex: 1, flexDirection: "row", gap: SPACE.text, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACE.text }}
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
