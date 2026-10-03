import { cardKicker, cardPills, cardTitle, dayNumber, timeOfDay, tipFor, todayIn, type Today } from "@/lib/home-today";
import { assembleRoutine, basicRoutine } from "@/lib/routine-builder";
import type { RoutineEntry } from "@/lib/skin-needs";
import { EVENING_TIPS, GENERAL_TIPS, MORNING_TIPS, REST_NIGHT_TIP } from "@/lib/skin-tips";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/** Home's routine card and skincare tip (handoff_home_and_tip): the rules behind them. */

const at = (hour: number) => new Date(2026, 9, 5, hour, 0); // a Monday
const MONDAY = 0;
const today = (time: Today["time"], names: string[], actives: string[]): Today => ({
  time,
  steps: names.map((name) => ({ name, active: actives.includes(name) })),
  actives: actives.map((name) => ({ key: null, name })),
});

it("turns to the evening at 3 pm", () => {
  expect(timeOfDay(at(14))).toBe("morning");
  expect(timeOfDay(at(15))).toBe("evening");
});

describe("today's steps", () => {
  it("reads a story routine's active on its night, and a rest night as no step", () => {
    const entries: RoutineEntry[] = [{ active: "bha", time: "evening", days: [MONDAY] }];
    const monday = todayIn(basicRoutine(), "evening", MONDAY, entries);
    expect(monday.steps.map((step) => step.name)).toEqual(["First cleanse", "Cleanse", "BHA", "Moisturise"]);
    expect(monday.actives).toEqual([{ key: "bha", name: "BHA" }]);
    const tuesday = todayIn(basicRoutine(), "evening", 1, entries);
    expect(tuesday.steps.map((step) => step.name)).toEqual(["First cleanse", "Cleanse", "Moisturise"]);
    expect(tuesday.actives).toEqual([]);
  });

  it("names a skin profile's active by its short name", () => {
    const profile = { ...EMPTY_PROFILE, baseSkinType: "oily" as const, concerns: ["acne-prone" as const] };
    const evening = todayIn(assembleRoutine([], profile), "evening", MONDAY, []);
    expect(evening.actives).toHaveLength(1);
    expect(evening.steps.filter((step) => step.active).map((step) => step.name)).toEqual(evening.actives.map((active) => active.name));
    expect(evening.actives[0].key).not.toBeNull();
  });
});

describe("the card (TodayCards)", () => {
  it("says the time and the active", () => {
    const one = today("evening", ["Cleanse", "BHA", "Moisturise"], ["BHA"]);
    expect(cardTitle(one)).toBe("BHA night");
    expect(cardKicker(one)).toBe("Tonight · 3 steps");
    expect(cardTitle(today("morning", ["Cleanse", "Vitamin C", "SPF"], ["Vitamin C"]))).toBe("Vitamin C morning");
    expect(cardTitle(today("evening", ["Cleanse", "BHA", "Niacinamide", "Moisturise"], ["BHA", "Niacinamide"]))).toBe("BHA + Niacinamide");
    expect(cardTitle(today("morning", ["A", "B", "C", "D", "SPF"], ["B", "C", "D"]))).toBe("3 actives this morning");
    expect(cardTitle(today("evening", ["Cleanse", "Moisturise"], []))).toBe("Rest night");
    expect(cardTitle(today("morning", ["Cleanse", "SPF"], []))).toBe("Morning basics");
  });

  it("shows up to three steps in full, and folds the rest of a longer routine into +N", () => {
    expect(cardPills(today("evening", ["Cleanse", "BHA", "Moisturise"], ["BHA"]))).toEqual([
      { label: "Cleanse", active: false, arrow: false, grow: true },
      { label: "BHA", active: true, arrow: true, grow: true },
      { label: "Moisturise", active: false, arrow: true, grow: true },
    ]);
    const ten = ["Oil cleanse", "Cleanse", "Toner", "Essence", "BHA", "Ampoule", "Niacinamide", "Peptides", "Eye cream", "Moisturise"];
    expect(cardPills(today("evening", ten, ["BHA", "Niacinamide", "Peptides"])).map((pill) => pill.label)).toEqual(["BHA", "Niacinamide", "Peptides", "+7"]);
    // Long names give way to the "+N", which never shrinks.
    const long = cardPills(today("evening", ["Cleanse", "Copper peptides", "Tranexamic acid", "Azelaic acid", "Moisturise"], ["Copper peptides", "Tranexamic acid", "Azelaic acid"]));
    expect(long.map((pill) => [pill.label, pill.fold ?? false])).toEqual([["Copper peptides", false], ["Tranexamic acid", false], ["Azelaic acid", false], ["+2", true]]);
  });
});

describe("the skincare tip", () => {
  it("gives a general tip with no routine, a new one each day", () => {
    const tip = tipFor(at(9), null);
    expect(tip).toMatchObject({ kind: "general", line: "A quick one for your skin", label: "Skincare tip", next: "Next tip: tomorrow" });
    expect(GENERAL_TIPS).toContain(tip.tip);
    expect(tipFor(new Date(2026, 9, 6, 9), null).tip).not.toBe(tip.tip);
  });

  it("is about the SPF in the morning, until 3 pm", () => {
    const tip = tipFor(at(9), today("morning", ["Cleanse", "Vitamin C", "SPF"], ["Vitamin C"]));
    expect(tip).toMatchObject({ kind: "morning", line: "This morning: about your SPF", label: "This morning · SPF", next: "Next tip: tonight" });
    expect(MORNING_TIPS).toContain(tip.tip);
  });

  it("is about tonight's active in the evening, the next of two each night, or the rest night", () => {
    const one: Today = { time: "evening", steps: [], actives: [{ key: "bha", name: "BHA" }] };
    expect(tipFor(at(20), one)).toMatchObject({ kind: "evening", line: "Tonight: about your BHA night", label: "Tonight · BHA night", tip: EVENING_TIPS.bha, next: "Next tip: tomorrow morning" });
    const two: Today = { time: "evening", steps: [], actives: [{ key: "bha", name: "BHA" }, { key: "niacinamide", name: "Niacinamide" }] };
    const tonight = tipFor(at(20), two).line;
    const tomorrow = tipFor(new Date(2026, 9, 6, 20), two).line;
    expect(new Set([tonight, tomorrow])).toEqual(new Set(["Tonight: about your BHA night", "Tonight: about your niacinamide night"]));
    expect(tipFor(at(20), { time: "evening", steps: [], actives: [] })).toMatchObject({ line: "Tonight: about your rest night", tip: REST_NIGHT_TIP });
    // Mid-sentence a name loses its capital unless it is one like BHA.
    expect(tipFor(at(20), { time: "evening", steps: [], actives: [{ key: "azelaic", name: "Azelaic acid" }] }).line).toBe("Tonight: about your azelaic acid night");
  });

  it("keys a tip to its place in the day, so it is read once per morning and evening", () => {
    const morning = tipFor(at(9), today("morning", [], [])).id;
    const evening = tipFor(at(20), today("evening", [], [])).id;
    expect(morning).toBe(`${dayNumber(at(9))}:morning`);
    expect(evening).not.toBe(morning);
    // An active added in the evening brings a new tip, unread.
    const bha: Today = { time: "evening", steps: [], actives: [{ key: "bha", name: "BHA" }] };
    expect(tipFor(at(20), bha).id).not.toBe(evening);
  });
});
