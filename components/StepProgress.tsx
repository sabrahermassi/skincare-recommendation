import { View } from "react-native";

import { Text } from "@/components/Text";

type Props = {
  /** 1-based index of the step currently shown. */
  current: number;
  total: number;
};

/**
 * The numbered circles above each quiz step. A step already answered is
 * solid; the current step is solid plus a soft halo so "you are here" reads
 * differently from "done"; steps ahead are outline-only.
 */
export function StepProgress({ current, total }: Props) {
  const steps = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <View className="flex-row items-center">
      {steps.map((step, i) => {
        const done = step < current;
        const active = step === current;
        const filled = done || active;
        const isLast = i === steps.length - 1;

        return (
          <View key={step} className={`flex-row items-center ${isLast ? "" : "flex-1"}`}>
            <View
              className={`items-center justify-center rounded-full ${
                active ? "bg-tint-lilac p-1" : ""
              }`}
            >
              <View
                className={`h-7 w-7 items-center justify-center rounded-full ${
                  filled ? "bg-accent" : "border border-hairline bg-transparent"
                }`}
              >
                <Text
                  className={`text-xs font-sans-bold ${filled ? "text-white" : "text-ink-faint"}`}
                >
                  {step}
                </Text>
              </View>
            </View>

            {!isLast && (
              <View className={`h-0.5 flex-1 ${done ? "bg-accent" : "bg-hairline"}`} />
            )}
          </View>
        );
      })}
    </View>
  );
}
