import { router } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Text";

import { Chip } from "@/components/Chip";
import { OptionCard } from "@/components/OptionCard";
import { OptionGrid } from "@/components/OptionGrid";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Avatar } from "@/components/Avatar";
import type {
  AgeGroup,
  BaseSkinType,
  BodyArea,
  Concern,
  Gender,
  SkinProfile,
} from "@/data/types";
import {
  ageGroupLabel,
  genderLabel,
  POST_ONBOARDING_ROUTE,
  profileSummary,
} from "@/lib/profile";
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
  { value: "atopic", label: "Eczema-prone" },
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
  const insets = useSafeAreaInsets();
  const storedProfile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const resetApp = useAppStore((s) => s.resetApp);

  const [draft, setDraft] = useState<SkinProfile>(storedProfile);

  /*
    "Not sure" hands off to the diagnostic, which writes straight to the store
    rather than to this draft. Pulling the answer back in when it changes is
    what stops the round trip from looking like it did nothing. Scoped to the
    two fields the diagnostic touches, so an in-progress edit elsewhere on the
    screen survives.
  */
  const storedSkinType = storedProfile.baseSkinType;
  const storedSkinTypeSource = storedProfile.skinTypeSource;
  useEffect(() => {
    setDraft((d) => ({
      ...d,
      baseSkinType: storedSkinType,
      skinTypeSource: storedSkinTypeSource,
    }));
  }, [storedSkinType, storedSkinTypeSource]);

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

  /** Commit first: the diagnostic is a different screen, and a lost draft is a bug. */
  function openDiagnostic() {
    setProfile(draft);
    router.push("/onboarding/diagnostic?from=profile");
  }

  const atLimit = draft.concerns.length >= MAX_CONCERNS;
  const derived = draft.skinTypeSource === "derived";
  const summary = profileSummary(draft);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        contentContainerClassName="px-5 pb-40"
        contentContainerStyle={{ paddingTop: insets.top + 14, gap: 18 }}
      >
        <View style={{ gap: 13 }} className="flex-row items-center">
          <Avatar size={52} />
          <View className="flex-1">
            <Text className="text-[17px] font-semibold text-ink">Your skin profile</Text>
            <Text className="mt-0.5 text-[11.5px] text-ink-muted">
              {summary || "Not set up yet"}
            </Text>
          </View>
        </View>

        <Section title="About you">
          <View className="flex-row flex-wrap gap-2">
            {GENDERS.map((gender) => (
              <Chip
                key={gender}
                label={genderLabel(gender)}
                selected={draft.gender === gender}
                onPress={() => patch({ gender })}
              />
            ))}
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
          <OptionGrid>
            {AREAS.map((option) => (
              <OptionCard
                key={option.value}
                compact
                label={option.label}
                selected={draft.area === option.value}
                onPress={() => patch({ area: option.value })}
              />
            ))}
          </OptionGrid>
        </Section>

        <Section
          title="Skin type"
          note={derived ? "Worked out from two questions" : undefined}
        >
          <OptionGrid>
            {SKIN_TYPES.map((option) => (
              <OptionCard
                key={option.value}
                compact
                label={option.label}
                selected={!derived && draft.baseSkinType === option.value}
                onPress={() =>
                  patch({ baseSkinType: option.value, skinTypeSource: "declared" })
                }
              />
            ))}
          </OptionGrid>

          {/* Spans the row on its own — it is a different kind of answer from
              the four above it, not a fifth type. */}
          <View style={{ marginTop: 12 }}>
            <OptionCard compact label="Not sure" selected={derived} onPress={openDiagnostic} />
          </View>

          <Pressable
            onPress={() => patch({ sensitive: !draft.sensitive })}
            accessibilityRole="switch"
            accessibilityState={{ checked: draft.sensitive }}
            style={{ minHeight: 52, marginTop: 12 }}
            className={`flex-row items-center justify-between rounded-field border-2 px-3 ${
              draft.sensitive ? "border-accent bg-tint-lilac" : "border-hairline bg-surface"
            }`}
          >
            <Text
              className={`text-[14.5px] font-semibold ${
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

        <Section title="Skin concerns" note={`${draft.concerns.length} of ${MAX_CONCERNS}`}>
          <OptionGrid>
            {CONCERN_OPTIONS.map((option) => {
              const selected = draft.concerns.includes(option.value);
              return (
                <OptionCard
                  key={option.value}
                  compact
                  multiple
                  label={option.label}
                  selected={selected}
                  dimmed={atLimit}
                  onPress={() => toggleDraftConcern(option.value)}
                />
              );
            })}
          </OptionGrid>
        </Section>

        <Pressable onPress={() => router.replace("/onboarding")} className="items-center py-2">
          <Text className="text-[12.5px] font-medium text-accent-text underline">
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
          className="items-center py-1"
        >
          <Text className="text-xs font-medium text-status-avoid underline">
            Start over — erase my profile, shelf and history
          </Text>
        </Pressable>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-hairline bg-surface px-5 pb-8 pt-3.5">
        <PrimaryButton label="Find my matches" onPress={save} />
      </View>
    </View>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-2.5">
      <View className="flex-row items-baseline justify-between gap-2.5">
        <Text className="text-[10.5px] font-bold uppercase tracking-[0.9px] text-ink-faint">
          {title}
        </Text>
        {note ? <Text className="text-[10.5px] text-accent-text">{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}
