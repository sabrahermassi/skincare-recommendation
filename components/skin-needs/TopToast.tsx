import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Tick } from "@/components/skin-needs/bits";
import { Text } from "@/components/Text";
import { BUTTON, INK, MUTED_FAINT, SKIN_NEEDS, SPACE, SURFACE, WHITE, TYPE } from "@/lib/tokens";

/** About five seconds (hand-off); a new one starts the count again. */
const TOAST_MS = 5000;

/** What the toast says; `id` changes with every new one, which restarts its clock. */
export type TopNotice = { id: number; title: string; line: string; undo?: () => void };

/**
 * Skin needs' toast (hand-off 7d, 7e, C1): a white pill at the top of the
 * story, a sage tick, what happened and where, and Undo. It goes after about
 * five seconds, or when Undo is tapped; a screen reader hears it.
 */
export function TopToast({ notice, onDone, top = 4 }: { notice: TopNotice | null; onDone: () => void; /** Below the safe area: the story passes its header's height, so the close button stays uncovered. */ top?: number }) {
  const insets = useSafeAreaInsets();
  const id = notice?.id;
  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [id, onDone]);

  return (
    <>
      <ScreenReaderAnnouncer message={notice ? `${notice.title}. ${notice.line}.${notice.undo ? " Undo available." : ""}` : ""} />
      {notice ? (
        <View
          testID="top-toast"
          style={{
            position: "absolute",
            top: insets.top + top,
            left: SPACE.gutter,
            right: SPACE.gutter,
            zIndex: 5,
            minHeight: 56,
            borderRadius: 28,
            backgroundColor: SURFACE,
            paddingLeft: 12,
            paddingRight: notice.undo ? 12 : 20,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            ...SKIN_NEEDS.toastShadow,
          }}
        >
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: BUTTON.primary.fill, alignItems: "center", justifyContent: "center" }}>
            <Tick size={16} color={WHITE} weight={3.2} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>{notice.title}</Text>
            <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>{notice.line}</Text>
          </View>
          {notice.undo ? (
            <Pressable
              onPress={() => {
                notice.undo?.();
                onDone();
              }}
              accessibilityRole="button"
              accessibilityLabel="Undo"
              hitSlop={4}
              style={{ height: 40, paddingHorizontal: 4, justifyContent: "center" }}
              className="active:opacity-70"
            >
              <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: BUTTON.primary.fill }}>Undo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}
