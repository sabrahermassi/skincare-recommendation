import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";

import { QuizStep } from "@/components/QuizStep";
import { SkinTypeIcon, type SkinTypeIconName } from "@/components/SkinTypeIcon";
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
 * The one screen in the quiz that is cards rather than chips, because it is the
 * one with art: the design draws a 44pt illustrated tile per skin type, and a
 * picture of the thing is worth more here than consistency with a text chip.
 *
 * Sensitivity is its own step now rather than a toggle at the bottom of this
 * one: it has three levels, and it answers a different question — not what
 * your skin is, but how harshly to judge what you put on it.
 */
export default function SkinTypeStep() {
  const baseSkinType = useAppStore((s) => s.profile.baseSkinType);
  const setProfile = useAppStore((s) => s.setProfile);
  // "I don't know" writes null, which is also the unanswered value — so the
  // screen tracks the tap locally rather than inferring an answer from the
  // store. Someone who genuinely doesn't know their skin type still gets to
  // continue; we simply score on their concerns instead.
  const [picked, setPicked] = useState(baseSkinType !== null);

  function next() {
    const route = nextQuizRoute("/onboarding/skin-type");
    if (route) {
      router.push(route);
      return;
    }
    router.replace(POST_ONBOARDING_ROUTE);
  }

  return (
    <QuizStep
      step={2}
      title="What's your skin type?"
      subtitle="Pick the closest match."
      onNext={next}
      nextDisabled={!picked}
    >
      <View style={{ gap: 12 }}>
        {OPTIONS.map((option) => (
          <TypeCard
            key={option.value}
            icon={option.value}
            label={option.label}
            hint={option.hint}
            selected={baseSkinType === option.value}
            onPress={() => {
              setProfile({ baseSkinType: option.value });
              setPicked(true);
            }}
          />
        ))}

        <TypeCard
          icon="unsure"
          label="I don't know"
          hint="We'll match on your concerns instead."
          selected={picked && baseSkinType === null}
          onPress={() => {
            setProfile({ baseSkinType: null });
            setPicked(true);
          }}
        />
      </View>
    </QuizStep>
  );
}

function TypeCard({
  icon,
  label,
  hint,
  selected,
  onPress,
  role = "radio",
  trailing,
}: {
  icon: SkinTypeIconName;
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
  role?: "radio" | "switch";
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === "switch" ? { checked: selected } : { selected }}
      // Border width is constant so selecting never nudges the layout, and the
      // height is inline so the card cannot collapse onto its label.
      style={{ minHeight: 76, gap: 13, paddingHorizontal: 14, paddingVertical: 16 }}
      className={`flex-row items-center rounded-card border-2 ${
        selected ? "border-accent bg-tint-lilac" : "border-hairline bg-surface active:bg-canvas"
      }`}
    >
      <SkinTypeIcon name={icon} />

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          className={`text-[16px] font-semibold ${
            selected ? "text-accent-text" : "text-ink"
          }`}
        >
          {label}
        </Text>
        <Text className="text-[13px] leading-[17.5px] text-ink-muted">{hint}</Text>
      </View>

      {trailing ?? (
        <View style={{ height: 20, width: 20 }} className="items-center justify-center">
          {selected ? (
            <View
              style={{ height: 20, width: 20 }}
              className="items-center justify-center rounded-full bg-accent"
            >
              <Text className="text-[11px] font-bold leading-[13px] text-white">✓</Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
