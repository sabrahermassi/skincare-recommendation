import { Link, router } from "expo-router";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";

import { POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

export default function Welcome() {
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
    <View className="flex-1 justify-center gap-8 bg-canvas px-5">
      <View className="gap-3">
        <Text className="text-[11px] font-sans-semibold uppercase tracking-widest text-ink-faint">
          Skintel
        </Text>
        <Text className="font-display text-[32px] leading-9 text-ink">
          Find the right product for your skin
        </Text>
        <Text className="text-base leading-6 text-ink-muted">
          Four quick questions about your skin. Then scan any product to see
          how well it matches — including the ingredients that don&apos;t
          suit you.
        </Text>
      </View>

      <View className="gap-3">
        <Link
          href="/onboarding/about-you"
          className="rounded-control bg-accent px-6 py-4 text-center text-base font-sans-semibold text-white active:bg-accent-deep"
        >
          Get started
        </Link>
        <Pressable onPress={skip} className="py-2">
          <Text className="text-center text-sm font-sans-medium text-ink-muted">
            Skip for now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
