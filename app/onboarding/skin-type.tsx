import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { QuizScreen } from "@/components/QuizScreen";
import { Text } from "@/components/Text";

import { SkinTypeIcon, type SkinTypeIconName } from "@/components/SkinTypeIcon";
import type { BaseSkinType } from "@/data/types";
import { nextQuizRoute, POST_ONBOARDING_ROUTE, quizStepNumber } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, RADIUS_SELECTOR, SELECTED } from "@/lib/tokens";

const OPTIONS: { value: BaseSkinType; label: string; hint: string }[] = [
  { value: "dry", label: "Dry", hint: "Tight, flaky, rarely shiny" },
  { value: "oily", label: "Oily", hint: "Shiny by midday, visible pores" },
  { value: "combination", label: "Combination", hint: "Oily T-zone, dry cheeks" },
  { value: "normal", label: "Normal", hint: "Balanced, rarely reactive" },
];

/**
 * Same layout as before this session's restyle: cards, not chips — the one
 * step with art, per `SkinTypeIcon`'s own illustrated tiles. Only the shell
 * (`QuizStep` → `QuizScreen`) and `TypeCard`'s colors move to the Manassa
 * system; `SkinTypeIcon`'s per-type tile colors are untouched, same reasoning
 * as the onboarding illustrations' own accent shapes — they're artwork, not
 * UI chrome, and don't shift with the surrounding palette.
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
    <QuizScreen
      step={quizStepNumber("/onboarding/skin-type")}
      title="What's your skin type?"
      subtitle="Pick the closest match."
      illustration={require("@/assets/illustrations/girl-applying-cream.png")}
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
    </QuizScreen>
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
      style={{
        minHeight: 76,
        gap: 13,
        paddingHorizontal: 14,
        paddingVertical: 16,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: RADIUS_SELECTOR,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? INK : BORDER_INACTIVE,
        backgroundColor: selected ? SELECTED : CANVAS,
      }}
    >
      <SkinTypeIcon name={icon} />

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: INK }}>{label}</Text>
        <Text style={{ fontSize: 13, lineHeight: 17.5, color: MUTED }}>{hint}</Text>
      </View>

      {trailing ?? (
        <View style={{ height: 20, width: 20, alignItems: "center", justifyContent: "center" }}>
          {selected ? (
            <View
              style={{
                height: 20,
                width: 20,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                backgroundColor: INK,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "bold", lineHeight: 13, color: CANVAS }}>
                ✓
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
