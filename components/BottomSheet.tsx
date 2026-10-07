import { BlurView } from "expo-blur";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { reduceMotionNow } from "@/lib/reduce-motion";
import { INK, SCRIM, SHEET_SHADOW, WHITE, withAlpha, RADIUS, SPACE, GLASS_FROST } from "@/lib/tokens";
import { Glass, hasLiquidGlass, OnGlass } from "@/components/Glass";

const IN_MS = 280;
const OUT_MS = 220;
// The floating pop-up (v7): 10pt off the screen's sides and bottom, radius 36,
// over a lightly blurred screen. A bottom sheet's top corners are 38, with a
// grabber.
export const FLOAT_INSET = 10;
const FLOAT_BLUR = 4; // v9
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
  bare = false,
  inline = false,
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
  /** No padding of the sheet's own: the content runs to its edges (a sheet with a coloured top half). */
  bare?: boolean;
  /**
   * Drawn over the screen it is in, not in a window of its own. For a sheet
   * whose button opens another screen: iOS will not present a screen while a
   * `Modal` is still up, so the new screen waited for this one to close and
   * be torn down first (about a second). The caller must render it at the
   * root of a full-screen view.
   */
  inline?: boolean;
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
  // v7 pop-up padding: SPACE.section top and bottom, 16 at the sides.
  const padding = bare
    ? {}
    : floating
    ? { paddingTop: SPACE.section, paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.section, gap: SPACE.text }
    : { paddingTop: SPACE.large, paddingHorizontal: SPACE.gutter, paddingBottom: Math.max(24, insets.bottom + 12), gap: SPACE.block };

  const body = (
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
                ? { marginHorizontal: FLOAT_INSET, marginBottom: FLOAT_INSET, borderRadius: RADIUS.sheet }
                : { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet },
              // v9: pure white sheets; a floating pop-up is Liquid Glass where the phone has it, and lights and shades itself.
              { maxHeight, ...(floating && hasLiquidGlass ? null : { backgroundColor: WHITE, ...SHEET_SHADOW }) },
            ]}
          >
            {floating && hasLiquidGlass ? <Glass tint={GLASS_FROST} style={[StyleSheet.absoluteFill, { borderRadius: RADIUS.sheet }]} /> : null}
            {/* Rounded clipping lives on this inner view, so the shadow above
                isn't clipped with it. */}
            <View
              style={
                floating
                  ? { borderRadius: RADIUS.sheet, overflow: "hidden", flexShrink: 1 }
                  : { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, overflow: "hidden", flexShrink: 1 }
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
            {/* A bottom sheet's grabber (v7): 36 × 5, near the top. */}
            {floating ? null : (
              <View
                pointerEvents="none"
                style={{ position: "absolute", top: 8, alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: withAlpha(INK, 0.18) }}
              />
            )}
            {corner ? (
              <View style={{ position: "absolute", top: 16, right: 16 }}>
                <OnGlass.Provider value={floating && hasLiquidGlass}>{corner}</OnGlass.Provider>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
  );
  if (inline) {
    return mounted ? (
      // A screen reader stays inside it while it is up, as it would in a Modal.
      <View accessibilityViewIsModal={visible} onAccessibilityEscape={onClose} style={StyleSheet.absoluteFill}>
        {body}
      </View>
    ) : null;
  }
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}
