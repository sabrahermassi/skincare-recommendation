import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { MenuGroup, MenuRow } from "@/components/MenuRows";
import { ConcernPicker, PregnancyPicker, SensitivityPicker, SkinTypePicker } from "@/components/ProfilePickers";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import type { Concern } from "@/data/types";
import { haptic } from "@/lib/haptics";
import { CONCERN_TITLE, PREGNANCY_QUESTION, pregnancyLabel, sensitivityLabel } from "@/lib/profile";
import { CANVAS, INK, MUTED, TOUCH_TARGET, TYPE } from "@/lib/tokens";
import { MAX_CONCERNS, useAppStore, visibleConcernCount } from "@/store/useAppStore";

type Question = "skinType" | "concerns" | "sensitivity" | "pregnancy";

// Each row's name, and the question its sheet asks.
const TITLES: Record<Question, string> = {
  skinType: "Skin type",
  concerns: "Skin concerns",
  sensitivity: "Sensitivity",
  pregnancy: "Pregnancy",
};
const QUESTIONS: Record<Question, string> = { ...TITLES, pregnancy: PREGNANCY_QUESTION };

/**
 * Skin profile (owner's reference, a settings list): each answer from the skin
 * quiz on its own row, its current value on the right. A row opens that one
 * question as a sheet, and a choice saves at once — there is no draft to keep
 * or lose. Every score in the app follows the change.
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

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Skin profile" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }}>
        <MenuGroup>
          {(Object.keys(TITLES) as Question[]).map((question) => (
            <MenuRow key={question} label={TITLES[question]} value={values[question]} onPress={() => setOpen(question)} />
          ))}
        </MenuGroup>
        <Text style={{ paddingHorizontal: 8, fontSize: TYPE.caption, lineHeight: 17, color: MUTED }}>
          Your answers make every score personal. Change one any time.
        </Text>
      </ScrollView>

      <BottomSheet visible={open !== null} onClose={() => setOpen(null)}>
        {open ? (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text accessibilityRole="header" style={{ fontSize: TYPE.title, fontWeight: "700", color: INK }}>
                {QUESTIONS[open]}
              </Text>
              {open === "concerns" ? (
                <Pressable
                  onPress={() => setOpen(null)}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
                  className="active:opacity-70"
                >
                  <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>Done</Text>
                </Pressable>
              ) : null}
            </View>
            {open === "skinType" ? (
              <SkinTypePicker value={profile.baseSkinType} unknownChosen={answered.has("skinType")} onChange={(baseSkinType) => save({ baseSkinType })} />
            ) : open === "concerns" ? (
              <ConcernPicker concerns={profile.concerns} noneChosen={answered.has("concerns")} onToggle={toggleConcern} onNone={() => save({ concerns: [] })} />
            ) : open === "sensitivity" ? (
              <SensitivityPicker value={profile.sensitivity} unknownChosen={answered.has("sensitivity")} onChange={(sensitivity) => save({ sensitivity })} />
            ) : (
              <PregnancyPicker value={profile.pregnancyStatus} onChange={(pregnancyStatus) => save({ pregnancyStatus })} />
            )}
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
