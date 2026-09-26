import { BlurView } from "expo-blur";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { reduceMotionNow } from "@/lib/reduce-motion";
import { FLOATING_SHADOW, SCRIM, SURFACE } from "@/lib/tokens";

const IN_MS = 280;
const OUT_MS = 220;
// The floating card (owner's OnSkin reference, measured off its screenshot):
// how far it stands off the screen's sides and bottom, its corners, which
// follow the phone's own, and how much the screen behind it blurs.
const FLOAT_INSET = 7;
const FLOAT_RADIUS = 44;
const FLOAT_BLUR = 12;

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
  floating = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /**
   * A card that floats clear of the screen's edges, rounded on every corner,
   * over a blurred screen: the confirmation look (owner's OnSkin reference).
   */
  floating?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [progress] = useState(() => new Animated.Value(0));
  // Mounted as soon as it is asked for, during render rather than in the
  // effect below; unmounted only once the slide-down has finished.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotionNow() ? 0 : visible ? IN_MS : OUT_MS,
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
          {floating ? <BlurView intensity={FLOAT_BLUR} tint="default" style={StyleSheet.absoluteFill} /> : null}
          <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: SCRIM }} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY }] }}>
          <View
            style={
              floating
                ? {
                    marginHorizontal: FLOAT_INSET,
                    marginBottom: FLOAT_INSET,
                    borderRadius: FLOAT_RADIUS,
                    backgroundColor: SURFACE,
                    padding: 24,
                    paddingBottom: Math.max(24, insets.bottom),
                    gap: 14,
                    ...FLOATING_SHADOW,
                  }
                : {
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    backgroundColor: SURFACE,
                    padding: 24,
                    paddingBottom: Math.max(24, insets.bottom + 12),
                    gap: 14,
                    ...FLOATING_SHADOW,
                  }
            }
          >
            {children}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
