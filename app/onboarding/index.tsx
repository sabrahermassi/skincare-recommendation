import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { LogoMark } from "@/components/LogoMark";
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
    <View className="flex-1 bg-canvas px-6 pb-10">
      <View className="min-h-[60px] flex-1" />

      <View className="items-center">
        <LogoMark size={120} />
      </View>

      <View className="items-center gap-[34px] pt-[34px]">
        {/* The wordmark sets S and T larger than the stem letters — the one
            place the brand is drawn rather than typed, so it is spelled out
            here instead of living in a font file. */}
        <View className="items-center gap-2.5">
          <Text className="font-display text-[34px] leading-none tracking-[-0.27px] text-[#463F57]">
            <Text className="text-[40px]">S</Text>kin<Text className="text-[40px]">T</Text>el
          </Text>
          <Text className="font-mono text-[7px] tracking-[0.84px] text-ink-muted">
            SCAN{"  "}/{"  "}ANALYZE{"  "}/{"  "}KNOW
          </Text>
        </View>

        <View className="items-center gap-3">
          <Text className="text-center font-display text-[30px] leading-[35px] tracking-[-0.42px] text-ink">
            Find the right product for your skin
          </Text>
          <Text className="text-center text-[15px] leading-[23px] text-ink-muted">
            Four quick questions about your skin. Then scan any product to see
            how well it matches — including the ingredients that don&apos;t
            suit you.
          </Text>
        </View>
      </View>

      <View className="min-h-[40px] flex-1" />

      <View className="gap-3.5">
        {/*
          A Pressable, not a styled <Link>. Link renders a Text, so its height
          came from the line box plus padding and the button sat at roughly a
          third of the 56px the design draws.
        */}
        <Pressable
          onPress={() => router.push("/onboarding/about-you")}
          className="h-[56px] items-center justify-center rounded-control bg-accent active:bg-accent-deep"
        >
          <Text className="text-[15px] font-semibold text-white">Get started</Text>
        </Pressable>
        <Pressable onPress={skip} className="py-2">
          <Text className="text-center text-[13.5px] font-medium text-ink-muted">
            Skip for now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
