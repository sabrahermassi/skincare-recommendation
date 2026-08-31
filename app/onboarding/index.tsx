import { Link, router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useAppStore } from "@/store/useAppStore";

export default function Welcome() {
  const skipOnboarding = useAppStore((s) => s.skipOnboarding);

  /**
   * Skipping has to record that onboarding was shown, otherwise the browse
   * screen's gate sends the user straight back here and the button appears
   * to do nothing. Browsing without a profile is supported — the list falls
   * back to unpersonalised scores and the header offers "Edit" to fill it in.
   */
  function skip() {
    skipOnboarding();
    router.replace("/");
  }

  return (
    <View className="flex-1 justify-center gap-8 bg-white px-8">
      <View className="gap-3">
        <Text className="text-4xl font-bold text-slate-900">
          Find K-beauty that suits your skin
        </Text>
        <Text className="text-base leading-6 text-slate-500">
          Answer two quick questions and every product gets a match score
          against your profile.
        </Text>
      </View>

      <View className="gap-3">
        <Link
          href="/onboarding/skin-type"
          className="rounded-xl bg-teal-600 px-6 py-4 text-center text-base font-semibold text-white active:bg-teal-700"
        >
          Get started
        </Link>
        <Pressable onPress={skip} className="py-2">
          <Text className="text-center text-sm font-medium text-slate-500">
            Skip for now
          </Text>
        </Pressable>
      </View>

      <Text className="text-center text-xs text-slate-400">Step 1 of 3</Text>
    </View>
  );
}
