import type { Routine, TimeOfDay } from "@/lib/routine-builder";
import { rowsFor } from "@/lib/routine-rows";
import { inSentence, type RoutineEntry } from "@/lib/skin-needs";
import { ACTIVES, type ActiveKey } from "@/lib/skin-needs-data";
import { EVENING_FALLBACK, EVENING_TIPS, GENERAL_TIPS, MORNING_TIPS, REST_NIGHT_TIP, type Tip } from "@/lib/skin-tips";

/**
 * Home's routine card and its skincare tip (handoff_home_and_tip): what today
 * holds, worked out from the routine the routine screen shows, so the two
 * never disagree (owner, 3 October 2026).
 */

/** The evening starts at 3 pm (hand-off): the card turns to tonight, and the tip to the evening one. */
export const EVENING_FROM_HOUR = 15;

export function timeOfDay(now: Date): TimeOfDay {
  return now.getHours() >= EVENING_FROM_HOUR ? "evening" : "morning";
}

/** The local calendar day as a count that goes up by one each day: which tip of a list is today's. */
export function dayNumber(now: Date): number {
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
}

/** One step of today's routine, as its pill names it. */
type TodayStep = { name: string; active: boolean };

/** Today's routine for one time of day: its steps, and the actives among them in order. */
export type Today = { time: TimeOfDay; steps: TodayStep[]; actives: { key: ActiveKey | null; name: string }[] };

/** The pill names of the basic steps (hand-off: "Cleanse", "Moisturise", "SPF"). */
const STEP_NAME: Record<string, string> = {
  "first-cleanse": "First cleanse",
  cleanse: "Cleanse",
  serum: "Serum",
  treatment: "Treatment",
  moisturise: "Moisturise",
  sunscreen: "SPF",
};

/** The active a skin profile's routine names on its step ("Salicylic acid" is BHA). */
function activeNamed(name: string) {
  return ACTIVES.find((active) => active.name === name || active.result?.name === name) ?? null;
}

/** Today's steps, from the same rows the routine screen lays out. A rest night is not a step. */
export function todayIn(routine: Routine, time: TimeOfDay, day: number, entries: readonly RoutineEntry[]): Today {
  const steps: TodayStep[] = [];
  const actives: Today["actives"] = [];
  for (const row of rowsFor(routine, time, day, entries)) {
    if (row.rest) continue;
    const record = row.added ?? (row.slot.active ? activeNamed(row.slot.active.name) : null);
    const name = record?.name ?? row.slot.active?.name ?? null;
    if (name) {
      steps.push({ name, active: true });
      actives.push({ key: record?.key ?? null, name });
    } else {
      steps.push({ name: STEP_NAME[row.slot.key] ?? row.slot.label, active: false });
    }
  }
  return { time, steps, actives };
}

/** The card's big line (hand-off): "BHA night", "BHA + Niacinamide", "3 actives tonight"; with none, "Rest night" or "Morning basics" (owner). */
export function cardTitle(today: Today): string {
  const evening = today.time === "evening";
  const [first, second] = today.actives;
  if (!first) return evening ? "Rest night" : "Morning basics";
  if (!second) return `${first.name} ${evening ? "night" : "morning"}`;
  if (today.actives.length === 2) return `${first.name} + ${second.name}`;
  return `${today.actives.length} actives ${evening ? "tonight" : "this morning"}`;
}

/** The line under the card's title: "Tonight · 3 steps". */
export function cardKicker(today: Today): string {
  const count = today.steps.length;
  return `${today.time === "evening" ? "Tonight" : "This morning"} · ${count} ${count === 1 ? "step" : "steps"}`;
}

/**
 * A pill on the card. Up to three steps fill the row, an arrow between each
 * (`grow`); more, and only the actives show, the rest folded into one "+N"
 * (hand-off, `TodayCards`). With no active to show, every step does.
 * `fold` is that "+N": it never shrinks, so long names give way to it.
 */
export type Pill = { label: string; active: boolean; arrow: boolean; grow: boolean; fold?: boolean };

export function cardPills(today: Today): Pill[] {
  const { steps } = today;
  if (steps.length <= 3) return steps.map((step, i) => ({ label: step.name, active: step.active, arrow: i > 0, grow: true }));
  const actives = steps.filter((step) => step.active);
  if (actives.length === 0) return steps.map((step) => ({ label: step.name, active: false, arrow: false, grow: false }));
  return [
    ...actives.map((step) => ({ label: step.name, active: true, arrow: false, grow: false })),
    { label: `+${steps.length - actives.length}`, active: false, arrow: false, grow: false, fold: true },
  ];
}

/**
 * Which tip the envelope holds (hand-off): with a routine, the morning one
 * until 3 pm (about the SPF) and the evening one after (about tonight's
 * active, the next of two or more each night, or the rest night); without
 * one, a general tip. `id` is this tip's place in the day, so "Tip read"
 * lasts until the next one.
 */
export type HomeTip = {
  id: string;
  kind: "morning" | "evening" | "general";
  /** On the note, above the tip: "Tonight · BHA night". */
  label: string;
  /** Under "Skincare tip" on Home: "Tonight: about your BHA night". */
  line: string;
  tip: Tip;
  /** Under "Tip read ✓": when the next one comes. */
  next: string;
};

export function tipFor(now: Date, today: Today | null): HomeTip {
  const day = dayNumber(now);
  if (!today) {
    return { id: `${day}:general`, kind: "general", label: "Skincare tip", line: "A quick one for your skin", tip: GENERAL_TIPS[day % GENERAL_TIPS.length], next: "Next tip: tomorrow" };
  }
  if (today.time === "morning") {
    return { id: `${day}:morning`, kind: "morning", label: "This morning · SPF", line: "This morning: about your SPF", tip: MORNING_TIPS[day % MORNING_TIPS.length], next: "Next tip: tonight" };
  }
  const evening = { kind: "evening" as const, next: "Next tip: tomorrow morning" };
  if (today.actives.length === 0) return { ...evening, id: `${day}:evening:rest`, label: "Tonight · Rest night", line: "Tonight: about your rest night", tip: REST_NIGHT_TIP };
  // Two or more tonight: the first one, then the next one the next night (owner).
  const active = today.actives[day % today.actives.length];
  return {
    ...evening,
    // Its topic too: an active added in the evening brings a new tip, unread.
    id: `${day}:evening:${active.key ?? active.name}`,
    label: `Tonight · ${active.name} night`,
    line: `Tonight: about your ${inSentence(active.name)} night`,
    tip: (active.key && EVENING_TIPS[active.key]) || EVENING_FALLBACK,
  };
}
