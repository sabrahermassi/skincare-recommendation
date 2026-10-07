import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Text } from "@/components/Text";
import { SCAN_BUTTON_LIFT, TAB_BAR_HEIGHT, tabBarBottom } from "@/lib/tab-bar";
import { SPACE, TOAST, TYPE } from "@/lib/tokens";
import { Glass, hasLiquidGlass } from "@/components/Glass";

/** How long the toast stays (v9: 4 s); a new one starts the count again. */
const UNDO_MS = 4000;
// The pill's height, and its Undo button's (v9).
const HEIGHT = 48;
const ACTION_HEIGHT = 40;

/** What the toast is saying; `id` changes with every removal, which restarts its clock. */
export type UndoNotice = { id: number; message: string; undo: () => void };

/**
 * "Removed from saved · Undo" (v9): an ink pill floating just above the tab
 * bar after something is taken off a list at once, with a way to put it back.
 * It goes after `UNDO_MS`, or when Undo is tapped; a screen reader hears it.
 */
export function UndoToast({ notice, onDone }: { notice: UndoNotice | null; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const id = notice?.id;
  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(onDone, UNDO_MS);
    return () => clearTimeout(timer);
  }, [id, onDone]);

  return (
    <>
      <ScreenReaderAnnouncer message={notice ? `${notice.message}. Undo available.` : ""} />
      {notice ? (
        <View
          testID="undo-toast"
          style={{
            position: "absolute",
            left: SPACE.gutter,
            right: SPACE.gutter,
            // Above the raised scan button, not only the bar: the button stands taller than the bar's top edge.
            bottom: tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT + SCAN_BUTTON_LIFT + SPACE.text,
            height: HEIGHT,
            borderRadius: HEIGHT / 2,
            ...(hasLiquidGlass ? null : { backgroundColor: TOAST.fill, ...TOAST.shadow }),
            paddingLeft: SPACE.inset,
            paddingRight: SPACE.text,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {hasLiquidGlass ? <Glass tint={TOAST.fill} style={[StyleSheet.absoluteFill, { borderRadius: HEIGHT / 2 }]} /> : null}
          <Text numberOfLines={1} style={{ flex: 1, fontSize: TYPE.body, color: TOAST.label }}>
            {notice.message}
          </Text>
          <Pressable
            onPress={() => {
              notice.undo();
              onDone();
            }}
            accessibilityRole="button"
            accessibilityLabel="Undo"
            hitSlop={4}
            style={{ height: ACTION_HEIGHT, paddingHorizontal: SPACE.block, justifyContent: "center" }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: TOAST.action }}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}
