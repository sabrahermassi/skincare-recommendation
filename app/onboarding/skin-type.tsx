import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";

import { OptionCard } from "@/components/OptionCard";
import { QuizStep } from "@/components/QuizStep";
import type { BaseSkinType } from "@/data/types";
import { nextQuizRoute, POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const OPTIONS: { value: BaseSkinType; label: string; hint: string }[] = [
  { value: "dry", label: "Dry", hint: "Tight, flaky, rarely shiny" },
  { value: "oily", label: "Oily", hint: "Shiny by midday, visible pores" },
  { value: "combination", label: "Combination", hint: "Oily T-zone, dry cheeks" },
  { value: "normal", label: "Normal", hint: "Balanced, rarely reactive" },
];

/**
 * Base type and sensitivity are asked separately: "dry + oily" is a
 * contradiction, but "sensitive" is a modifier that pairs with any base
 * type, so it can't share the same single-select control.
 */
export default function SkinTypeStep() {
  const baseSkinType = useAppStore((s) => s.profile.baseSkinType);
  const sensitive = useAppStore((s) => s.profile.sensitive);
  const setProfile = useAppStore((s) => s.setProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  /** Currently the last step, so there is nothing left to navigate to. */
  function next() {
    const route = nextQuizRoute("/onboarding/skin-type");
    if (route) {
      router.push(route);
      return;
    }
    completeOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizStep
      step={4}
      title="What's your skin type?"
      subtitle="Pick the closest match."
      onNext={next}
      nextDisabled={!baseSkinType}
      nextLabel={nextQuizRoute("/onboarding/skin-type") ? "Continue" : "See my matches"}
    >
      <View className="gap-3">
        {OPTIONS.map((option) => (
          <OptionCard
            key={option.value}
            label={option.label}
            hint={option.hint}
            selected={baseSkinType === option.value}
            onPress={() => setProfile({ baseSkinType: option.value })}
          />
        ))}
      </View>

      <Pressable
        onPress={() => setProfile({ sensitive: !sensitive })}
        accessibilityRole="switch"
        accessibilityState={{ checked: sensitive }}
        className={`mt-4 flex-row items-center justify-between rounded-card border-2 p-4 ${
          sensitive ? "border-accent bg-tint-lilac" : "border-hairline bg-surface"
        }`}
      >
        <View className="flex-1 pr-3">
          <Text
            className={`text-base font-sans-semibold ${
              sensitive ? "text-accent-text" : "text-ink"
            }`}
          >
            My skin is also sensitive
          </Text>
          <Text className="mt-0.5 text-sm text-ink-muted">
            Stings or reddens easily, regardless of type.
          </Text>
        </View>
        <View className={`h-6 w-11 rounded-full p-0.5 ${sensitive ? "bg-accent" : "bg-hairline"}`}>
          <View className={`h-5 w-5 rounded-full bg-white ${sensitive ? "ml-auto" : ""}`} />
        </View>
      </Pressable>
    </QuizStep>
  );
}
