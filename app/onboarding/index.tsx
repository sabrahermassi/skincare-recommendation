import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
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

import { LogoMark } from "@/components/LogoMark";
import { WelcomeBackdrop } from "@/components/OnboardingBottles";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { AvatarHalo, BubbleField } from "@/components/WelcomeBubbles";
import { Eyebrow, Wordmark } from "@/components/Wordmark";

import { POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const AnimatedImage = Animated.createAnimatedComponent(Image);

/**
 * The mount-in sequence: bottle backdrop fades, avatar pops with an overshoot
 * bounce, then the lockup, copy and actions rise in behind it. Each progress
 * value's resting state is 1 (fully entered) — reduced motion just never
 * moves it off that, and the screen renders in its finished layout with no
 * animation at all, rather than hidden content that never plays.
 */
function useEntranceProgress(
  delayMs: number,
  durationMs: number,
  easing: EasingFunction | EasingFunctionFactory
) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(1);
  // Captured once: an inline Easing.* call creates a new function every
  // render, and this effect must fire only on mount, not on every re-render
  // that would otherwise put a fresh easing reference in its deps.
  const config = useRef({ delayMs, durationMs, easing }).current;

  useEffect(() => {
    if (reducedMotion) return;
    progress.value = 0;
    progress.value = withDelay(
      config.delayMs,
      withTiming(1, { duration: config.durationMs, easing: config.easing })
    );
  }, [reducedMotion, config, progress]);

  return progress;
}

/** opacity 0->1, translateY 14px->0 — the bb-rise keyframe. */
function useRiseStyle(progress: ReturnType<typeof useEntranceProgress>) {
  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [14, 0]) }],
  }));
}

/**
 * Welcome — the first screen of the app, from the
 * `design_handoff_skintel_onboarding` package (`welcome-onboarding.html`).
 *
 * Two elastic spacers do the vertical centring rather than fixed margins, so
 * the content block compresses on a short device instead of overflowing —
 * the handoff calls out 375×667 and 430×932 as the two shapes to check.
 *
 * The headline is deliberately body-sized (15px, same as the paragraph under
 * it) — the handoff is explicit that the avatar and the logo lockup carry
 * the hierarchy here, not a display headline.
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const skipOnboarding = useAppStore((s) => s.skipOnboarding);

  /**
   * Skipping has to record that onboarding was shown, otherwise the browse
   * screen's gate sends the user straight back here and the button appears
   * to do nothing. Browsing without a profile is supported — the list falls
   * back to unpersonalised, unsorted results with no match badges.
   */
  function skip() {
    skipOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  // Delays/durations/easings straight from design_handoff_skintel_bubbles's
  // entrance table. The avatar's overshoot bezier is what gives the pop its
  // bounce — a plain ease-out reads as a fade.
  const backdropProgress = useEntranceProgress(150, 700, Easing.out(Easing.ease));
  const avatarProgress = useEntranceProgress(0, 680, Easing.bezier(0.34, 1.32, 0.64, 1));
  const lockupProgress = useEntranceProgress(340, 600, Easing.out(Easing.ease));
  const copyProgress = useEntranceProgress(460, 600, Easing.out(Easing.ease));
  const actionsProgress = useEntranceProgress(580, 600, Easing.out(Easing.ease));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropProgress.value }));
  const avatarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(avatarProgress.value, [0, 0.6, 1], [0, 1, 1]),
    transform: [{ scale: interpolate(avatarProgress.value, [0, 0.6, 1], [0.86, 1.03, 1]) }],
  }));
  const lockupStyle = useRiseStyle(lockupProgress);
  const copyStyle = useRiseStyle(copyProgress);
  const actionsStyle = useRiseStyle(actionsProgress);

  return (
    <View style={{ flex: 1, backgroundColor: "#FAF7F3", overflow: "hidden" }}>
      <Animated.View
        style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, backdropStyle]}
      >
        <WelcomeBackdrop />
      </Animated.View>

      <View style={{ flex: 1, minHeight: Math.max(72, insets.top + 12) }} />

      <View style={{ alignItems: "center", paddingHorizontal: 24 }}>
        <View style={{ width: 152, height: 152 }}>
          <AvatarHalo />
          <AnimatedImage
            source={require("@/assets/images/avatar-round.png")}
            style={[{ width: 152, height: 152, borderRadius: 76 }, avatarStyle]}
            contentFit="cover"
            accessibilityLabel=""
          />
          <BubbleField />
        </View>
      </View>

      <View style={{ alignItems: "center", gap: 26, paddingHorizontal: 24, paddingTop: 24 }}>
        <Animated.View style={[{ alignItems: "center", gap: 11 }, lockupStyle]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
            <LogoMark size={46} />
            <Wordmark size={42} />
          </View>
          <Eyebrow size={8} />
        </Animated.View>

        <Animated.View style={[{ alignItems: "center", gap: 8 }, copyStyle]}>
          <Text
            style={{
              textAlign: "center",
              fontSize: 15,
              fontWeight: "600",
              lineHeight: 22.5,
              letterSpacing: -0.075,
              color: "#5B5366",
            }}
          >
            Find the right product for your skin
          </Text>
          {/* Two short sentences, each its own line — one line each reads
              faster than the same words wrapped as a single flowing
              paragraph, and centred text wraps unpredictably depending on
              device width, which used to break the sentence in an
              arbitrary place instead of a chosen one. */}
          <Text
            style={{
              textAlign: "center",
              fontSize: 15,
              lineHeight: 23.25,
              color: "#8C8592",
            }}
          >
            Four quick questions about your skin.{"\n"}
            Scan any product to see how well it matches - including the
            ingredients that don&apos;t suit you.
          </Text>
        </Animated.View>
      </View>

      <View style={{ flex: 1, minHeight: 36 }} />

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(40, insets.bottom + 16) }}>
        {/* The rise transform lives on this inner wrapper, not on the group
            that owns the bottom padding above — the screen is
            overflow:hidden, so a translateY at rest on the padded group
            itself would land its bottom edge past the frame and clip the
            button. */}
        <Animated.View style={[{ gap: 14 }, actionsStyle]}>
          {/* PrimaryButton, not a styled <Link> and not a height utility —
              see components/PrimaryButton.tsx for why the height is inline. */}
          <PrimaryButton
            label="Get started"
            onPress={() => router.push("/onboarding/about-you")}
          />
          {/* The handoff's own visible metrics are 13.5px text with 8px
              vertical padding — under the 44pt touch minimum. hitSlop
              expands the target without changing what's drawn. */}
          <Pressable onPress={skip} hitSlop={8} className="py-2">
            <Text className="text-center text-[13.5px] font-medium text-ink-muted">
              Skip for now
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
