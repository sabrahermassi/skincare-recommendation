import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { LogoMark } from "@/components/LogoMark";
import { PrimaryButton } from "@/components/PrimaryButton";
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
      <View style={{ flex: 1, minHeight: 60 }} />

      <View className="items-center">
        <LogoMark size={120} />
      </View>

      <View style={{ alignItems: "center", gap: 34, paddingTop: 34 }}>
        {/* The wordmark sets S and T larger than the stem letters — the one
            place the brand is drawn rather than typed, so it is spelled out
            here instead of living in a font file. */}
        <View style={{ alignItems: "center", gap: 10 }}>
          <Text className="font-display text-[34px] leading-none tracking-[-0.27px] text-[#463F57]">
            <Text className="text-[40px]">S</Text>kin<Text className="text-[40px]">T</Text>el
          </Text>
          <Text className="font-mono text-[7px] tracking-[0.84px] text-ink-muted">
            SCAN{"  "}/{"  "}ANALYZE{"  "}/{"  "}KNOW
          </Text>
        </View>

        <View style={{ alignItems: "center", gap: 13 }}>
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

      <View style={{ flex: 1, minHeight: 40 }} />

      <View style={{ gap: 14 }}>
        {/* PrimaryButton, not a styled <Link> and not a height utility —
            see components/PrimaryButton.tsx for why the height is inline. */}
        <PrimaryButton
          label="Get started"
          onPress={() => router.push("/onboarding/about-you")}
        />
        <Pressable onPress={skip} className="py-2">
          <Text className="text-center text-[13.5px] font-medium text-ink-muted">
            Skip for now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
