import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import Animated, { FadeInDown } from "react-native-reanimated";

import { COLORS } from "@/lib/colors";
import { quizStepCount } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { StepProgress } from "./StepProgress";

type Props = {
  /** 1-based index into the 5-step quiz. */
  step: number;
  title: string;
  subtitle?: string;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  children: ReactNode;
};

/**
 * The shell every onboarding step renders into: back navigation, the step
 * indicator, title/subtitle, a content slot, and a footer primary button.
 * Keeping this in one place is what lets `router.back()` always arrive at a
 * pre-filled previous step — every step writes its answer to the store as
 * soon as it's picked, not on "Continue".
 */
export function QuizStep({
  step,
  title,
  subtitle,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  children,
}: Props) {
  // Body has one fewer step. Area is chosen on step 2, so picking Body updates
  // the indicator underneath the user — truthful, since the flow really did
  // just get shorter, and better than promising 5 and stopping at 4.
  const totalSteps = quizStepCount(useAppStore((s) => s.profile.area));

  return (
    <View className="flex-1 bg-canvas px-5 pb-8 pt-14">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-9 w-9 items-center justify-center rounded-full active:bg-hairline"
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.ink} />
        </Pressable>
        <Text className="text-xs font-sans-semibold text-ink-faint">
          Step {step} of {totalSteps}
        </Text>
        <View className="h-9 w-9" />
      </View>

      <View className="mt-4">
        <StepProgress current={step} total={totalSteps} />
      </View>

      <Animated.View entering={FadeInDown.duration(280)} className="mt-8 flex-1 gap-6">
        <View className="gap-2">
          <Text className="font-display text-[32px] leading-9 text-ink">{title}</Text>
          {subtitle ? <Text className="text-base leading-6 text-ink-muted">{subtitle}</Text> : null}
        </View>

        <View className="flex-1">{children}</View>
      </Animated.View>

      <Pressable
        disabled={nextDisabled}
        onPress={onNext}
        className={`rounded-control px-6 py-4 ${
          nextDisabled ? "bg-hairline" : "bg-accent active:bg-accent-deep"
        }`}
      >
        <Text
          className={`text-center text-base font-sans-semibold ${
            nextDisabled ? "text-ink-faint" : "text-white"
          }`}
        >
          {nextLabel}
        </Text>
      </Pressable>
    </View>
  );
}
