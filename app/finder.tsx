import { router } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ConcernPicker, PregnancyPicker, SensitivityPicker, SkinTypePicker } from "@/components/ProfilePickers";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import type { Concern, SkinProfile } from "@/data/types";
import { haptic } from "@/lib/haptics";
import { isPersonalized, PREGNANCY_QUESTION, PREGNANCY_WHY } from "@/lib/profile";
import { CANVAS, CARD_SHADOW, INK, MUTED, SPACE, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";
import { useFinderChoices } from "@/lib/finder-choices";
import { EMPTY_PROFILE, MAX_CONCERNS, visibleConcernCount } from "@/store/useAppStore";

type Question = "concerns" | "skinType" | "sensitivity" | "pregnancy";

/**
 * Skincare finder (owner, after OnSkin's): the four skin questions on one page
 * that scrolls, every option a chip, and "Show products" once at least one is
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
        title="Skincare finder"
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
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: MUTED }}>Reset</Text>
            </Pressable>
          ) : null
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: FOOTER_ROOM + insets.bottom }}>
        <Card title="Skin concerns">
          <ConcernPicker
            concerns={draft.concerns}
            noneChosen={answered.has("concerns")}
            onToggle={toggleConcern}
            onNone={() => answer("concerns", { concerns: [] })}
          />
        </Card>
        <Card title="Skin type">
          <SkinTypePicker
            value={draft.baseSkinType}
            unknownChosen={answered.has("skinType")}
            onChange={(baseSkinType) => answer("skinType", { baseSkinType })}
          />
        </Card>
        <Card title="Sensitivity">
          <SensitivityPicker
            value={draft.sensitivity}
            unknownChosen={answered.has("sensitivity")}
            onChange={(sensitivity) => answer("sensitivity", { sensitivity })}
          />
        </Card>
        <Card title={PREGNANCY_QUESTION} note={PREGNANCY_WHY}>
          <PregnancyPicker value={draft.pregnancyStatus} onChange={(pregnancyStatus) => answer("pregnancy", { pregnancyStatus })} />
        </Card>
      </ScrollView>

      <View style={{ position: "absolute", left: 20, right: 20, bottom: Math.max(SPACE.block, insets.bottom) }}>
        <PrimaryButton label="Show products" onPress={show} disabled={!hasAnswer} />
      </View>
    </View>
  );
}

// Room at the end of the list so its last card clears the fixed button.
const FOOTER_ROOM = 96;

/** One question: a white rounded card with its title over its chips. */
function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={{ borderRadius: 24, backgroundColor: SURFACE, padding: 18, gap: 12, ...CARD_SHADOW }}>
      <Text accessibilityRole="header" style={{ fontSize: TYPE.title, fontWeight: "700", color: INK }}>
        {title}
      </Text>
      {children}
      {note ? <Text style={{ fontSize: TYPE.caption, lineHeight: 17, color: MUTED }}>{note}</Text> : null}
    </View>
  );
}
