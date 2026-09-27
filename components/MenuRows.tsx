import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, View } from "react-native";

import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { CTA, INK, MENU_FILL, MUTED, SPACE, TYPE } from "@/lib/tokens";

// A block's corners, and each row's height.
const GROUP_RADIUS = 26;
const ROW_HEIGHT = 60;

/**
 * One block of a menu (owner's reference, on Profile and Account): its rows
 * share a rounded fill, with no line between them.
 */
export function MenuGroup({ children }: { children: ReactNode }) {
  return <View style={{ borderRadius: GROUP_RADIUS, backgroundColor: MENU_FILL, paddingVertical: 4, overflow: "hidden" }}>{children}</View>;
}

/**
 * One row of a menu: an icon and its name, a value on the right (a setting's
 * current answer, or a fact like the account's email), and an arrow when the
 * row opens something. A short badge can sit beside the name.
 */
export function MenuRow({
  icon,
  label,
  badge,
  value,
  onPress,
  disabled = false,
}: {
  /** Left out on a list of settings, where the name alone reads. */
  icon?: ComponentProps<typeof Ionicons>["name"];
  label: string;
  /** A short call to action beside the name, e.g. on a profile not filled in yet. */
  badge?: string;
  /** Shown on the right in place of the arrow, on a row with nothing to open. */
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const body = (
    <>
      {icon ? <Ionicons name={icon} size={22} color={TERRACOTTA} /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACE.text, flex: value ? 0 : 1 }}>
        <Text style={{ fontSize: TYPE.body, fontWeight: "500", color: value && !onPress ? TERRACOTTA : INK }}>{label}</Text>
        {badge ? (
          <View style={{ paddingHorizontal: SPACE.text, paddingVertical: 3, borderRadius: 8, backgroundColor: CTA }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {value ? (
        // A setting's current answer reads in the accent; a fact (the
        // account's email) stays quiet.
        <Text
          numberOfLines={1}
          ellipsizeMode={onPress ? "tail" : "middle"}
          style={{ flex: 1, textAlign: "right", fontSize: onPress ? TYPE.body : TYPE.label, fontWeight: onPress ? "500" : "400", color: onPress ? TERRACOTTA : MUTED }}
        >
          {value}
        </Text>
      ) : null}
      {onPress ? <Ionicons name="arrow-forward" size={22} color={TERRACOTTA} /> : null}
    </>
  );
  const row = { minHeight: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20 } as const;
  return onPress ? (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}. ${badge}` : value ? `${label}: ${value}` : label}
      accessibilityState={{ disabled }}
      className="active:opacity-60"
      style={row}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={value ? `${label}: ${value}` : label} style={row}>
      {body}
    </View>
  );
}
