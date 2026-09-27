import { BlurView } from "expo-blur";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { reduceMotionNow } from "@/lib/reduce-motion";
import { FLOATING_SHADOW, SCRIM, SURFACE } from "@/lib/tokens";

const IN_MS = 280;
const OUT_MS = 220;
// The floating card (owner's OnSkin reference, and the result-screen handoff):
// how far it stands off the screen's sides and bottom, its corners, which
// follow the phone's own, and how much the screen behind it blurs.
const FLOAT_INSET = 10;
const FLOAT_RADIUS = 44;
const FLOAT_BLUR = 12;
// The room a sheet always leaves above itself, under the status bar, so a
// long one stops short of the top and scrolls instead (its corner stays
// reachable).
const TOP_GAP = 12;

/**
 * A card that slides up from the bottom over a dimmed screen, and back down —
 * the iOS sheet (#313). The note editor and the routine-step picker used to
 * fade in as centred dialogs, which is how iOS shows an alert, not a sheet of
 * choices or a text field.
 *
 * The dim fades while the card moves: a plain `Modal animationType="slide"`
 * would slide the dim up with it. With Reduce Motion on, nothing moves; the
 * sheet just appears and goes.
 *
 * A sheet never grows past the top of the screen: longer content scrolls
 * inside it, and `corner` (a close button) stays pinned to its top-right
 * rather than scrolling away with the content.
 */
export function BottomSheet({
  visible,
  onClose,
  floating = false,
  corner,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /**
   * A card that floats clear of the screen's edges, rounded on every corner,
   * over a blurred screen: the confirmation look (owner's OnSkin reference).
   */
  floating?: boolean;
  /** Pinned to the card's top-right corner, outside the scroll: its X. */
  corner?: ReactNode;
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
  const maxHeight = height - insets.top - TOP_GAP - (floating ? FLOAT_INSET : 0);
  const padding = { padding: 24, paddingBottom: floating ? Math.max(24, insets.bottom) : Math.max(24, insets.bottom + 12), gap: 14 };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: progress }}>
          {floating ? <BlurView intensity={FLOAT_BLUR} tint="default" style={StyleSheet.absoluteFill} /> : null}
          <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: SCRIM }} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY }] }}>
          <View
            testID="sheet-card"
            style={[
              floating
                ? { marginHorizontal: FLOAT_INSET, marginBottom: FLOAT_INSET, borderRadius: FLOAT_RADIUS }
                : { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
              { maxHeight, backgroundColor: SURFACE, ...FLOATING_SHADOW },
            ]}
          >
            {/* Rounded clipping lives on this inner view, so the shadow above
                isn't clipped with it. */}
            <View
              style={
                floating
                  ? { borderRadius: FLOAT_RADIUS, overflow: "hidden", flexShrink: 1 }
                  : { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden", flexShrink: 1 }
              }
            >
              <ScrollView
                testID="sheet-scroll"
                style={{ flexGrow: 0 }}
                contentContainerStyle={padding}
                alwaysBounceVertical={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            </View>
            {corner ? <View style={{ position: "absolute", top: 16, right: 16 }}>{corner}</View> : null}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
