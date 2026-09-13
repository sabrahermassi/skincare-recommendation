import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import type { BaseSkinType, Concern, Pregnancy, Sensitivity } from "@/data/types";
import { pregnancyLabel, sensitivityLabel } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, CTA, DANGER, INK, MUTED, RADIUS_SELECTOR, SELECTED, SURFACE } from "@/lib/tokens";

// Manassa system (design/DESIGN_SYSTEM.md), restyled per
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
const NO_CONCERNS_ICON = require("@/assets/illustrations/quiz/concern-none.png");

const MAX_CONCERNS = 3;

type SectionKey = "concerns" | "skinType" | "sensitivity" | "pregnancy";

/**
 * A read-only summary of all four quiz answers, each expandable in place
 * into its own editor. Every tap commits straight to the store — same
 * immediate-apply model the onboarding quiz already uses for these same
 * fields (`setProfile`/`toggleConcern` in store/useAppStore.ts) — so there is
 * no draft, no save step, and nothing to lose by leaving.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const storedProfile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const toggleConcern = useAppStore((s) => s.toggleConcern);
  const resetApp = useAppStore((s) => s.resetApp);

  const [expanded, setExpanded] = useState<SectionKey | null>(null);
  // Gates `resetApp()` behind a second, explicit tap. This is the one
  // irreversible action on this screen — it wipes the profile, the saved
  // shelf and the whole history, then clears AsyncStorage so the wipe
  // survives a relaunch — so a single mis-tap must not be able to trigger
  // it. An inline confirm rather than `Alert.alert`: nothing else in this
  // codebase uses Alert, and this app treats web as first-class, where
  // Alert's behavior on this React Native Web version isn't established.
  const [confirmingReset, setConfirmingReset] = useState(false);
  // Tab screens stay mounted across a switch, so without this, confirming
  // partway and tapping another tab and back would still show "Erase
  // everything?" with no reminder of what was being confirmed.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setConfirmingReset(false);
      };
    }, [])
  );

  function toggleSection(section: SectionKey) {
    setExpanded((cur) => (cur === section ? null : section));
  }

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

  // Same exclusion the quiz's own `visibleCount` applies (concerns.tsx): a
  // profile carrying the no-longer-selectable `atopic` concern must not
  // count toward the cap, or it would show "3 of 3" and disable every chip
  // for someone who has only picked 2 things they can actually see.
  const atLimit = storedProfile.concerns.filter((c) => CONCERN_LOOKUP.has(c)).length >= MAX_CONCERNS;

  const concernRows: SummaryRow[] =
    storedProfile.concerns.length > 0
      ? storedProfile.concerns.map((c) => {
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
      : // An empty array only happens via the "I don't have any concerns" chip
        // below — a real, explicit answer, not an unanswered field (unlike
        // `baseSkinType`/`sensitivity`, which are nullable for that case).
        [{ icon: NO_CONCERNS_ICON, label: "I don't have any concerns" }];

  const skinTypeOption = storedProfile.baseSkinType ? SKIN_TYPE_LOOKUP.get(storedProfile.baseSkinType) : undefined;
  const skinTypeRows: SummaryRow[] = [
    skinTypeOption
      ? { icon: skinTypeOption.icon, label: skinTypeOption.label }
      : { icon: storedProfile.baseSkinType ? null : UNSURE_ICON, label: storedProfile.baseSkinType ? "Not set" : "I don't know" },
  ];

  const sensitivityRows: SummaryRow[] = [
    storedProfile.sensitivity
      ? { icon: SENSITIVITY_ICONS[storedProfile.sensitivity], label: sensitivityLabel(storedProfile.sensitivity) }
      : { icon: UNSURE_ICON, label: "I don't know" },
  ];

  const pregnancyRows: SummaryRow[] = [
    storedProfile.pregnancyStatus
      ? { icon: PREGNANCY_ICONS[storedProfile.pregnancyStatus], label: pregnancyLabel(storedProfile.pregnancyStatus) }
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

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: 60,
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
              const selected = storedProfile.concerns.includes(option.value);
              return (
                <ProfileChip
                  key={option.value}
                  multiple
                  label={option.label}
                  selected={selected}
                  disabled={!selected && atLimit}
                  onPress={() => toggleConcern(option.value)}
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
            selected={storedProfile.concerns.length === 0}
            onPress={() => setProfile({ concerns: [] })}
          />
          <Text style={{ fontSize: 10.5, color: MUTED }}>
            {atLimit ? `${MAX_CONCERNS} chosen – deselect one to swap.` : `${storedProfile.concerns.length} of ${MAX_CONCERNS} chosen.`}
          </Text>
        </Section>

        <Section title="Skin type" expanded={expanded === "skinType"} onToggleEdit={() => toggleSection("skinType")} rows={skinTypeRows}>
          <View style={CHIP_ROW}>
            {SKIN_TYPES.map((option) => (
              <ProfileChip
                key={option.value}
                label={option.label}
                selected={storedProfile.baseSkinType === option.value}
                onPress={() => setProfile({ baseSkinType: option.value })}
              />
            ))}
            {/* `null` is a real answer here too, same as the quiz's identical
                "I don't know" option (skin-type.tsx) — not just "unanswered". */}
            <ProfileChip
              label="I don't know"
              selected={storedProfile.baseSkinType === null}
              onPress={() => setProfile({ baseSkinType: null })}
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
                selected={storedProfile.sensitivity === option}
                onPress={() => setProfile({ sensitivity: option })}
              />
            ))}
            {/* Same identical "I don't know" precedent as skin type, above. */}
            <ProfileChip
              label="I don't know"
              selected={storedProfile.sensitivity === null}
              onPress={() => setProfile({ sensitivity: null })}
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
                selected={storedProfile.pregnancyStatus === option}
                onPress={() => setProfile({ pregnancyStatus: option })}
              />
            ))}
          </View>
        </Section>

        <PrimaryButton variant="outline" label="Retake the quiz" onPress={() => router.replace("/onboarding")} />

        {/*
          Distinct from "Retake the quiz", which keeps your shelf and history.
          This is the way back to a genuinely first-run app - needed precisely
          because persistence works: once onboarding is done it stays done.
        */}
        {confirmingReset ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 4 }}>
            <Text style={{ textAlign: "center", fontSize: 11, lineHeight: 15, color: MUTED }}>
              This erases your profile, shelf and history. It can&apos;t be undone.
            </Text>
            <View style={{ flexDirection: "row", gap: 20 }}>
              <Pressable onPress={() => setConfirmingReset(false)} hitSlop={8}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  resetApp();
                  router.replace("/onboarding");
                }}
                hitSlop={8}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: DANGER, textDecorationLine: "underline" }}>
                  Erase everything
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setConfirmingReset(true)}
            style={{ alignItems: "center", paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: DANGER, textDecorationLine: "underline" }}>
              Start over - erase my profile, shelf and history
            </Text>
          </Pressable>
        )}
      </ScrollView>
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
        borderColor: selected ? INK : BORDER_INACTIVE,
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
