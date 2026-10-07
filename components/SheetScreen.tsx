import { BlurView } from "expo-blur";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { FLOAT_INSET } from "@/components/BottomSheet";
import { goBackOrHome } from "@/lib/go-back";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { SHEET_EASE } from "@/lib/sheet-ease";
import { SCRIM, SHEET, SHEET_SHADOW, RADIUS } from "@/lib/tokens";

const IN_MS = 280;
// How far under the top of the screen a tall sheet stops (v9: `100% - 72px`).
const TOP_GAP = 72;

/**
 * A whole route drawn as a floating sheet (v9): the ingredient, and How
 * scoring works. The route is presented as a transparent modal
 * (`app/_layout.tsx`), so the screen it was opened from stays visible, dimmed
 * and lightly blurred, behind a white card 10pt off the sides and bottom.
 * `header` stays pinned at the card's top (the title and the close circle);
 * `children` are the sheet's body, which the caller scrolls. Tapping the dim
 * closes it, like the close circle. The card slides up as it opens; with
 * Reduce Motion on it just appears.
 *
 * A route rather than a `BottomSheet`, so a link can still open it, and
 * closing it is an ordinary Back.
 */
export function SheetScreen({ header, children, onClose = goBackOrHome }: { header: ReactNode; children: ReactNode; onClose?: () => void }) {
  const { height } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(reduceMotionNow() ? 1 : 0));
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: reduceMotionNow() ? 0 : IN_MS, easing: SHEET_EASE, useNativeDriver: Platform.OS !== "web" }).start();
  }, [progress]);

  return (
    <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <BlurView intensity={4} tint="default" style={StyleSheet.absoluteFill} />
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1, backgroundColor: SCRIM }} />
      </Animated.View>
      <Animated.View
        style={{
          marginHorizontal: FLOAT_INSET,
          // 10pt off the bottom like every other pop-up (`BottomSheet`'s
          // floating card). It used to clear the home indicator as well, and
          // sat 24pt higher than the rest (owner).
          marginBottom: FLOAT_INSET,
          maxHeight: height - TOP_GAP - FLOAT_INSET,
          borderRadius: RADIUS.sheet,
          backgroundColor: SHEET,
          ...SHEET_SHADOW,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.4, 0] }) }],
        }}
      >
        {/* Rounded clipping lives on this inner view, so the shadow above isn't clipped with it. */}
        <View testID="sheet-screen" style={{ borderRadius: RADIUS.sheet, overflow: "hidden", flexShrink: 1 }}>
          {header}
          {children}
        </View>
      </Animated.View>
    </View>
  );
}
