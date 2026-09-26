import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/Text";
import { CHOSEN, FLOATING_SHADOW, INK, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * "Filter: All ▾" and, tapped, its choices on a white card that floats over
 * what's below, the chosen one ticked (owner's reference) — every filter in
 * the app: the ingredient list's groups, Saved's routine steps. Choosing
 * closes it; so does tapping "Filter" again.
 *
 * It floats rather than pushing the list down, so its parent's later siblings
 * must not sit above it: it raises itself with `zIndex`.
 */
export function FilterDropdown<T extends string>({
  options,
  selected,
  onSelect,
  style,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === selected)?.label ?? "";
  return (
    <View style={[{ zIndex: 10, alignSelf: "stretch" }, style]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`Filter: ${current}`}
        accessibilityState={{ expanded: open }}
        style={{ minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
        className="active:opacity-70"
      >
        <Text style={{ fontSize: TYPE.body, color: INK }}>Filter:</Text>
        <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: CHOSEN.accent }}>{current}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={CHOSEN.accent} />
      </Pressable>
      {open ? (
        <View
          accessibilityRole="radiogroup"
          style={{
            position: "absolute",
            top: TOUCH_TARGET,
            right: 0,
            minWidth: "60%",
            borderRadius: 24,
            backgroundColor: SURFACE,
            paddingVertical: 8,
            ...FLOATING_SHADOW,
          }}
        >
          {options.map(({ value, label }) => {
            const active = value === selected;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  onSelect(value);
                  setOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ checked: active }}
                style={{ minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20 }}
                className="active:opacity-70"
              >
                <Text style={{ fontSize: TYPE.body, fontWeight: "500", color: INK }}>{label}</Text>
                {active ? <Ionicons name="checkmark" size={20} color={CHOSEN.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
