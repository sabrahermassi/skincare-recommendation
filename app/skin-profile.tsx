import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { ConcernPicker, PregnancyPicker, SensitivityPicker, SkinTypePicker } from "@/components/ProfilePickers";
import { PageTitle } from "@/components/PageTitle";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Text } from "@/components/Text";
import type { Concern } from "@/data/types";
import { haptic } from "@/lib/haptics";
import { CONCERN_TITLE, PREGNANCY_QUESTION, pregnancyLabel, sensitivityLabel } from "@/lib/profile";
import { concernIcon, NONE_ICON, PREGNANCY_ICON, SENSITIVITY_ICON, SKIN_TYPE_ICON, UNSURE_ICON } from "@/lib/quiz-icons";
import { CANVAS, CARD_RADIUS, INK, LINK, SPACE, SURFACE, TYPE } from "@/lib/tokens";
import { MAX_CONCERNS, useAppStore, visibleConcernCount } from "@/store/useAppStore";

type Question = "skinType" | "concerns" | "sensitivity" | "pregnancy";

// Each row's name, the label over its card (v7), and the question it asks; in
// the design's order.
const TITLES: Record<Question, string> = {
  skinType: "Skin type",
  concerns: "Skin concerns",
  sensitivity: "Sensitivity",
  pregnancy: "Pregnancy",
};
const LABELS: Record<Question, string> = { ...TITLES, pregnancy: "Pregnant or breastfeeding" };
const QUESTIONS: Record<Question, string> = { ...TITLES, pregnancy: PREGNANCY_QUESTION };
const ORDER: Question[] = ["concerns", "skinType", "sensitivity", "pregnancy"];

/**
 * Skin profile (v7): each answer from the skin quiz on its own card, under the
 * question, with its picture and "Change". Change opens that one question in
 * place, and a choice saves at once — there is no draft to keep or lose.
 * Every score in the app follows the change.
 */
export default function SkinProfileScreen() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const [open, setOpen] = useState<Question | null>(null);
  // "I don't know" and "no concerns" store the same value as a question never
  // asked, so the stored profile can't tell them apart. Which questions were
  // answered here is tracked one by one, as the finder does: answering one
  // question must not make the others read "I don't know" (#376 review).
  const [answered, setAnswered] = useState<ReadonlySet<Question>>(() => new Set());

  const save = (patch: Parameters<typeof setProfile>[0], close = true) => {
    if (open) setAnswered((a) => new Set(a).add(open));
    setProfile(patch);
    haptic.select();
    if (close) setOpen(null);
  };
  const toggleConcern = (concern: Concern) => {
    const has = profile.concerns.includes(concern);
    if (!has && visibleConcernCount(profile.concerns) >= MAX_CONCERNS) return;
    save({ concerns: has ? profile.concerns.filter((c) => c !== concern) : [...profile.concerns, concern] }, false);
  };

  const values: Record<Question, string> = {
    skinType: profile.baseSkinType ? titleCase(profile.baseSkinType) : answered.has("skinType") ? "I don't know" : "Not set",
    concerns:
      profile.concerns.length > 0
        ? profile.concerns.map((c) => CONCERN_TITLE[c]).join(", ")
        : answered.has("concerns")
          ? "No concerns"
          : "Not set",
    sensitivity: profile.sensitivity ? sensitivityLabel(profile.sensitivity) : answered.has("sensitivity") ? "I don't know" : "Not set",
    pregnancy: profile.pregnancyStatus ? pregnancyLabel(profile.pregnancyStatus) : "Not set",
  };

  const icons: Record<Question, number> = {
    // The first concern with a picture: `atopic`, no longer offered, has none.
    concerns: profile.concerns.map(concernIcon).find((icon) => icon !== undefined) ?? (answered.has("concerns") ? NONE_ICON : UNSURE_ICON),
    skinType: profile.baseSkinType ? SKIN_TYPE_ICON[profile.baseSkinType] : UNSURE_ICON,
    sensitivity: profile.sensitivity ? SENSITIVITY_ICON[profile.sensitivity] : UNSURE_ICON,
    pregnancy: (profile.pregnancyStatus && PREGNANCY_ICON[profile.pregnancyStatus as keyof typeof PREGNANCY_ICON]) || UNSURE_ICON,
  };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      <ScrollView contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: 48 }}>
        <PageTitle title="Skin profile" line="Every score is made from these answers. Change one and your scores update." />

        {ORDER.map((question, index) => {
          const isOpen = open === question;
          return (
            <View key={question}>
              <SectionLabel title={LABELS[question]} first={index === 0} />
              <View style={{ borderRadius: CARD_RADIUS, backgroundColor: SURFACE, overflow: "hidden" }}>
                <Pressable
                  onPress={() => setOpen(isOpen ? null : question)}
                  accessibilityRole="button"
                  accessibilityLabel={`${TITLES[question]}: ${values[question]}`}
                  accessibilityHint={isOpen ? "Done" : "Change"}
                  accessibilityState={{ expanded: isOpen }}
                  style={{ minHeight: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingVertical: SPACE.block, paddingLeft: SPACE.block, paddingRight: SPACE.gutter }}
                  className="active:opacity-70"
                >
                  <Image source={icons[question]} contentFit="contain" accessibilityLabel="" style={{ width: ICON, height: ICON }} />
                  <Text style={{ flex: 1, fontSize: TYPE.label, fontWeight: "600", color: INK }}>{values[question]}</Text>
                  <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>{isOpen ? "Done" : "Change"}</Text>
                </Pressable>
                {isOpen ? (
                  <View accessibilityLabel={QUESTIONS[question]} style={{ paddingTop: 4, paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.gutter }}>
                    {question === "skinType" ? (
                      <SkinTypePicker value={profile.baseSkinType} unknownChosen={answered.has("skinType")} onChange={(baseSkinType) => save({ baseSkinType })} />
                    ) : question === "concerns" ? (
                      <ConcernPicker concerns={profile.concerns} noneChosen={answered.has("concerns")} onToggle={toggleConcern} onNone={() => save({ concerns: [] })} />
                    ) : question === "sensitivity" ? (
                      <SensitivityPicker value={profile.sensitivity} unknownChosen={answered.has("sensitivity")} onChange={(sensitivity) => save({ sensitivity })} />
                    ) : (
                      <PregnancyPicker value={profile.pregnancyStatus} onChange={(pregnancyStatus) => save({ pregnancyStatus })} />
                    )}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// v7: a row's least height, and its answer's picture.
const ROW_HEIGHT = 64;
const ICON = 44;

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
