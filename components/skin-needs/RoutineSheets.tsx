import { Image } from "expo-image";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { BottomSheet } from "@/components/BottomSheet";
import { CloseCross, IconCircle } from "@/components/IconCircle";
import { BUTTON_HEIGHT } from "@/components/PrimaryButton";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { Hand, SwapIcon } from "@/components/skin-needs/bits";
import { Text } from "@/components/Text";
import { haptic } from "@/lib/haptics";
import { activeOf, DAY_LETTERS, DEFAULT_STEP_LIMIT, familyOf, inSentence, STEP_LIMITS, type StepLimit } from "@/lib/skin-needs";
import type { ActiveKey } from "@/lib/skin-needs-data";
import { BUTTON, DISPLAY_FONT, INK, MUTED, MUTED_FAINT, SKIN_NEEDS, STONE, WHITE, TYPE, RADIUS, SPACE } from "@/lib/tokens";

/**
 * The sheets over the last story card when Add needs a choice (hand-off 7b,
 * 7c, C2, C3). Floating, drawn over the story rather than in a window of their
 * own, so a button that opens another screen opens it at once.
 */

/** How an active is named inside a sentence: "a retinoid", "an AHA", "vitamin C". */
function namedInLine(key: ActiveKey): string {
  if (key === "retinoids") return "a retinoid";
  if (key === "aha") return "an AHA";
  if (key === "bha") return "a BHA";
  const name = activeOf(key).name;
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

/** "your retinoid", "your vitamin C". */
export function yours(key: ActiveKey): string {
  return `your ${key === "retinoids" ? "retinoid" : namedInLine(key).replace(/^an? /, "")}`;
}

function Sheet({ visible, onClose, closable = true, title, line, children }: { visible: boolean; onClose: () => void; closable?: boolean; title: string; line: string; children: ReactNode }) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      floating
      inline
      corner={
        closable ? (
          <IconCircle onPress={onClose} accessibilityLabel="Close">
            <CloseCross />
          </IconCircle>
        ) : undefined
      }
    >
      <View style={{ alignItems: "center", gap: SPACE.block, paddingTop: 2, paddingHorizontal: 6 }}>
        <Text accessibilityRole="header" style={{ paddingHorizontal: closable ? 40 : 0, textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
          {title}
        </Text>
        <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{line}</Text>
        {children}
      </View>
    </BottomSheet>
  );
}

/** Two buttons side by side: the one we recommend filled, the other pale sage. */
function Pair({ first, second }: { first: { label: string; onPress: () => void }; second: { label: string; onPress: () => void } }) {
  return (
    <View style={{ marginTop: 4, flexDirection: "row", gap: SPACE.block, justifyContent: "center" }}>
      <SheetButton label={first.label} onPress={first.onPress} filled />
      <SheetButton label={second.label} onPress={second.onPress} />
    </View>
  );
}

function SheetButton({ label, onPress, filled = false, wide = false }: { label: string; onPress: () => void; filled?: boolean; wide?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: wide ? 220 : 140, height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: filled ? BUTTON.primary.fill : SKIN_NEEDS.sage, alignItems: "center", justifyContent: "center" }}
      className="active:opacity-85"
    >
      <Text style={{ fontSize: 16, fontWeight: "600", color: filled ? WHITE : SKIN_NEEDS.chosenInk }}>{label}</Text>
    </Pressable>
  );
}

/** One active on a sheet: its family's picture, its name and a badge or a line under it. */
function ActiveTile({ active, badge, line, isNew = false }: { active: ActiveKey; badge?: string; line?: ReactNode; isNew?: boolean }) {
  const record = activeOf(active);
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: STONE, borderRadius: RADIUS.card, padding: SPACE.block, alignItems: "center", gap: 6 }}>
      <Image source={familyOf(record).picture} contentFit="contain" accessibilityLabel="" style={{ width: 56, height: 54 }} />
      <Text numberOfLines={2} style={{ fontSize: TYPE.body, fontWeight: "600", textAlign: "center", color: INK }}>
        {record.name}
      </Text>
      {badge ? (
        <View style={{ height: 22, paddingHorizontal: SPACE.text, borderRadius: 11, backgroundColor: isNew ? SKIN_NEEDS.family[record.family] : WHITE, justifyContent: "center" }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: isNew ? SKIN_NEEDS.stepInk : MUTED }}>{badge}</Text>
        </View>
      ) : null}
      {line}
    </View>
  );
}

// ── 7b · Swap or add a step? ────────────────────────────────────────────────

export function SwapOrAddSheet({
  visible,
  onClose,
  taken,
  active,
  time,
  stepsNow,
  stepsAfter,
  suggest,
  gentler,
  onSwap,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  taken: ActiveKey;
  active: ActiveKey;
  time: "morning" | "evening";
  stepsNow: number;
  stepsAfter: number;
  suggest: "swap" | "add";
  /** The new one is gentler than the one it would replace, and the skin is sensitive: said as the reason to swap. */
  gentler: boolean;
  onSwap: () => void;
  onAdd: () => void;
}) {
  const takenName = activeOf(taken).name;
  const step = time === "morning" ? 2 : 3;
  const why = suggest === "swap" ? (gentler ? "we'd swap: easier on sensitive skin" : `we'd swap: it stays at ${stepsNow} steps`) : "we'd add: there's room for it";
  const swap = { label: "Swap", onPress: onSwap };
  const add = { label: "Add a step", onPress: onAdd };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closable={false}
      title="Swap or add a step?"
      line={`Your ${time} active step already has ${inSentence(takenName)}. Your routine has ${stepsNow} steps.`}
    >
      <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: SPACE.text }}>
        <ActiveTile
          active={taken}
          badge="In your routine"
          line={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <TimeGlyph time={time} />
              <Text style={{ fontSize: 12, color: MUTED_FAINT }}>Step {step}</Text>
            </View>
          }
        />
        <SwapIcon color={MUTED_FAINT} />
        <ActiveTile active={active} badge="New" isNew line={<Text style={{ fontSize: 12, color: MUTED_FAINT }}>{activeOf(active).sub}</Text>} />
      </View>
      <Hand size={18} says>
        {why}
      </Hand>
      <Pair first={suggest === "swap" ? swap : add} second={suggest === "swap" ? add : swap} />
      <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>Adding makes it {stepsAfter} steps.</Text>
    </Sheet>
  );
}

