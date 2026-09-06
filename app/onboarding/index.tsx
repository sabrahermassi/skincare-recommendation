import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type EasingFunction,
  type EasingFunctionFactory,
} from "react-native-reanimated";

import { EllowMark } from "@/components/EllowMark";
import { EllowStepStrip } from "@/components/EllowStepStrip";
import { EllowTagline, EllowWordmark } from "@/components/EllowWordmark";
import { Text } from "@/components/Text";
import { AvatarHalo, BubbleField } from "@/components/WelcomeBubbles";
import { WelcomeBackdrop } from "@/components/WelcomeBackdrop";

import { POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const AnimatedImage = Animated.createAnimatedComponent(Image);

/**
 * The mount-in sequence: avatar pops with an overshoot bounce, then the
 * lockup, copy + strip, and actions rise in behind it. Each progress value's
 * resting state is 1 (fully entered) — reduced motion just never moves it off
 * that, so the screen renders in its finished layout with no animation at
 * all, rather than hidden content that never plays.
 */
function useEntranceProgress(
  delayMs: number,
  durationMs: number,
  easing: EasingFunction | EasingFunctionFactory
) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  // Captured once: an inline Easing.* call creates a new function every
  // render, and this effect must fire only on mount, not on every re-render
  // that would otherwise put a fresh easing reference in its deps. A lazy
  // useState initializer (rather than a ref read during render) is the
  // React-sanctioned way to compute a value once and hold it stable.
  const [config] = useState({ delayMs, durationMs, easing });

  useEffect(() => {
    if (reducedMotion) return;
    progress.value = withDelay(
      config.delayMs,
      withTiming(1, { duration: config.durationMs, easing: config.easing })
    );
  }, [reducedMotion, config, progress]);

  return progress;
}

/** opacity 0->1, translateY 14px->0 — the cl-rise keyframe. */
function useRiseStyle(progress: ReturnType<typeof useEntranceProgress>) {
  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [14, 0]) }],
  }));
}

/**
 * Welcome — the first screen of the app, from
 * `design_handoff_ellow_welcome` (`welcome.html`). Replaces the earlier
 * SkinTell-branded Welcome screen.
 *
 * Two elastic spacers do the vertical centring rather than fixed margins, so
 * the content block compresses on a short device instead of overflowing —
 * the handoff calls out 375x667 and 430x932 as the two shapes to check.
 *
 * The headline is deliberately body-sized (15px, same as the paragraph under
 * it) — per the handoff, the avatar and the three-step strip carry the
 * hierarchy here, not a display headline. The primary CTA leads with
 * scanning (not the quiz) because the screen's one job is to make it
 * unmistakable that this app scans products, not faces.
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const skipOnboarding = useAppStore((s) => s.skipOnboarding);

  function scanFirstProduct() {
    skipOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  function setUpProfileFirst() {
    router.push("/onboarding/concerns");
  }

  // Delays/durations/easings straight from the handoff's entrance table. The
  // avatar's overshoot bezier is what gives the pop its bounce — a plain
  // ease-out reads as a fade.
  const avatarProgress = useEntranceProgress(0, 700, Easing.bezier(0.34, 1.32, 0.64, 1));
  const lockupProgress = useEntranceProgress(380, 600, Easing.out(Easing.ease));
  const copyProgress = useEntranceProgress(500, 600, Easing.out(Easing.ease));
  const actionsProgress = useEntranceProgress(620, 600, Easing.out(Easing.ease));

  const avatarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(avatarProgress.value, [0, 0.6, 1], [0, 1, 1]),
    transform: [{ scale: interpolate(avatarProgress.value, [0, 0.6, 1], [0.88, 1.03, 1]) }],
  }));
  const lockupStyle = useRiseStyle(lockupProgress);
  const copyStyle = useRiseStyle(copyProgress);
  const stripStyle = useRiseStyle(copyProgress);
  const actionsStyle = useRiseStyle(actionsProgress);

  return (
    <View style={{ flex: 1, backgroundColor: "#FAF7F3", overflow: "hidden" }}>
      <WelcomeBackdrop />
      <BubbleField />

      <View style={{ flex: 1, minHeight: Math.max(52, insets.top) }} />

      <View style={{ alignItems: "center", paddingHorizontal: 24 }}>
        <View style={{ width: 150, height: 150 }}>
          <AvatarHalo />
          <AnimatedImage
            source={require("@/assets/images/v2/avatar.png")}
            style={[{ width: 150, height: 150, borderRadius: 150 }, avatarStyle]}
            contentFit="cover"
            accessibilityLabel=""
          />
        </View>
      </View>

      <View style={{ alignItems: "center", gap: 22, paddingHorizontal: 24, paddingTop: 22 }}>
        <Animated.View style={[{ alignItems: "center", gap: 12 }, lockupStyle]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
            <EllowMark size={44} />
            <EllowWordmark size={42} />
          </View>
          <EllowTagline size={8.5} />
        </Animated.View>

        <Animated.View style={[{ alignItems: "center", gap: 9 }, copyStyle]}>
          <Text
            style={{
              textAlign: "center",
              fontSize: 15,
              fontWeight: "600",
              lineHeight: 22.5,
              letterSpacing: 15 * -0.005,
              color: "#5B5366",
            }}
          >
            Scan any skincare product
          </Text>
          <Text
            style={{
              textAlign: "center",
              fontSize: 15,
              lineHeight: 23.25,
              color: "#8C8592",
            }}
          >
            Answer three questions about your skin, then scan a barcode or
            ingredient list to see how well that product suits you.
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={stripStyle}>
        <EllowStepStrip />
      </Animated.View>

      <View style={{ flex: 1, minHeight: 26 }} />

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(40, insets.bottom + 16) }}>
        {/* The rise transform lives on this inner wrapper, not on the group
            that owns the bottom padding above — the screen is
            overflow:hidden, so a translateY at rest on the padded group
            itself would land its bottom edge past the frame and clip the
            button. */}
        <Animated.View style={[{ gap: 14 }, actionsStyle]}>
          {/* Literal spec colour (#8B7FB6), not the shared PrimaryButton's
              accent token — this screen's own design tokens intentionally
              differ from the app's AA-driven accent (#7A6BB0), which the
              handoff itself lists as this button's pressed state. */}
          <Pressable
            onPress={scanFirstProduct}
            accessibilityRole="button"
            style={{
              height: 56,
              borderRadius: 11,
              backgroundColor: "#8B7FB6",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFFFFF" }}>
              Scan my first product
            </Text>
          </Pressable>
          {/* The handoff's own visible metrics are 13.5px text with 8px
              vertical padding — under the 44pt touch minimum. hitSlop
              expands the target without changing what's drawn. */}
          <Pressable onPress={setUpProfileFirst} hitSlop={8} style={{ paddingVertical: 8 }}>
            <Text style={{ textAlign: "center", fontSize: 13.5, fontWeight: "500", color: "#8C8592" }}>
              Set up my skin profile first
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
