import { router } from "expo-router";
import type { ReactNode } from "react";
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
 * Base type and sensitivity are asked separately — "dry + oily" is a
 * contradiction, but "sensitive" pairs with any base type, so it cannot share
 * the same single-select control.
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
      <View style={{ gap: 12 }}>
        {OPTIONS.map((option) => (
          <TypeCard
            key={option.value}
            icon={option.value}
            label={option.label}
            hint={option.hint}
            selected={baseSkinType === option.value}
            onPress={() => setProfile({ baseSkinType: option.value })}
          />
        ))}

        <TypeCard
          icon="sensitive"
          label="My skin is also sensitive"
          hint="Stings or reddens easily, regardless of type."
          selected={sensitive}
          onPress={() => setProfile({ sensitive: !sensitive })}
          // A modifier, not a fifth type — so it announces as a switch and
          // shows a track rather than a tick.
          role="switch"
          trailing={
            <View
              style={{ height: 24, width: 44 }}
              className={`rounded-full p-0.5 ${sensitive ? "bg-accent" : "bg-hairline"}`}
            >
              <View
                style={{ height: 20, width: 20 }}
                className={`rounded-full bg-white ${sensitive ? "ml-auto" : ""}`}
              />
            </View>
          }
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
