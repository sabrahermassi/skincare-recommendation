import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LogoMark } from "@/components/LogoMark";
import { WelcomeBackdrop } from "@/components/OnboardingBottles";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { Eyebrow, Wordmark } from "@/components/Wordmark";

import { POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

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

  return (
    <View style={{ flex: 1, backgroundColor: "#FAF7F3", overflow: "hidden" }}>
      <WelcomeBackdrop />

      <View style={{ flex: 1, minHeight: Math.max(72, insets.top + 12) }} />

      <View style={{ alignItems: "center", paddingHorizontal: 24 }}>
        <Image
          source={require("@/assets/images/avatar-round.png")}
          style={{ width: 152, height: 152, borderRadius: 76 }}
          contentFit="cover"
          accessibilityLabel=""
        />
      </View>

      <View style={{ alignItems: "center", gap: 26, paddingHorizontal: 24, paddingTop: 24 }}>
        <View style={{ alignItems: "center", gap: 11 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
            <LogoMark size={46} />
            <Wordmark size={42} />
          </View>
          <Eyebrow size={8} />
        </View>

        <View style={{ alignItems: "center", gap: 8 }}>
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
          <Text
            style={{
              textAlign: "center",
              fontSize: 15,
              lineHeight: 23.25,
              color: "#8C8592",
            }}
          >
            Four quick questions about your skin. Then scan any product to see
            how well it matches — including the ingredients that don&apos;t
            suit you.
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, minHeight: 36 }} />

      <View style={{ gap: 14, paddingHorizontal: 24, paddingBottom: Math.max(40, insets.bottom + 16) }}>
        {/* PrimaryButton, not a styled <Link> and not a height utility —
            see components/PrimaryButton.tsx for why the height is inline. */}
        <PrimaryButton
          label="Get started"
          onPress={() => router.push("/onboarding/about-you")}
        />
        {/* The handoff's own visible metrics are 13.5px text with 8px vertical
            padding — under the 44pt touch minimum. hitSlop expands the target
            without changing what's drawn. */}
        <Pressable onPress={skip} hitSlop={8} className="py-2">
          <Text className="text-center text-[13.5px] font-medium text-ink-muted">
            Skip for now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
