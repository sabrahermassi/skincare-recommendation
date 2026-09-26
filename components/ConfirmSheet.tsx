import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { haptic } from "@/lib/haptics";
import { CARD_SHADOW, INK, MUTED, SPACE, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * Every "are you sure" in the app, one way (owner's reference): a sheet rises
 * from the bottom with a white X disc in its corner, a centred question and what it
 * means, then the safe choice as the one button and the destructive one as
 * plain words under it — so the easy tap is the one that keeps things. The X,
 * a tap on the dimmed screen, and the keep button all close it untouched.
 */
// The keep button's share of the card (owner's OnSkin reference: 43–47%).
const KEEP_WIDTH = "55%";

export function ConfirmSheet({
  visible,
  title,
  line,
  keepLabel,
  confirmLabel,
  onClose,
  onConfirm,
  busy = false,
}: {
  visible: boolean;
  title: string;
  line: string;
  /** The button that closes the sheet and changes nothing. */
  keepLabel: string;
  /** The words under it that go ahead. */
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  /** Holds the confirm while the thing it started is still running. */
  busy?: boolean;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} floating>
      {/* A plain disc, not the glass X: the sheet is a separate native window,
          and Apple's glass button in one never received a tap. */}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        className="active:opacity-70"
        style={{
          alignSelf: "flex-end",
          width: TOUCH_TARGET,
          height: TOUCH_TARGET,
          borderRadius: TOUCH_TARGET / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: SURFACE,
          ...CARD_SHADOW,
        }}
      >
        <Ionicons name="close" size={24} color={INK} />
      </Pressable>
      <View style={{ alignItems: "center", gap: SPACE.text }}>
        <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: "PlayfairDisplay_600SemiBold", fontSize: TYPE.heading, color: INK }}>
          {title}
        </Text>
        <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: TYPE.body * 1.4, color: MUTED }}>{line}</Text>
      </View>
      <View style={{ alignItems: "center", gap: SPACE.text, marginTop: SPACE.text }}>
        {/* About half the card's width, centred, as in the reference. */}
        <PrimaryButton label={keepLabel} onPress={onClose} style={{ width: KEEP_WIDTH }} />
        <Pressable
          onPress={() => {
            haptic.warning();
            onConfirm();
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          style={{ minHeight: TOUCH_TARGET, paddingHorizontal: SPACE.block, justifyContent: "center" }}
          className="active:opacity-70"
        >
          <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
