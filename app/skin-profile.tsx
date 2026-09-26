import { Image } from "expo-image";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { ArrowIcon } from "@/components/icons/ArrowIcon";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
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
  answeredWithoutSignal,
  CONCERN_TITLE,
  POST_ONBOARDING_ROUTE,
  pregnancyLabel,
  sensitivityLabel,
} from "@/lib/profile";
import { MAX_CONCERNS, useAppStore, visibleConcernCount } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, CARD_SHADOW, CHIP_SHADOW, DANGER, FLOATING_SHADOW, INK, MUTED, RADIUS_SELECTOR, SELECTED, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";
import { haptic } from "@/lib/haptics";

// The design system (design/DESIGN_SYSTEM.md), restyled per
// design-watercolor/reference.png's "My profile" screen.

const SENSITIVITY_OPTIONS: Sensitivity[] = ["none", "some", "high"];
// Same set and order as the quiz's concerns step (app/quiz/concerns.tsx)
// — "Eczema-prone" is not offered here either, per this session's design
// decision to drop it from every selectable surface (the `atopic` concern and
// its scoring rules stay intact for any profile that already carries it).
const CONCERN_OPTIONS: { value: Concern; label: string; icon: number }[] = [
  { value: "dehydrated", label: CONCERN_TITLE.dehydrated, icon: require("@/assets/illustrations/quiz/concern-dehydrated.png") },
  { value: "dullness", label: CONCERN_TITLE.dullness, icon: require("@/assets/illustrations/quiz/concern-dullness.png") },
  { value: "acne-prone", label: CONCERN_TITLE["acne-prone"], icon: require("@/assets/illustrations/quiz/concern-acne.png") },
  { value: "hyperpigmentation", label: CONCERN_TITLE.hyperpigmentation, icon: require("@/assets/illustrations/quiz/concern-dark-spots.png") },
  { value: "large-pores", label: CONCERN_TITLE["large-pores"], icon: require("@/assets/illustrations/quiz/concern-large-pores.png") },
  { value: "fine-lines", label: CONCERN_TITLE["fine-lines"], icon: require("@/assets/illustrations/quiz/concern-fine-lines.png") },
  { value: "redness", label: CONCERN_TITLE.redness, icon: require("@/assets/illustrations/quiz/concern-redness.png") },
  { value: "post-acne-marks", label: CONCERN_TITLE["post-acne-marks"], icon: require("@/assets/illustrations/quiz/concern-post-acne.png") },
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

  const [draft, setDraft] = useState<SkinProfile>(storedProfile);
  const [expanded, setExpanded] = useState<SectionKey | null>(null);
  // Gates every way back: the expand-in-place editors make it easy to tap a
  // couple of chips and then reflexively go back, which used to discard that
  // draft with no warning at all.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  function patch(p: Partial<SkinProfile>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function toggleDraftConcern(concern: Concern) {
    setDraft((d) => {
      if (d.concerns.includes(concern)) {
        return { ...d, concerns: d.concerns.filter((c) => c !== concern) };
      }
      // The store's count, not the raw array: a profile from before `atopic` was
      // dropped from the pickers still carries it, and it must not use up a slot the
      // person cannot see.
      if (visibleConcernCount(d.concerns) >= MAX_CONCERNS) return d;
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

  // Every way out — the chevron, the iOS swipe-back, Android's back — arrives here
  // while there is an unsaved draft, and waits on the confirmation below. The
  // leave that was held back is kept, so "Discard changes" finishes that same
  // leave (a swipe goes back, a link-straight-here fallback still replaces).
  // Saving is the one leave that must not ask: the store has the draft already,
  // but `dirty` still reads the last render until the screen re-renders.
  const navigation = useNavigation();
  const heldLeave = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const saving = useRef(false);
  usePreventRemove(dirty, ({ data }) => {
    if (saving.current) {
      navigation.dispatch(data.action);
      return;
    }
    heldLeave.current = data.action;
    setConfirmingDiscard(true);
  });

  function save() {
    saving.current = true;
    setProfile(draft);
    haptic.success();
    // Home, which shows the profile the save produced.
    router.replace(POST_ONBOARDING_ROUTE);
  }

  const visibleConcerns = visibleConcernCount(draft.concerns);
  const atLimit = visibleConcerns >= MAX_CONCERNS;

  // Back to the Profile menu; with nothing behind this screen (a link straight
  // here) fall back to Search rather than erroring.
  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/browse");
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
            : { icon: UNSURE_ICON, label: CONCERN_TITLE.atopic };
        })
      : // "I don't have any concerns" is stored as no concerns, the same as a
        // skipped step; once the quiz was answered, say what they chose (#291).
        [{ icon: null, label: answeredWithoutSignal(draft) ? "No concerns" : "Not set" }];

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
          onPress={leave}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 21 }}
          className="active:opacity-70"
        >
          <ArrowIcon direction="left" size={24} color={INK} />
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
            ...FLOATING_SHADOW,
          }}
        >
          <Text style={{ fontSize: 12.5, lineHeight: 17, color: MUTED }}>
            You have unsaved changes. Leave without saving?
          </Text>
          <View style={{ flexDirection: "row", gap: 20 }}>
            <Pressable onPress={() => setConfirmingDiscard(false)} accessibilityRole="button" style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }} className="active:opacity-70">
              <Text style={{ fontSize: 12, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
                Keep editing
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setConfirmingDiscard(false);
                const held = heldLeave.current;
                heldLeave.current = null;
                if (held) navigation.dispatch(held);
              }}
              accessibilityRole="button"
              style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
              className="active:opacity-70"
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
            Skin profile
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
            {atLimit ? `${MAX_CONCERNS} chosen – deselect one to swap.` : `${visibleConcerns} of ${MAX_CONCERNS} chosen.`}
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

      </ScrollView>

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
          <PrimaryButton size={52} label="Save" onPress={save} />
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
        ...CHIP_SHADOW,
        opacity: disabled ? 0.4 : 1,
      }}
      className="active:opacity-70"
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
        ...CARD_SHADOW,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK }}>{title}</Text>
        <Pressable
          onPress={onToggleEdit}
          hitSlop={8}
          accessibilityRole="button"
          style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 4 }}
          className="active:opacity-70"
        >
          {/* INK, not the peach CTA: CTA as text on white is about 2.5:1 (#313). */}
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>{expanded ? "Done" : "Edit"}</Text>
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
