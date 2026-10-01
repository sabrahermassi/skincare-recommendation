import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { BottomSheet } from "@/components/BottomSheet";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { haptic } from "@/lib/haptics";
import { DESTRUCTIVE_OUTLINE, DISPLAY_FONT, INK, MUTED, TYPE, VERDICT } from "@/lib/tokens";

/** The badge at the top of the pop-up (v7; v9's soft red disc). */
const BADGE = 48;

/**
 * Every "are you sure" in the app, one way (v7): a pop-up floats up with a
 * trash badge, the question in the title face and one line on what it means,
 * then a pair of 140pt buttons — the safe choice filled, the destructive one
 * in a soft red outline. "Keep it" and a tap on the dimmed screen both close
 * it untouched.
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
}: {
  visible: boolean;
  title: string;
  line: string;
  /** The button that closes the sheet and changes nothing. */
  keepLabel: string;
  /** The button beside it that goes ahead. */
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  /** Holds the confirm while the thing it started is still running. */
  busy?: boolean;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} floating>
      <View style={{ alignItems: "center", gap: 8 }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: BADGE, height: BADGE, borderRadius: BADGE / 2, alignItems: "center", justifyContent: "center", backgroundColor: VERDICT.low.tint }}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path
              d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
              stroke={VERDICT.low.deep}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
        <Text
          accessibilityRole="header"
          style={{ marginTop: 4, textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 27.6, letterSpacing: -0.48, color: INK }}
        >
          {title}
        </Text>
        <Text style={{ maxWidth: 300, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{line}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 16 }}>
        <PrimaryButton label={keepLabel} onPress={onClose} style={{ width: BUTTON_WIDTH.pair }} />
        <Pressable
          onPress={() => {
            haptic.warning();
            onConfirm();
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: busy }}
          style={{
            width: BUTTON_WIDTH.pair,
            height: 48,
            borderRadius: 24,
            borderWidth: 1.5,
            borderColor: DESTRUCTIVE_OUTLINE.border,
            backgroundColor: DESTRUCTIVE_OUTLINE.fill,
            alignItems: "center",
            justifyContent: "center",
            opacity: busy ? 0.6 : 1,
          }}
          className="active:opacity-80"
        >
          <Text style={{ fontSize: 16, fontWeight: "600", letterSpacing: -0.16, color: DESTRUCTIVE_OUTLINE.label }}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
