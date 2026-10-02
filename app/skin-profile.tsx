import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { ConcernPicker, PregnancyPicker, SensitivityPicker, SkinTypePicker } from "@/components/ProfilePickers";
import { PageTitle } from "@/components/PageTitle";
import { ScreenHeader } from "@/components/ScreenHeader";
import { UndoToast, type UndoNotice } from "@/components/UndoToast";
import { SectionLabel } from "@/components/SectionLabel";
import { Text } from "@/components/Text";
import type { Concern } from "@/data/types";
import { haptic } from "@/lib/haptics";
import { CONCERN_TITLE, PREGNANCY_QUESTION, pregnancyLabel, sensitivityLabel } from "@/lib/profile";
import { CANVAS, CARD_RADIUS, DANGER, INK, LINK, SPACE, SURFACE, TYPE } from "@/lib/tokens";
import { EMPTY_PROFILE, MAX_CONCERNS, useAppStore, visibleConcernCount } from "@/store/useAppStore";
import { FitScrollView } from "@/components/FitScrollView";

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
 * Skin profile (v9): each answer from the skin quiz on its own stone card,
 * under the question, with "Change" — no pictures in v9. Change opens that one question in
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

  // "Reset" (owner): every answer back to not set, at once, with an Undo that
  // puts them all back, like taking something off a list on Saved.
  const [notice, setNotice] = useState<UndoNotice | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);
  const hasAnswers = profile.concerns.length > 0 || profile.baseSkinType !== null || profile.sensitivity !== null || profile.pregnancyStatus !== null;
  const reset = () => {
    const before = profile;
    const answeredBefore = answered;
    setProfile(EMPTY_PROFILE);
    setAnswered(new Set());
    setOpen(null);
    haptic.select();
    setNotice({
      id: Date.now(),
      message: "Skin profile reset",
      undo: () => {
        setProfile(before);
        setAnswered(answeredBefore);
      },
    });
  };

  const values: Record<Question, string> = {
    skinType: profile.baseSkinType ? titleCase(profile.baseSkinType) : answered.has("skinType") ? "I don't know" : "Not set",
    concerns:
      profile.concerns.length > 0
        ? profile.concerns.map((c) => CONCERN_TITLE[c]).join(", ")
        : answered.has("concerns")
          ? "None chosen"
          : "Not set",
    sensitivity: profile.sensitivity ? sensitivityLabel(profile.sensitivity) : answered.has("sensitivity") ? "I don't know" : "Not set",
    pregnancy: profile.pregnancyStatus ? pregnancyLabel(profile.pregnancyStatus) : "Not set",
  };


  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      <FitScrollView contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: 48 }}>
        {/* "Reset" on the title's own line (owner), at its right: words, not a
            button, like "Clear all" on Saved, in the app's red so it reads as
            taking the answers away (owner). Only there when there is an
            answer to reset. It ends where the cards' "Change" ends. */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.block }}>
          <View style={{ flex: 1 }}>
            <PageTitle title="Skin profile" />
          </View>
          {hasAnswers ? (
            <Pressable onPress={reset} accessibilityRole="button" accessibilityLabel="Reset skin profile" hitSlop={12} style={{ paddingRight: SPACE.gutter, justifyContent: "center" }} className="active:opacity-70">
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: DANGER }}>Reset</Text>
            </Pressable>
          ) : null}
        </View>
        {/* In ink, not secondary grey (v9): it says what the page is for. */}
        <Text style={{ paddingTop: SPACE.block, paddingHorizontal: 4, fontSize: TYPE.body, lineHeight: 21, color: INK }}>
          Every score is made from these answers. Change one and your scores update.
        </Text>

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
                  // 16 at the left, not the hand-off's 12 (which was the
                  // removed picture's inset): the answer lines up with the chips.
                  style={{ minHeight: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}
                  className="active:opacity-70"
                >
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
      </FitScrollView>
      <UndoToast notice={notice} onDone={clearNotice} />
    </View>
  );
}

// v9: a row's least height.
const ROW_HEIGHT = 64;

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
