import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";
// TERRACOTTA is otherwise a FOR.ME shell-only token (see shared.tsx's own
// header comment) — reused here specifically because "match the quiz's
// selected-chip color" was an explicit request, not a guess at a value.
import { TERRACOTTA } from "@/components/shell/shared";
import type {
  BaseSkinType,
  Concern,
  Pregnancy,
  Sensitivity,
  SkinProfile,
} from "@/data/types";
import {
  POST_ONBOARDING_ROUTE,
  pregnancyLabel,
  sensitivityLabel,
} from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, CTA, DANGER, INK, MUTED, RADIUS_SELECTOR, SELECTED, SURFACE, TYPE } from "@/lib/tokens";

// The design system (design/DESIGN_SYSTEM.md), restyled per
// design-watercolor/reference.png's "My profile" screen.

const SENSITIVITY_OPTIONS: Sensitivity[] = ["none", "some", "high"];
// Same set and order as the quiz's concerns step (app/onboarding/(quiz)/concerns.tsx)
// — "Eczema-prone" is not offered here either, per this session's design
// decision to drop it from every selectable surface (the `atopic` concern and
// its scoring rules stay intact for any profile that already carries it).
const CONCERN_OPTIONS: { value: Concern; label: string; icon: number }[] = [
  { value: "dehydrated", label: "Dry / Dehydrated", icon: require("@/assets/illustrations/quiz/concern-dehydrated.png") },
  { value: "dullness", label: "Dullness", icon: require("@/assets/illustrations/quiz/concern-dullness.png") },
  { value: "acne-prone", label: "Acne or pimples", icon: require("@/assets/illustrations/quiz/concern-acne.png") },
  { value: "hyperpigmentation", label: "Dark spots", icon: require("@/assets/illustrations/quiz/concern-dark-spots.png") },
  { value: "large-pores", label: "Enlarged pores", icon: require("@/assets/illustrations/quiz/concern-large-pores.png") },
  { value: "fine-lines", label: "Fine lines and wrinkles", icon: require("@/assets/illustrations/quiz/concern-fine-lines.png") },
  { value: "redness", label: "Redness or rosacea", icon: require("@/assets/illustrations/quiz/concern-redness.png") },
  { value: "post-acne-marks", label: "Post-acne marks", icon: require("@/assets/illustrations/quiz/concern-post-acne.png") },
];
const CONCERN_LOOKUP = new Map(CONCERN_OPTIONS.map((o) => [o.value, o]));

const SKIN_TYPES: { value: BaseSkinType; label: string; icon: number }[] = [
  { value: "dry", label: "Dry", icon: require("@/assets/illustrations/quiz/skin-dry.png") },
  { value: "oily", label: "Oily", icon: require("@/assets/illustrations/quiz/skin-oily.png") },
  { value: "combination", label: "Combination", icon: require("@/assets/illustrations/quiz/skin-combination.png") },
  { value: "normal", label: "Normal", icon: require("@/assets/illustrations/quiz/skin-normal.png") },
];
const SKIN_TYPE_LOOKUP = new Map(SKIN_TYPES.map((o) => [o.value, o]));

const SENSITIVITY_ICONS: Record<Sensitivity, number> = {
  none: require("@/assets/illustrations/quiz/sensitivity-none.png"),
  some: require("@/assets/illustrations/quiz/sensitivity-some.png"),
  high: require("@/assets/illustrations/quiz/sensitivity-high.png"),
};

const PREGNANCY_OPTIONS: Pregnancy[] = ["pregnant", "breastfeeding", "neither", "prefer-not-to-say"];
const PREGNANCY_ICONS: Record<Pregnancy, number> = {
  pregnant: require("@/assets/illustrations/quiz/pregnancy-pregnant.png"),
  breastfeeding: require("@/assets/illustrations/quiz/pregnancy-breastfeeding.png"),
  neither: require("@/assets/illustrations/quiz/concern-none.png"),
  "prefer-not-to-say": require("@/assets/illustrations/quiz/unsure.png"),
};

const UNSURE_ICON = require("@/assets/illustrations/quiz/unsure.png");

const MAX_CONCERNS = 3;

type SectionKey = "concerns" | "skinType" | "sensitivity" | "pregnancy";

