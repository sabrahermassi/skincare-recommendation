import { Pressable, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { CloseCross, IconCircle } from "@/components/IconCircle";
import { BUTTON_HEIGHT, BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { noOrphan } from "@/lib/text";
import { haptic } from "@/lib/haptics";
import { DESTRUCTIVE_OUTLINE, DISPLAY_FONT, INK, MUTED, TOUCH_TARGET, TYPE, SPACE, LEADING, TRACKING } from "@/lib/tokens";

/**
 * Every "are you sure" in the app, one way (owner's reference, 2 October
 * 2026): a pop-up floats up with a close button in its corner, the question
 * in the title face and one line on what it means, then one button, the
 * destructive action as a soft red pill. The X and a tap on the dimmed screen
 * close it untouched. The account's (`stacked`) adds a filled "keep" button
 * above the action, which is then plain words.
 */
export function ConfirmSheet({
  visible,
  title,
  line,
  keepLabel,
  confirmLabel,
  onClose,
  onConfirm,
  busy = false,
  stacked = false,
}: {
  visible: boolean;
  title: string;
  line: string;
  /** The filled button that closes the sheet and changes nothing. Only with `stacked`. */
  keepLabel?: string;
  /** The button beside it that goes ahead. */
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  /** Holds the confirm while the thing it started is still running. */
  busy?: boolean;
  /**
   * The account's look (owner's reference, 2 October 2026): a close button in
   * the corner and no badge, the safe choice as the one filled button, and
   * the destructive one as plain words under it.
   */
  stacked?: boolean;
}) {
  const corner = (
    <IconCircle onPress={onClose} accessibilityLabel="Close">
      <CloseCross />
    </IconCircle>
  );
  if (stacked) {
    return (
      <BottomSheet visible={visible} onClose={onClose} floating corner={corner}>
        <View style={{ alignItems: "center", gap: SPACE.text, paddingTop: SPACE.large }}>
          <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: LEADING.heading, letterSpacing: TRACKING.heading, color: INK }}>
            {noOrphan(title)}
          </Text>
          <Text style={{ maxWidth: 300, textAlign: "center", fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{noOrphan(line)}</Text>
          <PrimaryButton label={keepLabel ?? ""} onPress={onClose} style={{ marginTop: SPACE.gutter, width: BUTTON_WIDTH.secondary }} />
          <Pressable
            onPress={() => {
              haptic.warning();
              onConfirm();
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            accessibilityState={{ disabled: busy }}
            style={{ minHeight: TOUCH_TARGET, paddingHorizontal: SPACE.gutter, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: TYPE.card, fontWeight: "600", letterSpacing: TRACKING.card, color: INK }}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    );
  }
  return (
    <BottomSheet visible={visible} onClose={onClose} floating corner={corner}>
      <View style={{ alignItems: "center", gap: SPACE.text, paddingTop: SPACE.large }}>
        <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: LEADING.heading, letterSpacing: TRACKING.heading, color: INK }}>
          {noOrphan(title)}
        </Text>
        <Text style={{ maxWidth: 300, textAlign: "center", fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{noOrphan(line)}</Text>
        <Pressable
          onPress={() => {
            haptic.warning();
            onConfirm();
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: busy }}
          // The short width (140): the label is one word.
          style={{ marginTop: SPACE.gutter, width: BUTTON_WIDTH.pair, height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: DESTRUCTIVE_OUTLINE.fill, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}
          className="active:opacity-80"
        >
          <Text style={{ fontSize: TYPE.card, fontWeight: "600", letterSpacing: TRACKING.card, color: DESTRUCTIVE_OUTLINE.label }}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