function TimeGlyph({ time }: { time: "morning" | "evening" }) {
  return time === "evening" ? (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill={SKIN_NEEDS.evening.fill} />
    </Svg>
  ) : (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" fill={SKIN_NEEDS.morning.sunFill} />
    </Svg>
  );
}

// ── 7c · Let's start your routine ───────────────────────────────────────────

export function StartRoutineSheet({ visible, onClose, active, onStart }: { visible: boolean; onClose: () => void; active: ActiveKey; onStart: (limit: StepLimit) => void }) {
  const [limit, setLimit] = useState<StepLimit>(DEFAULT_STEP_LIMIT);
  return (
    <Sheet visible={visible} onClose={onClose} title="Let's start your routine" line={`We'll add the basics around ${activeOf(active).name}: cleanse, moisturise and SPF.`}>
      <View style={{ alignSelf: "stretch", gap: SPACE.text, marginTop: 4 }}>
        <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>How many steps feel right?</Text>
        <SegmentedSwitch
          tone="light"
          options={STEP_LIMITS.map((value) => ({ value: String(value), label: String(value) }))}
          selected={String(limit)}
          onSelect={(value) => setLimit(Number(value) as StepLimit)}
        />
        <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>Per routine. You can change it later.</Text>
      </View>
      <View style={{ marginTop: SPACE.text }}>
        <SheetButton label="Start my routine" onPress={() => onStart(limit)} filled wide />
      </View>
    </Sheet>
  );
}

// ── C2 · You already use … (somewhat sensitive) ─────────────────────────────

export function AlternateSheet({
  visible,
  onClose,
  active,
  other,
  otherDays,
  newDays,
  onAlternate,
  onSwap,
}: {
  visible: boolean;
  onClose: () => void;
  active: ActiveKey;
  other: ActiveKey;
  otherDays: number[];
  newDays: number[];
  onAlternate: () => void;
  onSwap: () => void;
}) {
  const rows = [
    { name: other === "retinoids" ? "Retinoid" : activeOf(other).name, days: otherDays, colour: SKIN_NEEDS.mauve },
    { name: activeOf(active).name, days: newDays, colour: SKIN_NEEDS.amber },
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title={`You already use ${namedInLine(other)}`} line="Together they can be too much for your skin. Use them on different nights.">
      <View style={{ alignSelf: "stretch", backgroundColor: STONE, borderRadius: RADIUS.card, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter, gap: SPACE.text }}>
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: 76 }} />
          {DAY_LETTERS.map((letter, day) => (
            <Text key={day} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", color: MUTED_FAINT }}>
              {letter}
            </Text>
          ))}
        </View>
        {rows.map((row) => (
          <View key={row.name} style={{ flexDirection: "row", alignItems: "center", height: 28 }}>
            <Text numberOfLines={1} style={{ width: 76, fontSize: TYPE.caption, fontWeight: "600", color: INK }}>
              {row.name}
            </Text>
            {DAY_LETTERS.map((_, day) => (
              <View key={day} style={{ flex: 1, alignItems: "center" }}>
                {row.days.includes(day) ? <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: row.colour }} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: SKIN_NEEDS.line }} />}
              </View>
            ))}
          </View>
        ))}
      </View>
      <Hand size={18} says>
        we recommend alternating
      </Hand>
      <Pair first={{ label: "Alternate", onPress: onAlternate }} second={{ label: "Swap", onPress: onSwap }} />
    </Sheet>
  );
}

// ── C3 · One at a time is kinder (very sensitive) ───────────────────────────

export function OneAtATimeSheet({ visible, onClose, active, other, inRoutine, onSwap, onNotNow }: { visible: boolean; onClose: () => void; active: ActiveKey; other: ActiveKey; inRoutine: boolean; onSwap: () => void; onNotNow: () => void }) {
  const name = activeOf(active).name;
  return (
    <Sheet visible={visible} onClose={onClose} title="One at a time is kinder" line={`Your skin is very sensitive. Swap ${yours(other)} for ${name}, or keep it and save ${name} for later.`}>
      <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: SPACE.text }}>
        <ActiveTile active={other} line={<Text style={{ fontSize: 12, color: MUTED_FAINT }}>{inRoutine ? "In your routine" : "You use it"}</Text>} />
        <SwapIcon color={MUTED_FAINT} />
        <ActiveTile active={active} line={<Text style={{ fontSize: 12, color: MUTED_FAINT }}>New</Text>} />
      </View>
      <Hand size={18} says>
        we recommend swapping
      </Hand>
      <Pair first={{ label: "Swap", onPress: onSwap }} second={{ label: "Not now", onPress: onNotNow }} />
    </Sheet>
  );
}