/**
 * A read-only summary of all four quiz answers, each expandable in place
 * into its own editor — a local draft, committed with a single "Find my
 * matches" once something has actually changed. A half-changed profile
 * must never re-score the browse list underneath it, so nothing here writes
 * to the store until that button is pressed.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const storedProfile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const resetApp = useAppStore((s) => s.resetApp);

  const [draft, setDraft] = useState<SkinProfile>(storedProfile);
  const [expanded, setExpanded] = useState<SectionKey | null>(null);
  // Gates `resetApp()` behind a second, explicit tap in a real Modal — this
  // is the one irreversible action on this screen (wipes the profile, the
  // saved shelf and the whole history, then clears AsyncStorage so the wipe
  // survives a relaunch), so a single mis-tap must not be able to trigger it.
  const [confirmingErase, setConfirmingErase] = useState(false);
  // Gates the back chevron instead: the new expand-in-place editors make it
  // easy to tap a couple of chips and then reflexively tap back, which used
  // to discard that draft with no warning at all.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  // Tab screens stay mounted across a switch, so without this, confirming
  // partway, tapping another tab and coming back would still show "Erase
  // your profile?" (or "Discard changes?") with no reminder of what was being
  // confirmed.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setConfirmingErase(false);
        setConfirmingDiscard(false);
      };
    }, [])
  );

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

  function toggleSection(section: SectionKey) {
    setExpanded((cur) => (cur === section ? null : section));
  }

  // Only true once something in the draft actually differs from what's
  // stored — the reference's clean read-only view has nothing to commit
  // until then, so the save bar has no reason to be on screen yet.
  // `concerns` is sorted before comparing: toggling one off and back on
  // re-appends it at the end of the array, which would otherwise read as
  // "changed" even though the resulting set is identical.
  const dirty = useMemo(() => {
    const normalize = (p: SkinProfile) => JSON.stringify({ ...p, concerns: [...p.concerns].sort() });
    return normalize(draft) !== normalize(storedProfile);
  }, [draft, storedProfile]);

  function save() {
    setProfile(draft);
    // Profile is a tab now rather than a pushed modal, so router.back() has
    // nothing reliable to return to - go straight to the tab that shows the
    // effect of the save.
    router.replace(POST_ONBOARDING_ROUTE);
  }

  const atLimit = draft.concerns.length >= MAX_CONCERNS;

  // Profile is a tab, so it normally has no back arrow - that's the right
  // default for the tab bar. But the profile pill on Scan and Browse also
  // pushes straight to it, and from there landing with no way back except
  // "remember which tab you started on" is a dead end. `canGoBack` tells the
  // two cases apart: true when we arrived via the pill's push, false when we
  // arrived by tapping the Profile tab itself - in which case there's nothing
  // to go back *to*, so the arrow falls back to Browse instead of erroring.
  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/browse");
  }

  function goBack() {
    // An in-progress edit (a chip tapped, nothing saved yet) used to vanish
    // silently the moment this was tapped — the expand-in-place editors make
    // that easy to hit by accident now that browsing between cards happens
    // before the one save action, not during every keystroke.
    if (dirty) {
      setConfirmingDiscard(true);
      return;
    }
    leave();
  }

  const concernRows: SummaryRow[] =
    draft.concerns.length > 0
      ? draft.concerns.map((c) => {
          const option = CONCERN_LOOKUP.get(c);
          // `atopic` is the one Concern value with no selectable option or
          // quiz icon (dropped from every picker, but a profile from before
          // that change can still carry it — see CONCERN_OPTIONS' own
          // comment). Falling back to the "no concerns" icon and the raw
          // enum text here would show a leaf-code word next to an icon that
          // means the opposite of what's true.
          return option
            ? { icon: option.icon, label: option.label }
            : { icon: UNSURE_ICON, label: "Eczema-prone" };
        })
      : [{ icon: null, label: "Not set" }];

  const skinTypeOption = draft.baseSkinType ? SKIN_TYPE_LOOKUP.get(draft.baseSkinType) : undefined;
  const skinTypeRows: SummaryRow[] = [
    skinTypeOption
      ? { icon: skinTypeOption.icon, label: skinTypeOption.label }
      : { icon: draft.baseSkinType ? null : UNSURE_ICON, label: draft.baseSkinType ? "Not set" : "I don't know" },
  ];

  const sensitivityRows: SummaryRow[] = [
    draft.sensitivity
      ? { icon: SENSITIVITY_ICONS[draft.sensitivity], label: sensitivityLabel(draft.sensitivity) }
      : { icon: UNSURE_ICON, label: "I don't know" },
  ];

  const pregnancyRows: SummaryRow[] = [
    draft.pregnancyStatus
      ? { icon: PREGNANCY_ICONS[draft.pregnancyStatus], label: pregnancyLabel(draft.pregnancyStatus) }
      : { icon: null, label: "Not set" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: 2 }}>
        <Pressable
          onPress={goBack}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 21 }}
        >
          <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
            <Path
              d="m15 5-7 7 7 7"
              stroke={INK}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      </View>

      {confirmingDiscard && (
        <View
          style={{
            marginHorizontal: 20,
            marginBottom: 4,
            padding: 14,
            gap: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: BORDER_INACTIVE,
            backgroundColor: SURFACE,
          }}
        >
          <Text style={{ fontSize: 12.5, lineHeight: 17, color: MUTED }}>
            You have unsaved changes. Leave without saving?
          </Text>
          <View style={{ flexDirection: "row", gap: 20 }}>
            <Pressable onPress={() => setConfirmingDiscard(false)} hitSlop={8}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
                Keep editing
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setConfirmingDiscard(false);
                leave();
              }}
              hitSlop={8}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: DANGER, textDecorationLine: "underline" }}>
                Discard changes
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: dirty ? 170 : 60,
          gap: 20,
        }}
      >
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 26, color: INK }}>
            My profile
          </Text>
          <Text style={{ fontSize: 12.5, lineHeight: 17, color: MUTED }}>
            Your skin profile helps us give you more relevant recommendations.
          </Text>
        </View>

        <Section title="Skin concerns" expanded={expanded === "concerns"} onToggleEdit={() => toggleSection("concerns")} rows={concernRows}>
          <View style={CHIP_ROW}>
            {CONCERN_OPTIONS.map((option) => {
              const selected = draft.concerns.includes(option.value);
              return (
                <ProfileChip
                  key={option.value}
                  multiple
                  label={option.label}
                  selected={selected}
                  disabled={!selected && atLimit}
                  onPress={() => toggleDraftConcern(option.value)}
                />
              );
            })}
          </View>
          {/* Same "no concerns" escape hatch the quiz offers, separate from
              the multi-select grid above it — clearing to an empty array is
              a real answer here too, not just "hasn't touched this yet". */}
          <ProfileChip
            label="I don't have any concerns"
            role="button"
            selected={draft.concerns.length === 0}
            onPress={() => patch({ concerns: [] })}
          />
          <Text style={{ fontSize: TYPE.caption, color: MUTED }}>
            {atLimit ? `${MAX_CONCERNS} chosen – deselect one to swap.` : `${draft.concerns.length} of ${MAX_CONCERNS} chosen.`}
          </Text>
        </Section>

        <Section title="Skin type" expanded={expanded === "skinType"} onToggleEdit={() => toggleSection("skinType")} rows={skinTypeRows}>
          <View style={CHIP_ROW}>
            {SKIN_TYPES.map((option) => (
              <ProfileChip
                key={option.value}
                label={option.label}
                selected={draft.baseSkinType === option.value}
                onPress={() => patch({ baseSkinType: option.value })}
              />
            ))}
            {/* `null` is a real answer here too, same as the quiz's identical
                "I don't know" option (skin-type.tsx) — not just "unanswered". */}
            <ProfileChip
              label="I don't know"
              selected={draft.baseSkinType === null}
              onPress={() => patch({ baseSkinType: null })}
            />
          </View>
        </Section>

        {/* Its own section now, not a toggle under skin type: three levels
            answering a different question - how harshly to judge irritants,
            rather than what your skin is. */}
        <Section title="Sensitivity" expanded={expanded === "sensitivity"} onToggleEdit={() => toggleSection("sensitivity")} rows={sensitivityRows}>
          <View style={CHIP_ROW}>
            {SENSITIVITY_OPTIONS.map((option) => (
              <ProfileChip
                key={option}
                label={sensitivityLabel(option)}
                selected={draft.sensitivity === option}
                onPress={() => patch({ sensitivity: option })}
              />
            ))}
            {/* Same identical "I don't know" precedent as skin type, above. */}
            <ProfileChip
              label="I don't know"
              selected={draft.sensitivity === null}
              onPress={() => patch({ sensitivity: null })}
            />
          </View>
        </Section>

        {/* The quiz's 4th question. A caution here quiets certain
            ingredients (retinoids, salicylic acid, hydroquinone, some
            essential oils) rather than sitting unread - see
            lib/pregnancy-caution.ts. */}
        <Section title="Pregnancy / breastfeeding" expanded={expanded === "pregnancy"} onToggleEdit={() => toggleSection("pregnancy")} rows={pregnancyRows}>
          <View style={CHIP_ROW}>
            {PREGNANCY_OPTIONS.map((option) => (
              <ProfileChip
                key={option}
                label={pregnancyLabel(option)}
                selected={draft.pregnancyStatus === option}
                onPress={() => patch({ pregnancyStatus: option })}
              />
            ))}
          </View>
        </Section>

        {/*
          "Retake the quiz" is gone — every section above is already
          individually editable in place, so a separate full-quiz replay
          button was doing nothing a section's own "Edit" doesn't already do.
          This is now the one remaining irreversible action on the screen: it
          wipes the profile, the saved shelf and the whole history, then
          clears AsyncStorage so the wipe survives a relaunch — hence the
          real confirmation modal below rather than a single tap.
        */}
        <Pressable
          onPress={() => setConfirmingErase(true)}
          style={{
            minHeight: 52,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 26,
            borderWidth: 1,
            borderColor: DANGER,
          }}
          className="active:opacity-70"
        >
          <Text style={{ fontSize: 15, fontWeight: "500", color: DANGER }}>Erase my profile</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={confirmingErase}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingErase(false)}
      >
        <Pressable
          onPress={() => setConfirmingErase(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(36,31,30,0.45)",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
        >
          {/* Swallows its own tap so tapping the card doesn't also hit the
              scrim's onPress behind it and dismiss the confirmation. */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 340, borderRadius: 20, backgroundColor: SURFACE, padding: 24, gap: 16 }}
          >
            <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 19, color: INK }}>
              Are you sure?
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>
              This erases your profile, shelf and history. It can&apos;t be undone.
            </Text>
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => {
                  setConfirmingErase(false);
                  resetApp();
                  router.replace({ pathname: "/onboarding", params: { erased: "1" } });
                }}
                style={{
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 24,
                  backgroundColor: DANGER,
                }}
                className="active:opacity-90"
              >
                <Text style={{ fontSize: 14.5, fontWeight: "600", color: SURFACE }}>Yes, delete my profile</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmingErase(false)}
                style={{
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: BORDER_INACTIVE,
                }}
              >
                <Text style={{ fontSize: 14.5, fontWeight: "600", color: INK }}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {dirty && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            borderTopWidth: 1,
            borderTopColor: BORDER_INACTIVE,
            backgroundColor: CANVAS,
            paddingHorizontal: 20,
            paddingBottom: 32,
            paddingTop: 14,
          }}
        >
          <Pressable
            onPress={save}
            style={{
              minHeight: 52,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 26,
              backgroundColor: CTA,
            }}
            className="active:opacity-90"
          >
            <Text style={{ fontSize: 15, fontWeight: "500", color: INK }}>Find my matches</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const CHIP_ROW = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 8,
} as const;

