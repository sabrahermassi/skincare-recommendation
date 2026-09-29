import { router } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ConcernPicker, PregnancyPicker, SensitivityPicker, SkinTypePicker } from "@/components/ProfilePickers";
import { PageTitle } from "@/components/PageTitle";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Text } from "@/components/Text";
import type { Concern, SkinProfile } from "@/data/types";
import { haptic } from "@/lib/haptics";
import { isPersonalized, PREGNANCY_QUESTION, PREGNANCY_WHY } from "@/lib/profile";
import { CANVAS, HAIRLINE, LINK, MUTED, SPACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";
import { useFinderChoices } from "@/lib/finder-choices";
import { EMPTY_PROFILE, MAX_CONCERNS, visibleConcernCount } from "@/store/useAppStore";

type Question = "concerns" | "skinType" | "sensitivity" | "pregnancy";

/**
 * Skincare finder (owner, after OnSkin's; v7 look): the four skin questions on
 * one page that scrolls, every option a chip, and "Show products" once at least one is
 * answered — no question is required. The answers are the finder's own
 * (`lib/finder-choices`): they rank its results and never change the skin
 * profile the quiz and the routine use, nor are changed by it (owner). Opened
 * from Home's "Find a product" card, and again from the results' Edit.
 */
export default function Finder() {
  const insets = useSafeAreaInsets();
  const stored = useFinderChoices((s) => s.choices);
  const setChoices = useFinderChoices((s) => s.setChoices);
  const [draft, setDraft] = useState<SkinProfile>(stored);
  // Which questions were answered on this page. "I don't know" and "I don't
  // have any concerns" store the same value as an unanswered question, so
  // this is what tells them apart.
  const [answered, setAnswered] = useState<ReadonlySet<Question>>(() => new Set());

  const answer = (question: Question, patch: Partial<SkinProfile>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setAnswered((a) => new Set(a).add(question));
  };
  const toggleConcern = (concern: Concern) => {
    const has = draft.concerns.includes(concern);
    if (!has && visibleConcernCount(draft.concerns) >= MAX_CONCERNS) return;
    answer("concerns", { concerns: has ? draft.concerns.filter((c) => c !== concern) : [...draft.concerns, concern] });
  };

  const hasAnswer =
    answered.size > 0 || isPersonalized(draft) || draft.sensitivity !== null || draft.pregnancyStatus !== null;

  const show = () => {
    setChoices(draft);
    haptic.success();
    router.push("/finder-results");
  };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader
        right={
          hasAnswer ? (
            <Pressable
              onPress={() => {
                setDraft({ ...EMPTY_PROFILE });
                setAnswered(new Set());
              }}
              accessibilityRole="button"
              hitSlop={8}
              style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
              className="active:opacity-70"
            >
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Reset</Text>
            </Pressable>
          ) : null
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: FOOTER_ROOM + insets.bottom }}>
        <PageTitle title="Skincare finder" line="Pick what matters and we'll show products that fit." />
        <Question title="Skin concerns">
          <ConcernPicker
            concerns={draft.concerns}
            noneChosen={answered.has("concerns")}
            onToggle={toggleConcern}
            onNone={() => answer("concerns", { concerns: [] })}
          />
        </Question>
        <Question title="Skin type">
          <SkinTypePicker
            value={draft.baseSkinType}
            unknownChosen={answered.has("skinType")}
            onChange={(baseSkinType) => answer("skinType", { baseSkinType })}
          />
        </Question>
        <Question title="Sensitivity">
          <SensitivityPicker
            value={draft.sensitivity}
            unknownChosen={answered.has("sensitivity")}
            onChange={(sensitivity) => answer("sensitivity", { sensitivity })}
          />
        </Question>
        <Question title={PREGNANCY_QUESTION} note={PREGNANCY_WHY}>
          <PregnancyPicker value={draft.pregnancyStatus} onChange={(pregnancyStatus) => answer("pregnancy", { pregnancyStatus })} />
        </Question>
      </ScrollView>

      {/* The button stays at the foot of the screen, on its own bar (v7). */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: SPACE.block,
          paddingHorizontal: SPACE.gutter,
          paddingBottom: Math.max(SPACE.block, insets.bottom),
          borderTopWidth: 0.5,
          borderTopColor: HAIRLINE,
          backgroundColor: CANVAS,
        }}
      >
        <PrimaryButton label="Show products" onPress={show} disabled={!hasAnswer} />
      </View>
    </View>
  );
}

// Room at the end of the list so its last question clears the button bar.
const FOOTER_ROOM = 96;

/** One question (v7): its caps label over its chips, straight on the page. */
function Question({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View>
      <SectionLabel title={title} first />
      {children}
      {note ? <Text style={{ marginTop: SPACE.text, paddingHorizontal: 4, fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>{note}</Text> : null}
    </View>
  );
}
