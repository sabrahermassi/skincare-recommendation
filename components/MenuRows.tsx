import { Ionicons } from "@expo/vector-icons";
import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";
import { CARD_RADIUS, DESTRUCTIVE_OUTLINE, HAIRLINE, INK, LINK, MENU_FILL, MUTED, ROW_CHEVRON, TYPE } from "@/lib/tokens";

// Each row's height (v7).
const ROW_HEIGHT = 56;
const ROW_INSET = 16;

/**
 * One block of a settings-style menu (Profile and Account): a stone card (v9)
 * whose rows are split by hairlines. Colour is saved for Home and
 * the scan moments, so no tinted tiles here.
 */
export function MenuGroup({ children }: { children: ReactNode }) {
  // Rows only: a condition left false (`{signedIn ? <MenuRow … /> : null}`) is
  // not a row, so it doesn't count as the first.
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ borderRadius: CARD_RADIUS, backgroundColor: MENU_FILL, overflow: "hidden" }}>
      {rows.map((row, i) => cloneElement(row as ReactElement<{ divided?: boolean }>, { divided: i > 0 }))}
    </View>
  );
}

/** The grey disclosure chevron at a row's end (v7). */
export function RowChevron() {
  return (
    <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
      <Path d="m1 1 6 6-6 6" stroke={ROW_CHEVRON} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * One row of a menu: a sage line icon, the name, a value on the right (a
 * setting's current answer, or a fact like the account's email) and a grey
 * chevron when the row opens something (unless `chevron` is off). A short note can sit beside the name.
 * The hairline above it starts after the icon, and `MenuGroup` leaves it off
 * the first row.
 */
export function MenuRow({
  icon,
  label,
  badge,
  value,
  onPress,
  disabled = false,
  destructive = false,
  chevron = true,
  divided = false,
}: {
  /** Left out on a list of settings, where the name alone reads. */
  icon?: ComponentProps<typeof Ionicons>["name"];
  label: string;
  /** A short note beside the name, e.g. on a profile not filled in yet. */
  badge?: string;
  /** Shown on the right, before the chevron. */
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  /** A red name and no chevron (v7: "Delete my account"). */
  destructive?: boolean;
  /** Off for an action row that doesn't open a screen (v9 Account: "Sign out"). */
  chevron?: boolean;
  /** Set by `MenuGroup`: every row but the first has a hairline above it. */
  divided?: boolean;
}) {
  const body = (
    <>
      {icon ? <Ionicons name={icon} size={22} color={LINK} /> : null}
      <View
        style={{
          flex: 1,
          minHeight: ROW_HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingRight: ROW_INSET,
          borderTopWidth: divided ? 0.5 : 0,
          borderTopColor: HAIRLINE,
        }}
      >
        <Text style={{ flex: value ? 0 : 1, fontSize: TYPE.card, color: destructive ? DESTRUCTIVE_OUTLINE.label : INK }}>{label}</Text>
        {badge ? <Text style={{ fontSize: TYPE.label, color: MUTED }}>{badge}</Text> : null}
        {value ? (
          <Text numberOfLines={1} ellipsizeMode={onPress ? "tail" : "middle"} style={{ flex: 1, textAlign: "right", fontSize: TYPE.label, color: MUTED }}>
            {value}
          </Text>
        ) : null}
        {onPress && chevron && !destructive ? <RowChevron /> : null}
      </View>
    </>
  );
  const row = { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: ROW_INSET } as const;
  return onPress ? (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}. ${badge}` : value ? `${label}: ${value}` : label}
      accessibilityState={{ disabled }}
      // v9: a pressed row takes a soft grey fill rather than fading.
      className="active:bg-row-pressed"
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
