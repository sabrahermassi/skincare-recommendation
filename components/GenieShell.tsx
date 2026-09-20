import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { genie } from "@/lib/genie";
import { SCAN_BUTTON } from "@/lib/tab-bar";
import { TERRACOTTA } from "@/components/shell/shared";
import { CANVAS, RAISED_SHADOW, SURFACE } from "@/lib/tokens";

const OPEN_MS = 520;
const CLOSE_MS = 400;

export type GenieShellHandle = {
  /** Folds the screen back into the scan button, then calls `then`. */
  close: (then: () => void) => void;
};

/**
 * Wraps a full-screen screen so it opens out of the tab bar's scan button and
 * folds back into it, like a genie leaving and returning to its lamp: the
 * screen grows from the button's spot — narrower before it is tall, so it
 * unfurls rather than just scaling — while a copy of the button fades over the
 * first moments. Only a scan-button press animates it (`genie.opening`); a cold
 * start or a deep link shows the screen at once. With Reduce Motion on there is
 * no movement, only the screen appearing and going.
 */
export function GenieShell({ children, ref }: { children: ReactNode; ref?: Ref<GenieShellHandle> }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const useNativeDriver = Platform.OS !== "web";
  // 0 = folded into the button, 1 = full screen. Starts full so nothing is
  // hidden on a cold start; a button press sets it to 0 before opening.
  const [progress] = useState(() => new Animated.Value(1));
  // null until the setting has been read, so the first open can wait for the answer
  // instead of playing the full animation for someone who has Reduce Motion on.
  const reduceMotion = useRef<boolean | null>(null);
  // Built once. Written inline they were new animated nodes on every render of
  // the scanner, and the native animation graph was rebuilt each time.
  const [fx] = useState(() => ({
    shellOpacity: progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
    scaleX: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.06, 0.55, 1] }),
    scaleY: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.02, 0.3, 1] }),
    ghostOpacity: progress.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: "clamp" }),
  }));

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reduceMotion.current = enabled;
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      reduceMotion.current = enabled;
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!genie.opening) {
        progress.setValue(1);
        return;
      }
      genie.opening = false;
      progress.setValue(0);
      let cancelled = false;
      const open = () => {
        if (cancelled) return;
        Animated.timing(progress, {
          toValue: 1,
          duration: reduceMotion.current ? 0 : OPEN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver,
        }).start();
      };
      if (reduceMotion.current === null) {
        // First open: the read above has not landed yet. Ask again and open when it has.
        AccessibilityInfo.isReduceMotionEnabled()
          .then((enabled) => {
            reduceMotion.current = enabled;
          })
          .catch(() => {
            reduceMotion.current = false;
          })
          .then(open);
      } else {
        open();
      }
      return () => {
        cancelled = true;
      };
    }, [progress, useNativeDriver]),
  );

  useImperativeHandle(
    ref,
    () => ({
      close: (then) => {
        Animated.timing(progress, {
          toValue: 0,
          duration: reduceMotion.current ? 0 : CLOSE_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver,
        }).start(({ finished }) => {
          if (finished) then();
        });
      },
    }),
    [progress, useNativeDriver],
  );

  const origin = genie.origin ?? { x: width / 2, y: height - insets.bottom - 40 };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: fx.shellOpacity,
          transform: [
            { scaleX: fx.scaleX },
            { scaleY: fx.scaleY },
          ],
          transformOrigin: [origin.x, origin.y, 0],
        }}
      >
        {children}
      </Animated.View>

      {/* The button, standing in for itself while the screen is folded into it. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: origin.x - SCAN_BUTTON / 2,
          top: origin.y - SCAN_BUTTON / 2,
          width: SCAN_BUTTON,
          height: SCAN_BUTTON,
          borderRadius: SCAN_BUTTON / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: TERRACOTTA,
          ...RAISED_SHADOW,
          opacity: fx.ghostOpacity,
        }}
      >
        <Ionicons name="camera" size={28} color={SURFACE} />
      </Animated.View>
    </View>
  );
}
