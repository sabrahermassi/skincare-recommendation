import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";

import { Chip, CHIP_ROW } from "@/components/Chip";
import { QuizStep } from "@/components/QuizStep";
import { SkinTypeIcon } from "@/components/SkinTypeIcon";
import type { BaseSkinType } from "@/data/types";
import { nextQuizRoute, POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const OPTIONS: { value: BaseSkinType; label: string }[] = [
  { value: "dry", label: "Dry" },
  { value: "oily", label: "Oily" },
  { value: "combination", label: "Combination" },
  { value: "normal", label: "Normal" },
];

/**
 * Base type and sensitivity are asked separately: "dry + oily" is a
 * contradiction, but "sensitive" is a modifier that pairs with any base type,
 * so it can't share the same single-select control.
 *
 * There is no "Not sure" here any more, and no two-question diagnostic behind
 * it. It was a whole extra screen standing between the last question and the
 * results for an answer the four options already cover — the hints under each
 * one are what resolve the doubt.
 */
export default function SkinTypeStep() {
  const baseSkinType = useAppStore((s) => s.profile.baseSkinType);
  const sensitive = useAppStore((s) => s.profile.sensitive);
  const setProfile = useAppStore((s) => s.setProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

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
      nextLabel="See my matches"
    >
      <View style={{ gap: 18 }}>
        <View style={CHIP_ROW}>
          {OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={baseSkinType === option.value}
              onPress={() => setProfile({ baseSkinType: option.value })}
            />
          ))}
        </View>

        {/* The one card left on the quiz, because it is a different question:
            a modifier that pairs with any of the four above, not a fifth
            choice among them. */}
        <Pressable
          onPress={() => setProfile({ sensitive: !sensitive })}
          accessibilityRole="switch"
          accessibilityState={{ checked: sensitive }}
          style={{ minHeight: 68, gap: 13 }}
          className={`flex-row items-center rounded-card border-2 px-3.5 py-4 ${
            sensitive ? "border-accent bg-tint-lilac" : "border-hairline bg-surface"
          }`}
        >
          <SkinTypeIcon name="sensitive" />
          <View className="flex-1">
            <Text className="text-[14.5px] font-semibold text-ink">
              My skin is also sensitive
            </Text>
            <Text className="mt-0.5 text-[13px] leading-[17.5px] text-ink-muted">
              Stings or reddens easily, regardless of type.
            </Text>
          </View>
          <View
            style={{ height: 24, width: 44 }}
            className={`rounded-full p-0.5 ${sensitive ? "bg-accent" : "bg-hairline"}`}
          >
            <View
              style={{ height: 20, width: 20 }}
              className={`rounded-full bg-white ${sensitive ? "ml-auto" : ""}`}
            />
          </View>
        </Pressable>
      </View>
    </QuizStep>
  );
}
