import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { QuizStep } from "@/components/QuizStep";
import type { BodyArea } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { useAppStore } from "@/store/useAppStore";

/** A bust silhouette — distinct from BodyIcon's full figure so the two read apart at a glance. */
function FaceIcon({ fill }: { fill: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 64 64">
      <Path d="M10,60 Q32,38 54,60 Z" fill={fill} />
      <Circle cx={32} cy={26} r={17} fill={fill} />
    </Svg>
  );
}

function BodyIcon({ fill }: { fill: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 64 64">
      <Circle cx={32} cy={13} r={9} fill={fill} />
      <Rect x={19} y={24} width={26} height={30} rx={12} fill={fill} />
      <Rect x={21} y={50} width={9} height={13} rx={4} fill={fill} />
      <Rect x={34} y={50} width={9} height={13} rx={4} fill={fill} />
    </Svg>
  );
}

const OPTIONS: {
  value: BodyArea;
  label: string;
  hint: string;
  Icon: (props: { fill: string }) => React.JSX.Element;
}[] = [
  { value: "face", label: "Face", hint: "Cleansers, serums, SPF", Icon: FaceIcon },
  { value: "body", label: "Body", hint: "Wash, lotion, hand cream", Icon: BodyIcon },
];

export default function AreaStep() {
  const area = useAppStore((s) => s.profile.area);
  const setProfile = useAppStore((s) => s.setProfile);

  return (
    <QuizStep
      step={2}
      title="Face or body?"
      subtitle="We'll show the product that matches."
      onNext={() => router.push("/onboarding/concerns")}
      nextDisabled={!area}
    >
      <View className="flex-row gap-3">
        {OPTIONS.map(({ value, label, hint, Icon }) => {
          const selected = area === value;
          return (
            <Pressable
              key={value}
              onPress={() => setProfile({ area: value })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={`aspect-square flex-1 items-center justify-center gap-3 rounded-card border-2 p-4 ${
                selected
                  ? "border-accent bg-tint-lilac"
                  : "border-hairline bg-surface active:bg-canvas"
              }`}
            >
              <Icon fill={selected ? COLORS.accent : COLORS.inkFaint} />
              <View className="items-center">
                <Text
                  className={`text-lg font-semibold ${selected ? "text-accent-text" : "text-ink"}`}
                >
                  {label}
                </Text>
                <Text className="mt-0.5 text-xs text-ink-muted">{hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </QuizStep>
  );
}
