import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/Text";
import { CHOSEN, FLOATING_SHADOW, INK, MUTED, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

// The floating card's size and shape (design_handoff_skincare_cards).
const POPOVER_WIDTH = 224;
const POPOVER_RADIUS = 20;
const OPTION_HEIGHT = 48;
const OPTION_RADIUS = 14;
const POPOVER_PADDING = 6;
// A long list (the finder's product types) shows this many rows and scrolls
// the rest; half a row peeks out below, so it reads as scrollable.
const VISIBLE_OPTIONS = 7.5;

/**
 * "Filter: All ▾" and, tapped, its choices on a white card that floats over
 * what's below — each with its count, the chosen one tinted and ticked
 * (owner's reference, then the result-screen handoff). Every filter in the
 * app: the ingredient lists, Saved's routine steps. Choosing closes it; so
 * does tapping "Filter" again. A long list scrolls inside the card.
 *
 * It floats rather than pushing the list down, so it raises itself with
 * `zIndex` over its parent's later siblings. `align` puts the button (and the
 * card under it) at the start or the end of its row.
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
  const current = options.find((o) => o.value === selected)?.label ?? "";
  return (
    <View style={[{ zIndex: 10, alignItems: align === "end" ? "flex-end" : "flex-start" }, style]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`Filter: ${current}`}
        accessibilityState={{ expanded: open }}
        style={{ minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: 999 }}
        className="active:opacity-70"
      >
        <Text style={{ fontSize: TYPE.body, color: MUTED }}>Filter:</Text>
        <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: CHOSEN.accent }}>{current}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={CHOSEN.accent} />
      </Pressable>
      {open ? (
        <View
          accessibilityRole="radiogroup"
          style={{
            position: "absolute",
            top: TOUCH_TARGET + 4,
            ...(align === "end" ? { right: 0 } : { left: 0 }),
            width: POPOVER_WIDTH,
            borderRadius: POPOVER_RADIUS,
            backgroundColor: SURFACE,
            ...FLOATING_SHADOW,
          }}
        >
          <ScrollView
            style={{ maxHeight: OPTION_HEIGHT * VISIBLE_OPTIONS + POPOVER_PADDING * 2 }}
            contentContainerStyle={{ padding: POPOVER_PADDING }}
            bounces={false}
            nestedScrollEnabled
            showsVerticalScrollIndicator={options.length > VISIBLE_OPTIONS}
          >
            {options.map(({ value, label, count }) => {
              const active = value === selected;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    onSelect(value);
                    setOpen(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
                  accessibilityState={{ checked: active }}
                  style={{
                    height: OPTION_HEIGHT,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 14,
                    borderRadius: OPTION_RADIUS,
                    backgroundColor: active ? CHOSEN.fill : undefined,
                  }}
                  className="active:opacity-70"
                >
                  <Text style={{ flex: 1, fontSize: TYPE.body, fontWeight: active ? "600" : "500", color: INK }}>{label}</Text>
                  {count !== undefined ? <Text style={{ fontSize: TYPE.label, color: MUTED }}>{count}</Text> : null}
                  <View style={{ width: 20, alignItems: "center" }}>
                    {active ? <Ionicons name="checkmark" size={20} color={CHOSEN.accent} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
