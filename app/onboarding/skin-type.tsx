import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";

import { OptionCard } from "@/components/OptionCard";
import { QuizStep } from "@/components/QuizStep";
import { SkinTypeIcon } from "@/components/SkinTypeIcon";
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
 *
 * "Not sure" is a fifth option rather than a nudge to guess. It is held in
 * local state, not the store: choosing it means the profile has no skin type
 * *yet*, and writing a placeholder would let a backed-out diagnostic leave a
 * type behind that nobody answered for. The store is written by
 * `diagnostic.tsx` once there is a real answer.
 */
export default function SkinTypeStep() {
  const baseSkinType = useAppStore((s) => s.profile.baseSkinType);
  const skinTypeSource = useAppStore((s) => s.profile.skinTypeSource);
  const sensitive = useAppStore((s) => s.profile.sensitive);
  const setProfile = useAppStore((s) => s.setProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  // Coming back to a profile that was derived last time re-selects "Not sure",
  // because that is the answer the user actually gave.
  const [unsure, setUnsure] = useState(skinTypeSource === "derived");

  function pick(value: BaseSkinType) {
    setUnsure(false);
    setProfile({ baseSkinType: value, skinTypeSource: "declared" });
  }

  function next() {
    if (unsure) {
      router.push("/onboarding/diagnostic");
      return;
    }
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
      nextDisabled={!unsure && !baseSkinType}
      nextLabel={unsure ? "Continue" : "See my matches"}
    >
      <View className="gap-3">
        {OPTIONS.map((option) => (
          <OptionCard
            key={option.value}
            label={option.label}
            hint={option.hint}
            icon={<SkinTypeIcon name={option.value} />}
            selected={!unsure && baseSkinType === option.value}
            onPress={() => pick(option.value)}
          />
        ))}

        <OptionCard
          label="Not sure"
          hint={
            unsure
              ? "Two quick questions instead of guessing"
              : "We'll work it out from two questions"
          }
          icon={<SkinTypeIcon name="unsure" />}
          selected={unsure}
          onPress={() => setUnsure(true)}
        />
      </View>

      <Pressable
        onPress={() => setProfile({ sensitive: !sensitive })}
        accessibilityRole="switch"
        accessibilityState={{ checked: sensitive }}
        className={`mt-4 flex-row items-center gap-3 rounded-card border-2 px-3.5 py-4 ${
          sensitive ? "border-accent bg-tint-lilac" : "border-hairline bg-surface"
        }`}
      >
        <SkinTypeIcon name="sensitive" />
        <View className="flex-1">
          <Text
            className={`text-base font-semibold ${
              sensitive ? "text-accent-text" : "text-ink"
            }`}
          >
            My skin is also sensitive
          </Text>
          <Text className="mt-0.5 text-[13px] leading-4 text-ink-muted">
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
