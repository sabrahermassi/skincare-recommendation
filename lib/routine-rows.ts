import { activeStepKey, pickHolding, type Routine, type RoutineSlot, type TimeOfDay } from "@/lib/routine-builder";
import { activeOf, activesOn, DAY_NAMES, hasStory, nextActiveDay, type RoutineEntry, type StoryActive } from "@/lib/skin-needs";

// The day's routine as the routine screen lays it out, and as Home's routine card reads it.

/** One row of the routine: a step as the builder made it, an active added from Skin needs on this day, or a rest night between two. */
export type Row = { key: string; slot: RoutineSlot; added?: StoryActive; note?: string; rest?: boolean };

/**
 * The day's steps (design_handoff "october 3d", R1–R3). The basics are the
 * same every day; only the active step changes. With actives added from Skin
 * needs, it shows the day's ("Tonight's active"), or a rest night and when
 * the next one is; a morning with one says not to skip the sunscreen.
 * Without any, the builder's own step stands.
 */
export function rowsFor(routine: Routine, time: TimeOfDay, day: number, entries: readonly RoutineEntry[]): Row[] {
  const activeKey = activeStepKey(time);
  const timed = entries.filter((entry) => entry.time === time);
  const today = activesOn(entries, time, day)
    .map((entry) => activeOf(entry.active))
    .filter(hasStory);
  return routine[time].flatMap((slot): Row[] => {
    if (slot.key === "sunscreen" && today.length > 0) {
      return [{ key: slot.key, slot: { ...slot, label: "Sunscreen · don’t skip" }, note: `SPF 50 keeps ${today.map((active) => active.name).join(" and ")} working.` }];
    }
    if (slot.key !== activeKey || timed.length === 0) return [{ key: slot.key, slot }];
    if (today.length === 0) {
      const next = nextActiveDay(entries, time, day);
      const name = next ? activeOf(next.entry.active).name : "";
      return [
        {
          key: slot.key,
          slot: { ...slot, label: time === "evening" ? "Rest night" : "Rest morning", active: null, pick: null },
          note: next ? `No active ${time === "evening" ? "tonight" : "this morning"}. Next ${name}: ${DAY_NAMES[next.day]}.` : undefined,
          rest: true,
        },
      ];
    }
    return today.map((active) => ({
      key: `${slot.key}-${active.key}`,
      slot: {
        ...slot,
        label: time === "evening" ? "Tonight’s active" : "Today’s active",
        active: { name: active.name, why: capitalised(active.story.shopping.routine), alternatives: [], caution: null },
        pick: pickHolding(routine, time, active),
      },
      added: active,
    }));
  });
}

function capitalised(line: string): string {
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
}

