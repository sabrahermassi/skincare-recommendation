import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, View } from "react-native";

import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { CTA, INK, MUTED, SELECTED, TYPE } from "@/lib/tokens";

// A block's corners, and each row's height.
const GROUP_RADIUS = 26;
const ROW_HEIGHT = 60;

/**
 * One block of a menu (owner's reference, on Profile and Account): its rows
 * share a rounded fill, with no line between them.
 */
export function MenuGroup({ children }: { children: ReactNode }) {
  return <View style={{ borderRadius: GROUP_RADIUS, backgroundColor: SELECTED, paddingVertical: 4, overflow: "hidden" }}>{children}</View>;
}

/**
 * One row of a menu: an icon and its name, then either an arrow (a row that
 * opens something) or a value (a row that only says something, like the
 * account's email). A short badge can sit beside the name.
 */
export function MenuRow({
  icon,
  label,
  badge,
  value,
  onPress,
  disabled = false,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
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
      <Ionicons name={icon} size={22} color={TERRACOTTA} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, flex: value ? 0 : 1 }}>
        <Text style={{ fontSize: TYPE.body, fontWeight: "500", color: value ? TERRACOTTA : INK }}>{label}</Text>
        {badge ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: CTA }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {value ? (
        <Text numberOfLines={1} ellipsizeMode="middle" style={{ flex: 1, textAlign: "right", fontSize: TYPE.label, color: MUTED }}>
          {value}
        </Text>
      ) : onPress ? (
        <Ionicons name="arrow-forward" size={22} color={TERRACOTTA} />
      ) : null}
    </>
  );
  const row = { minHeight: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20 } as const;
  return onPress ? (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}. ${badge}` : label}
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
