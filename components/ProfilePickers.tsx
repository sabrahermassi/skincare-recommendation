import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import type { BaseSkinType, Concern, Pregnancy, Sensitivity } from "@/data/types";
import { CONCERN_TITLE, PREGNANCY_OPTIONS, pregnancyLabel, pregnancyOption, sensitivityLabel } from "@/lib/profile";
import { CHOSEN, LINE, MUTED, SPACE, TYPE, WHITE } from "@/lib/tokens";
import { MAX_CONCERNS, visibleConcernCount } from "@/store/useAppStore";

/**
 * The four skin-profile questions as chip pickers, shared by the Skincare
 * finder (all four open on one page) and the Skin profile editor (one open at
 * a time). The options and their order live here once.
 *
 * "Eczema-prone" is not offered: dropped from every selectable surface (the
 * `atopic` concern and its scoring rules stay intact for any profile that
 * already carries it).
 */
const CONCERNS: Concern[] = ["dehydrated", "dullness", "acne-prone", "hyperpigmentation", "large-pores", "fine-lines", "redness", "post-acne-marks"];
const SKIN_TYPES: { value: BaseSkinType; label: string }[] = [
  { value: "dry", label: "Dry" },
  { value: "oily", label: "Oily" },
  { value: "combination", label: "Combination" },
  { value: "normal", label: "Normal" },
];
const SENSITIVITY_OPTIONS: Sensitivity[] = ["none", "some", "high"];

const CHIP_ROW = { flexDirection: "row", flexWrap: "wrap", gap: 8 } as const;
// A chip's height (v7); `hitSlop` takes its target past 44.
const CHIP_HEIGHT = 38;

/**
 * Concerns: up to `MAX_CONCERNS`, plus "I don't have any concerns", which
 * clears them. `noneChosen` says whether that clearing was an answer, as
 * opposed to a question not yet touched — both are an empty list.
 */
export function ConcernPicker({
  concerns,
  noneChosen,
  onToggle,
  onNone,
}: {
  concerns: Concern[];
  noneChosen: boolean;
  onToggle: (concern: Concern) => void;
  onNone: () => void;
}) {
  const chosen = visibleConcernCount(concerns);
  const atLimit = chosen >= MAX_CONCERNS;
  return (
    <View style={{ gap: SPACE.block }}>
      <View style={CHIP_ROW}>
        {CONCERNS.map((concern) => {
          const selected = concerns.includes(concern);
          return (
            <ProfileChip
              key={concern}
              multiple
              label={CONCERN_TITLE[concern]}
              selected={selected}
              disabled={!selected && atLimit}
              onPress={() => onToggle(concern)}
            />
          );
        })}
      </View>
      <View style={CHIP_ROW}>
        <ProfileChip label="I don't have any concerns" role="button" selected={noneChosen && concerns.length === 0} onPress={onNone} />
      </View>
      <Text style={{ fontSize: TYPE.caption, color: MUTED }}>
        {atLimit ? `${MAX_CONCERNS} chosen. Untick one to swap.` : `Pick up to ${MAX_CONCERNS}. Tap Done when finished.`}
      </Text>
    </View>
  );
}

/**
 * One answer from a list, with "I don't know" as a real answer (`null`).
 * `unknownChosen` says whether that `null` was chosen, rather than unanswered.
 */
function SingleChoice<T extends string>({
  options,
  value,
  unknownChosen,
  onChange,
  unknownLabel,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  unknownChosen: boolean;
  onChange: (value: T | null) => void;
  /** Offers "I don't know" (or its wording) as a way to answer `null`. */
  unknownLabel?: string;
}) {
  return (
    <View style={CHIP_ROW}>
      {options.map((option) => (
        <ProfileChip key={option.value} label={option.label} selected={value === option.value} onPress={() => onChange(option.value)} />
      ))}
      {unknownLabel ? <ProfileChip label={unknownLabel} selected={value === null && unknownChosen} onPress={() => onChange(null)} /> : null}
    </View>
  );
}

export function SkinTypePicker(props: { value: BaseSkinType | null; unknownChosen: boolean; onChange: (value: BaseSkinType | null) => void }) {
  return <SingleChoice {...props} options={SKIN_TYPES} unknownLabel="I don't know" />;
}

export function SensitivityPicker(props: { value: Sensitivity | null; unknownChosen: boolean; onChange: (value: Sensitivity | null) => void }) {
  return (
    <SingleChoice {...props} options={SENSITIVITY_OPTIONS.map((value) => ({ value, label: sensitivityLabel(value) }))} unknownLabel="I don't know" />
  );
}

export function PregnancyPicker(props: { value: Pregnancy | null; onChange: (value: Pregnancy | null) => void }) {
  return (
    <SingleChoice
      {...props}
      value={props.value === null ? null : pregnancyOption(props.value)}
      unknownChosen={false}
      options={PREGNANCY_OPTIONS.map((value) => ({ value, label: pregnancyLabel(value) }))}
    />
  );
}

/**
 * One chip (v9): a 38pt pill, auto-width and wrap-flowed, since a section
 * holds a variable number of options (4 skin types, 8 concerns). A chosen
 * chip takes the pale sage fill and sage outline (`CHOSEN`); the rest a
 * hairline on white.
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
        height: CHIP_HEIGHT,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: CHIP_HEIGHT / 2,
        borderWidth: 1.5,
        borderColor: selected ? CHOSEN.border : LINE,
        backgroundColor: selected ? CHOSEN.fill : WHITE,
        opacity: disabled ? 0.45 : 1,
      }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: TYPE.label, color: selected ? CHOSEN.label : MUTED }}>{label}</Text>
    </Pressable>
  );
}
