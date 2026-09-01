import { router } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Text } from "@/components/Text";

import { Chip } from "@/components/Chip";
import { OptionCard } from "@/components/OptionCard";
import type {
  AgeGroup,
  BaseSkinType,
  BodyArea,
  Concern,
  Gender,
  SkinProfile,
} from "@/data/types";
import { ageGroupLabel, genderLabel, POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const GENDERS: Gender[] = ["female", "male", "nonbinary", "undisclosed"];
const AGE_GROUPS: AgeGroup[] = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const AREAS: { value: BodyArea; label: string }[] = [
  { value: "face", label: "Face" },
  { value: "body", label: "Body" },
];
const CONCERN_OPTIONS: { value: Concern; label: string }[] = [
  { value: "dehydrated", label: "Dehydrated" },
  { value: "acne-prone", label: "Acne-prone" },
  { value: "redness", label: "Redness" },
  { value: "dullness", label: "Dullness" },
  { value: "large-pores", label: "Large pores" },
  { value: "fine-lines", label: "Fine lines" },
  { value: "hyperpigmentation", label: "Dark spots" },
];
const SKIN_TYPES: { value: BaseSkinType; label: string }[] = [
  { value: "dry", label: "Dry" },
  { value: "oily", label: "Oily" },
  { value: "combination", label: "Combination" },
  { value: "normal", label: "Normal" },
];
const MAX_CONCERNS = 3;

/**
 * All five quiz answers on one scrollable screen, edited as a local draft
 * and committed with a single "Save" — a half-changed profile must never
 * re-score the browse list underneath it.
 */
export default function ProfileScreen() {
  const storedProfile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const resetApp = useAppStore((s) => s.resetApp);

  const [draft, setDraft] = useState<SkinProfile>(storedProfile);

  function patch(p: Partial<SkinProfile>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function toggleDraftConcern(concern: Concern) {
    setDraft((d) => {
      if (d.concerns.includes(concern)) {
        return { ...d, concerns: d.concerns.filter((c) => c !== concern) };
      }
      if (d.concerns.length >= MAX_CONCERNS) return d;
      return { ...d, concerns: [...d.concerns, concern] };
    });
  }

  function save() {
    setProfile(draft);
    // Profile is a tab now rather than a pushed modal, so router.back() has
    // nothing reliable to return to — go straight to the tab that shows the
    // effect of the save.
    router.replace(POST_ONBOARDING_ROUTE);
  }

  const atLimit = draft.concerns.length >= MAX_CONCERNS;

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView contentContainerClassName="gap-8 p-6 pb-32">
        <Section title="About you">
          <View className="gap-2">
            {GENDERS.map((gender) => (
              <OptionCard
                key={gender}
                label={genderLabel(gender)}
                selected={draft.gender === gender}
                onPress={() => patch({ gender })}
              />
            ))}
          </View>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {AGE_GROUPS.map((ageGroup) => (
              <Chip
                key={ageGroup}
                label={ageGroupLabel(ageGroup)}
                selected={draft.ageGroup === ageGroup}
                onPress={() => patch({ ageGroup })}
              />
            ))}
          </View>
        </Section>

        <Section title="Face or body">
          <View className="flex-row gap-2">
            {AREAS.map((option) => (
              <View key={option.value} className="flex-1">
                <OptionCard
                  label={option.label}
                  selected={draft.area === option.value}
                  onPress={() => patch({ area: option.value })}
                />
              </View>
            ))}
          </View>
        </Section>

        <Section title={`Concerns (up to ${MAX_CONCERNS})`}>
          <View className="flex-row flex-wrap gap-2">
            {CONCERN_OPTIONS.map((option) => {
              const selected = draft.concerns.includes(option.value);
              return (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={selected}
                  disabled={!selected && atLimit}
                  onPress={() => toggleDraftConcern(option.value)}
                />
              );
            })}
          </View>
        </Section>

        <Section title="Skin type">
          <View className="gap-2">
            {SKIN_TYPES.map((option) => (
              <OptionCard
                key={option.value}
                label={option.label}
                selected={draft.baseSkinType === option.value}
                onPress={() => patch({ baseSkinType: option.value })}
              />
            ))}
          </View>
          <Pressable
            onPress={() => patch({ sensitive: !draft.sensitive })}
            accessibilityRole="switch"
            accessibilityState={{ checked: draft.sensitive }}
            className={`mt-2 flex-row items-center justify-between rounded-card border-2 p-4 ${
              draft.sensitive ? "border-accent bg-tint-lilac" : "border-hairline bg-surface"
            }`}
          >
            <Text
              className={`text-sm font-sans-semibold ${
                draft.sensitive ? "text-accent-text" : "text-ink"
              }`}
            >
              Also sensitive
            </Text>
            <View
              className={`h-6 w-11 rounded-full p-0.5 ${
                draft.sensitive ? "bg-accent" : "bg-hairline"
              }`}
            >
              <View
                className={`h-5 w-5 rounded-full bg-white ${draft.sensitive ? "ml-auto" : ""}`}
              />
            </View>
          </Pressable>
        </Section>

        <Pressable
          onPress={() => router.replace("/onboarding")}
          className="items-center py-2"
        >
          <Text className="text-sm font-sans-medium text-accent-text underline">
            Retake the quiz
          </Text>
        </Pressable>

        {/*
          Distinct from "Retake the quiz", which keeps your shelf and history.
          This is the way back to a genuinely first-run app — needed precisely
          because persistence works: once onboarding is done it stays done.
        */}
        <Pressable
          onPress={() => {
            resetApp();
            router.replace("/onboarding");
          }}
          className="items-center py-2"
        >
          <Text className="text-sm font-sans-medium text-status-avoid underline">
            Start over — erase my profile, shelf and history
          </Text>
        </Pressable>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-hairline bg-surface p-4">
        <Pressable
          onPress={save}
          className="rounded-control bg-accent px-6 py-4 active:bg-accent-deep"
        >
          <Text className="text-center text-base font-sans-semibold text-white">
            Save &amp; see new matches
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-xs font-sans-bold uppercase tracking-wide text-ink-faint">{title}</Text>
      {children}
    </View>
  );
}
