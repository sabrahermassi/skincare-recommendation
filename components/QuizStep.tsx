import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import Animated, { FadeInDown } from "react-native-reanimated";

import { COLORS } from "@/lib/colors";
import { quizStepCount } from "@/lib/profile";
import { StepProgress } from "./StepProgress";

type Props = {
  /** 1-based index into the quiz. */
  step: number;
  title: string;
  subtitle?: string;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /**
   * The numbered rail. Off for the skin-type diagnostic when it is opened
   * from the profile tab rather than mid-quiz — there is no step 4 of 4 to
   * be on if you are not in the quiz.
   */
  showProgress?: boolean;
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
  showProgress = true,
  children,
}: Props) {
  const totalSteps = quizStepCount();

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
        {showProgress ? (
          <Text className="text-xs font-semibold text-ink-faint">
            Step {step} of {totalSteps}
          </Text>
        ) : null}
        <View className="h-9 w-9" />
      </View>

      {showProgress ? (
        <View className="mt-4">
          <StepProgress current={step} total={totalSteps} />
        </View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(280)} className="mt-[30px] flex-1 gap-[26px]">
        <View className="gap-2">
          <Text className="font-display text-[32px] leading-[36.5px] tracking-[-0.48px] text-ink">
            {title}
          </Text>
          {subtitle ? <Text className="text-base leading-6 text-ink-muted">{subtitle}</Text> : null}
        </View>

        <View className="flex-1">{children}</View>
      </Animated.View>

      <Pressable
        disabled={nextDisabled}
        onPress={onNext}
        // 56px, per the design. Height is explicit rather than derived from
        // padding so it cannot drift with the label size.
        className={`h-[56px] items-center justify-center rounded-control ${
          nextDisabled ? "bg-hairline" : "bg-accent active:bg-accent-deep"
        }`}
      >
        <Text
          className={`text-base font-semibold ${
            nextDisabled ? "text-ink-faint" : "text-white"
          }`}
        >
          {nextLabel}
        </Text>
      </Pressable>
    </View>
  );
}
