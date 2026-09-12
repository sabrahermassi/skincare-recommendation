import { router, useFocusEffect } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Avatar } from "@/components/Avatar";
import { Text } from "@/components/Text";
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
  profileSummary,
  sensitivityLabel,
} from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, CTA, DANGER, INK, MUTED, RADIUS_SELECTOR, SELECTED } from "@/lib/tokens";

// Manassa system (design/DESIGN_SYSTEM.md).

const SENSITIVITY_OPTIONS: Sensitivity[] = ["none", "some", "high"];
// Same set and order as the quiz's concerns step (app/onboarding/(quiz)/concerns.tsx)
// — "Eczema-prone" is not offered here either, per this session's design
// decision to drop it from every selectable surface (the `atopic` concern and
// its scoring rules stay intact for any profile that already carries it).
const CONCERN_OPTIONS: { value: Concern; label: string }[] = [
  { value: "dehydrated", label: "Dry / Dehydrated" },
  { value: "dullness", label: "Dullness" },
  { value: "acne-prone", label: "Acne or pimples" },
  { value: "hyperpigmentation", label: "Dark spots" },
  { value: "large-pores", label: "Enlarged pores" },
  { value: "fine-lines", label: "Fine lines and wrinkles" },
  { value: "redness", label: "Redness or rosacea" },
  { value: "post-acne-marks", label: "Post-acne marks" },
];
const SKIN_TYPES: { value: BaseSkinType; label: string }[] = [
  { value: "dry", label: "Dry" },
  { value: "oily", label: "Oily" },
  { value: "combination", label: "Combination" },
  { value: "normal", label: "Normal" },
];
const PREGNANCY_OPTIONS: Pregnancy[] = ["pregnant", "breastfeeding", "neither", "prefer-not-to-say"];
const MAX_CONCERNS = 3;

/**
 * All six quiz answers on one scrollable screen, edited as a local draft
 * and committed with a single "Save" - a half-changed profile must never
 * re-score the browse list underneath it.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const storedProfile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const resetApp = useAppStore((s) => s.resetApp);

  const [draft, setDraft] = useState<SkinProfile>(storedProfile);
  // Gates `resetApp()` behind a second, explicit tap. This is the one
  // irreversible action on this screen — it wipes the profile, the saved
  // shelf and the whole history, then clears AsyncStorage so the wipe
  // survives a relaunch — so a single mis-tap must not be able to trigger
  // it. An inline confirm rather than `Alert.alert`: nothing else in this
  // codebase uses Alert, and this app treats web as first-class, where
  // Alert's behavior on this React Native Web version isn't established.
  const [confirmingReset, setConfirmingReset] = useState(false);
  // Tab screens stay mounted across a switch, so without this, confirming
  // partway, tapping another tab and coming back would still show "Erase
  // everything?" with no reminder of what was being confirmed.
  useFocusEffect(
    useCallback(() => {
      return () => setConfirmingReset(false);
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

  function save() {
    setProfile(draft);
    // Profile is a tab now rather than a pushed modal, so router.back() has
    // nothing reliable to return to - go straight to the tab that shows the
    // effect of the save.
    router.replace(POST_ONBOARDING_ROUTE);
  }

  const atLimit = draft.concerns.length >= MAX_CONCERNS;
  const summary = profileSummary(draft);

  // Profile is a tab, so it normally has no back arrow - that's the right
  // default for the tab bar. But the profile pill on Scan and Browse also
  // pushes straight to it, and from there landing with no way back except
  // "remember which tab you started on" is a dead end. `canGoBack` tells the
  // two cases apart: true when we arrived via the pill's push, false when we
  // arrived by tapping the Profile tab itself - in which case there's nothing
  // to go back *to*, so the arrow falls back to Browse instead of erroring.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/browse");
  }

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

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 160, gap: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
          <Avatar size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: INK }}>Your skin profile</Text>
            <Text style={{ marginTop: 2, fontSize: 11.5, color: MUTED }}>
              {summary || "Not set up yet"}
            </Text>
          </View>
        </View>

        <Section title="Skin concerns" note={`${draft.concerns.length} of ${MAX_CONCERNS}`}>
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
        </Section>

        <Section title="Skin type">
          <View style={CHIP_ROW}>
            {SKIN_TYPES.map((option) => (
              <ProfileChip
                key={option.value}
                label={option.label}
                selected={draft.baseSkinType === option.value}
                onPress={() => patch({ baseSkinType: option.value })}
              />
            ))}
          </View>
        </Section>

        {/* Its own section now, not a toggle under skin type: three levels
            answering a different question - how harshly to judge irritants,
            rather than what your skin is. */}
        <Section title="Sensitivity">
          <View style={CHIP_ROW}>
            {SENSITIVITY_OPTIONS.map((option) => (
              <ProfileChip
                key={option}
                label={sensitivityLabel(option)}
                selected={draft.sensitivity === option}
                onPress={() => patch({ sensitivity: option })}
              />
            ))}
          </View>
        </Section>

        {/* The quiz's 4th question. A caution here quiets certain
            ingredients (retinoids, salicylic acid, hydroquinone, some
            essential oils) rather than sitting unread - see
            lib/pregnancy-caution.ts. */}
        <Section title="Pregnancy / breastfeeding">
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

        <Pressable
          onPress={() => router.replace("/onboarding")}
          style={{ alignItems: "center", paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
            Retake the quiz
          </Text>
        </Pressable>

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
    </View>
  );
}

const CHIP_ROW = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 8,
} as const;

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
  onPress,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, disabled }}
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

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.9, color: MUTED }}>
          {title}
        </Text>
        {note ? <Text style={{ fontSize: 10.5, color: MUTED }}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}
