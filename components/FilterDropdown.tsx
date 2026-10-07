import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";
import { INK, LINK, MENU_CHOSEN, MENU_SHADOW, MUTED, TOUCH_TARGET, TYPE, WHITE, RADIUS, SPACE, GLASS_FROST } from "@/lib/tokens";
import { Glass, hasLiquidGlass } from "@/components/Glass";

// The popover (v7, read off the hand-off): white, radius 14, 4pt inside,
// sized to its longest option; the chosen row tinted and ticked.
const POPOVER_RADIUS = RADIUS.control;
const POPOVER_PADDING = 4;
const POPOVER_MIN_WIDTH = 132;
// Roughly how wide a 15pt letter is, to size the popover to its longest option.
const LETTER_WIDTH = 8.4;
const OPTION_HEIGHT = TOUCH_TARGET;
const OPTION_RADIUS = POPOVER_RADIUS - POPOVER_PADDING;
// A long list (the finder's product types) shows this many rows and scrolls
// the rest; half a row peeks out below, so it reads as scrollable.
const VISIBLE_OPTIONS = 7.5;

/**
 * "Filter: All ⌄" and, tapped, its choices in a small popover that floats
 * over the screen (v7): the chosen one tinted with a tick, a count after a
 * label where one is given. Choosing closes it, and so does tapping anywhere
 * outside it. Every filter in the app: the ingredient box, the finder's
 * product types, Saved's routine steps. A long list scrolls inside it.
 *
 * The popover sits in a transparent full-screen modal, placed under the
 * button: no parent's `zIndex` or clipping can hide it, and the backdrop is
 * what hears a tap outside. `align` pins its right edge to the button's
 * instead of its left.
 */
export function FilterDropdown<T extends string>({
  options,
  selected,
  onSelect,
  align = "start",
  style,
}: {
  options: { value: T; label: string; count?: number }[];
  selected: T;
  onSelect: (value: T) => void;
  align?: "start" | "end";
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const button = useRef<View>(null);
  const window = useWindowDimensions();
  const current = options.find((o) => o.value === selected)?.label ?? "";
  // Sized to its longest option (v7): its letters, the row's padding and gap,
  // the tick, and a count where there is one.
  const longest = Math.max(...options.map((o) => o.label.length));
  const hasCounts = options.some((o) => o.count !== undefined);
  const popoverWidth = Math.min(window.width - 32, Math.max(POPOVER_MIN_WIDTH, Math.ceil(longest * LETTER_WIDTH) + 2 * POPOVER_PADDING + 24 + 12 + 14 + (hasCounts ? 44 : 0)));

  // Opens at once, and shows once the button has been measured, so it never
  // flashes in the wrong place.
  const show = () => {
    setOpen(true);
    button.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };
  const close = () => {
    setOpen(false);
    setAnchor(null);
  };

  return (
    <View style={[{ alignItems: align === "end" ? "flex-end" : "flex-start" }, style]}>
      <Pressable
        ref={button}
        onPress={open ? close : show}
        accessibilityRole="button"
        accessibilityLabel={`Filter: ${current}`}
        accessibilityState={{ expanded: open }}
        style={{ minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 }}
        className="active:opacity-70"
      >
        <Text style={{ fontSize: TYPE.label, color: MUTED }}>Filter:</Text>
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>{current}</Text>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Path d="m6 9 6 6 6-6" stroke={LINK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable onPress={close} accessibilityLabel="Close the filter" style={{ flex: 1 }}>
          <View
              accessibilityRole="radiogroup"
              onStartShouldSetResponder={() => true}
              style={{
                position: "absolute",
                top: anchor ? anchor.y + anchor.height + 4 : 0,
                ...(align === "end" ? { right: anchor ? window.width - (anchor.x + anchor.width) : 0 } : { left: anchor ? anchor.x : 0 }),
                opacity: anchor ? 1 : 0,
                width: popoverWidth,
                borderRadius: POPOVER_RADIUS,
                // Liquid Glass lights and shades itself; the white card and its shade are the fallback.
                ...(hasLiquidGlass ? null : { backgroundColor: WHITE, ...MENU_SHADOW }),
              }}
            >
              {/* Only once measured: a glass under an opacity of 0 does not draw. */}
              {hasLiquidGlass && anchor ? <Glass tint={GLASS_FROST} style={[StyleSheet.absoluteFill, { borderRadius: POPOVER_RADIUS }]} /> : null}
              <ScrollView
                style={{ maxHeight: OPTION_HEIGHT * VISIBLE_OPTIONS + POPOVER_PADDING * 2, borderRadius: POPOVER_RADIUS }}
                contentContainerStyle={{ padding: POPOVER_PADDING }}
                bounces={false}
                showsVerticalScrollIndicator={options.length > VISIBLE_OPTIONS}
              >
                {options.map(({ value, label, count }) => {
                  const on = value === selected;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => {
                        onSelect(value);
                        close();
                      }}
                      accessibilityRole="radio"
                      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
                      accessibilityState={{ checked: on }}
                      style={{ height: OPTION_HEIGHT, flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingHorizontal: SPACE.block, borderRadius: OPTION_RADIUS, backgroundColor: on ? MENU_CHOSEN : undefined }}
                      className="active:opacity-70"
                    >
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: TYPE.label, fontWeight: on ? "600" : "400", color: INK }}>
                        {label}
                      </Text>
                      {count !== undefined ? <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{count}</Text> : null}
                      <View style={{ width: 14, alignItems: "center" }}>
                        {on ? (
                          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                            <Path d="M20 6 9 17l-5-5" stroke={LINK} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
        </Pressable>
      </Modal>
    </View>
  );
}
