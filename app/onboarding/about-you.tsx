import { router } from "expo-router";
import { ScrollView, View } from "react-native";

import { Text } from "@/components/Text";

import { Chip, CHIP_ROW } from "@/components/Chip";
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 26 }}>
        {/*
          Gender and age are the same kind of question, so they are the same
          control at the same size. The four gender options used to be tall
          bordered cards stacked full-width, which made two halves of one screen
          look like two different screens.
        */}
        <View style={{ gap: 11 }}>
          <FieldLabel>Gender</FieldLabel>
          <View style={CHIP_ROW}>
            {GENDERS.map((gender) => (
              <Chip
                key={gender}
                label={genderLabel(gender)}
                selected={profile.gender === gender}
                onPress={() => setProfile({ gender })}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: 11 }}>
          <FieldLabel>Age group</FieldLabel>
          <View style={CHIP_ROW}>
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

/** One heading style above a chip row, wherever one appears. */
export function FieldLabel({ children }: { children: string }) {
  return <Text className="text-sm font-semibold text-ink-muted">{children}</Text>;
}