type SummaryRow = { icon: number | null; label: string };

/**
 * The profile screen's own chip: same border/fill/ink language as the quiz's
 * `QuizChip`, but auto-width and wrap-flowed rather than a fixed 48%-of-row
 * grid - this screen edits a variable number of options per section (2 areas,
 * 4 skin types, up to 8 concerns), where a two-per-row grid would leave
 * ragged, oddly-wide chips. Documented as an extension in
 * design/DESIGN_SYSTEM.md rather than styled ad hoc.
 */
function ProfileChip({
  label,
  selected = false,
  disabled = false,
  multiple = false,
  /** Overrides the computed checkbox/radio role — for a chip like "I don't
   *  have any concerns" that resets a multi-select grid rather than being a
   *  member of a mutually-exclusive radio group. */
  role,
  onPress,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  role?: "button";
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role ?? (multiple ? "checkbox" : "radio")}
      accessibilityState={role === "button" ? { disabled } : { checked: selected, disabled }}
      hitSlop={6}
      style={{
        height: 44,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADIUS_SELECTOR,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? TERRACOTTA : BORDER_INACTIVE,
        backgroundColor: selected ? SELECTED : CANVAS,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: 13.5, fontWeight: "600", color: selected ? INK : MUTED }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One card per quiz question. Collapsed (the default) shows a read-only row
 * per current answer with icons reused straight from the quiz — tapping
 * "Edit" swaps it for that field's chip picker (`children`); tapping "Done"
 * (the same control, relabeled) swaps it back. Only one section is ever
 * expanded at a time — the caller enforces that by keying all four off one
 * `expanded` state — so the screen stays a single, calm edit at a time
 * rather than every field's picker showing at once.
 */
function Section({
  title,
  expanded,
  onToggleEdit,
  rows,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggleEdit: () => void;
  rows: SummaryRow[];
  children: ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER_INACTIVE,
        backgroundColor: SURFACE,
        padding: 16,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK }}>{title}</Text>
        <Pressable
          onPress={onToggleEdit}
          hitSlop={8}
          accessibilityRole="button"
          style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 4 }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: CTA }}>{expanded ? "Done" : "Edit"}</Text>
        </Pressable>
      </View>

      {expanded ? (
        <View style={{ gap: 10 }}>{children}</View>
      ) : (
        <View style={{ gap: 12 }}>
          {rows.map((row) => (
            <View key={row.label} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {row.icon ? (
                <Image source={row.icon} style={{ width: 32, height: 32 }} contentFit="contain" accessibilityLabel="" />
              ) : (
                <View style={{ width: 32, height: 32 }} />
              )}
              <Text style={{ fontSize: 14, color: row.icon ? INK : MUTED }}>{row.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
