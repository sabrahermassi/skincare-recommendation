import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FLOATING_SHADOW, SCRIM, SURFACE } from "@/lib/tokens";

const IN_MS = 280;
const OUT_MS = 220;

/**
 * A card that slides up from the bottom over a dimmed screen, and back down —
 * the iOS sheet (#313). The note editor and the routine-step picker used to
 * fade in as centred dialogs, which is how iOS shows an alert, not a sheet of
 * choices or a text field.
 *
 * The dim fades while the card moves: a plain `Modal animationType="slide"`
 * would slide the dim up with it. With Reduce Motion on, nothing moves; the
 * sheet just appears and goes.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [progress] = useState(() => new Animated.Value(0));
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reduceMotion.current = enabled;
      })
      .catch(() => {});
  }, []);

  // Mounted as soon as it is asked for, during render rather than in the
  // effect below; unmounted only once the slide-down has finished.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion.current ? 0 : visible ? IN_MS : OUT_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: progress }}>
          <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: SCRIM }} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY }] }}>
          <View
            style={{
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              backgroundColor: SURFACE,
              padding: 24,
              paddingBottom: Math.max(24, insets.bottom + 12),
              gap: 14,
              ...FLOATING_SHADOW,
            }}
          >
            {children}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
