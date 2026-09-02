import { router } from "expo-router";
import { ScrollView, View } from "react-native";

import { Text } from "@/components/Text";

import { Chip } from "@/components/Chip";
import { OptionCard } from "@/components/OptionCard";
import { OptionGrid } from "@/components/OptionGrid";
import { QuizStep } from "@/components/QuizStep";
import type { AgeGroup, Gender } from "@/data/types";
import { ageGroupLabel, genderLabel } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const GENDERS: Gender[] = ["female", "male", "nonbinary", "undisclosed"];
const AGE_GROUPS: AgeGroup[] = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

export default function AboutYouStep() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);

  const answered = profile.gender !== null && profile.ageGroup !== null;

  return (
    <QuizStep
      step={1}
      title="A little about you"
      subtitle="Helps us tailor recommendations to your life stage."
      onNext={() => router.push("/onboarding/area")}
      nextDisabled={!answered}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 30 }}>
        {/*
          Two to a row rather than four stacked full-width cards. The design
          draws them stacked and tall, but four of those fill the step with
          almost nothing in it, and paired they line up with the age chips
          underneath — which is the point of putting them on the same screen.
        */}
        <OptionGrid>
          {GENDERS.map((gender) => (
            <OptionCard
              key={gender}
              compact
              label={genderLabel(gender)}
              selected={profile.gender === gender}
              onPress={() => setProfile({ gender })}
            />
          ))}
        </OptionGrid>

        <View style={{ gap: 11 }}>
          <Text className="text-sm font-semibold text-ink-muted">Age group</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {AGE_GROUPS.map((ageGroup) => (
              <Chip
                key={ageGroup}
                label={ageGroupLabel(ageGroup)}
                selected={profile.ageGroup === ageGroup}
                onPress={() => setProfile({ ageGroup })}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </QuizStep>
  );
}
