import type { Ingredient, Sensitivity } from "@/data/types";
import type { GoalKey } from "@/lib/journey";
import { positionWeightLabel } from "@/lib/matching";
import { INGREDIENT_RULES, nameMatches, ruleMatches, type IngredientRule, type RuleSource } from "@/lib/rules";
import { ACTIVES, FAMILIES, GOAL_OPTIONS, OPTIONS_MAX, PRESCRIPTION, type Active, type ActiveKey, type Family, type Story, type TimeOfDay } from "@/lib/skin-needs-data";

/**
 * Skin needs, the logic (design_handoff "october 3d"): which actives a goal
 * shows, how an active's story reads for these answers, and what "Add to my
 * routine" does. The advice itself is data, in `lib/skin-needs-data.ts`.
 *
 * It stands apart from the skin profile (owner): the answers are asked fresh
 * every visit, and nothing is read from or written to the profile.
 */

/** The answers on the questions screen. The optional ones are `null` when skipped. */
export type NeedAnswers = {
  goal: GoalKey;
  sensitivity: Sensitivity | null;
  /** "unsaid" is "Prefer not to say". */
  pregnancy: "yes" | "no" | "unsaid" | null;
  /** "Actives you already use". */
  uses: ActiveKey[];
};

const BY_KEY = new Map(ACTIVES.map((active) => [active.key, active]));

export function activeOf(key: ActiveKey): Active {
  return BY_KEY.get(key)!;
}

/** The active a route param names, or `undefined`: nothing in a link is taken on trust. */
export function findActive(param: string | string[] | undefined): Active | undefined {
  const raw = Array.isArray(param) ? param[0] : param;
  return raw ? BY_KEY.get(raw as ActiveKey) : undefined;
}

export function familyOf(active: Active): Family {
  return FAMILIES[active.family];
}

/** "BHA" stays as it is in a sentence; "Vitamin C" becomes "vitamin C". */
export function inSentence(name: string): string {
  return /^[A-Z]{2,}/.test(name) ? name : `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

/** An active with its story: the ones the carousel can show. */
export type StoryActive = Active & { story: Story };

export function hasStory(active: Active): active is StoryActive {
  return active.story !== undefined;
}

/** Skipped counts as somewhat sensitive (hand-off): a slow start and gentle warnings. */
export function sensitivityOf(answers: Pick<NeedAnswers, "sensitivity">): Sensitivity {
  return answers.sensitivity ?? "some";
}

/** Skipped and "Prefer not to say" count as yes (hand-off): only the safe ones show. */
export function safeOnly(answers: Pick<NeedAnswers, "pregnancy">): boolean {
  return answers.pregnancy !== "no";
}

export type Options = {
  /** Best first; the first is the "Best first pick". */
  actives: StoryActive[];
  /** Those the pregnancy filter took away, for the line that says what is hidden. */
  hidden: StoryActive[];
};

/**
 * The carousel for these answers. Each place on the goal's list is one
 * active, or a family's actives in the order the goal prefers them, and each
 * person gets the one that suits them (owner, 3 October 2026):
 *
 * - unsafe ones are left out when pregnancy is anything but "no";
 * - one they already use is passed over for another in the family;
 * - very sensitive skin gets the family's gentlest;
 * - otherwise the goal's first choice.
 *
 * Where the pregnancy filter takes away a place's first choice, it is named
 * as hidden, and a safe one from a nearby family fills a gap (owner). Very
 * sensitive skin sees the gentlest places first. Three at most.
 */
export function optionsFor(answers: Pick<NeedAnswers, "goal" | "sensitivity" | "pregnancy"> & { uses?: readonly ActiveKey[] }): Options {
  const table = GOAL_OPTIONS[answers.goal];
  const safe = safeOnly(answers);
  const uses = answers.uses ?? [];
  // Hidden: what the carousel would show if they weren't pregnant, and now doesn't.
  // A place past the first three would never be shown, so it hides nothing.
  const hidden = safe ? optionsFor({ ...answers, pregnancy: "no" }).actives.filter((active) => !active.pregnancySafe) : [];
  let actives: StoryActive[] = [];
  for (const place of table.actives) {
    const candidates = (Array.isArray(place) ? place : [place]).map(activeOf).filter(hasStory);
    const allowed = candidates.filter((active) => !(safe && !active.pregnancySafe));
    const fresh = allowed.filter((active) => !uses.includes(active.key));
    const pool = fresh.length > 0 ? fresh : allowed;
    const choice = answers.sensitivity === "high" ? pool.reduce<StoryActive | undefined>((best, active) => (!best || active.gentleness < best.gentleness ? active : best), undefined) : pool[0];
    if (choice && !actives.includes(choice)) actives.push(choice);
  }
  if (hidden.length > 0 && table.safeBackup && !actives.some((active) => active.key === table.safeBackup)) {
    const backup = activeOf(table.safeBackup);
    if (hasStory(backup)) actives.push(backup);
  }
  // A stable sort: equally gentle ones keep the goal's order.
  if (answers.sensitivity === "high") actives = [...actives].sort((a, b) => a.gentleness - b.gentleness);
  return { actives: actives.slice(0, OPTIONS_MAX), hidden };
}

/** "Retinoids and BHA are hidden while you're pregnant or breastfeeding." */
export function hiddenLine(hidden: readonly Active[]): string | null {
  if (hidden.length === 0) return null;
  const names = hidden.map((active) => active.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  // One name can still be many: "Retinoids are hidden", "BHA is hidden".
  const many = names.length > 1 || names[0].endsWith("s");
  return `${list} ${many ? "are" : "is"} hidden while you're pregnant or breastfeeding.`;
}

/** The story's cards: six, or five when the active has nothing to avoid. */
export function storyLength(active: StoryActive): number {
  return active.story.avoid ? 6 : 5;
}

/** "6 quick cards · 40 sec". */
export function storyLengthLine(active: StoryActive): string {
  const cards = storyLength(active);
  return `${cards} quick cards · ${cards === 6 ? 40 : 35} sec`;
}

// ── How often should I use it? ──────────────────────────────────────────────────────────────

/** Monday first. */
export const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Today, Monday as 0. */
export function today(now: Date = new Date()): number {
  return (now.getDay() + 6) % 7;
}

// Which days of the week n nights fall on, spread out: two is Monday and
// Thursday, three is Monday, Wednesday and Friday.
const SPREAD: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 2, 4, 6],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export function spread(nights: number): number[] {
  return SPREAD[Math.max(1, Math.min(7, Math.round(nights)))];
}

/** How many nights a week to start on: a gentle one is every day; otherwise sensitivity moves the plan's first number. */
export function startNights(active: StoryActive, sensitivity: Sensitivity): number {
  const { first, then } = active.story.start;
  if (first >= 7) return 7;
  if (sensitivity === "none") return Math.min(first + 1, then);
  if (sensitivity === "high") return Math.max(1, first - 1);
  return first;
}

const TIMES_A_WEEK = ["", "Once a week", "Twice a week", "Three times a week", "Four times a week", "Five times a week", "Six times a week"];

/** The line under "How often should I use it?". */
export function startLine(nights: number): string {
  return nights >= 7 ? "Every day, from the start. It's a gentle one." : `${TIMES_A_WEEK[nights]} first. More only if it feels fine.`;
}

/** The note at the bottom of "How often should I use it?". */
export function sensitivityNote(answers: Pick<NeedAnswers, "sensitivity">, nights: number): string {
  if (nights >= 7) return answers.sensitivity === null ? "Gentle enough for most skin, every day." : "Gentle enough for your skin, every day.";
  switch (answers.sensitivity) {
    case "none":
      return "Your skin isn't sensitive, so you can start a little faster.";
    case "some":
      return "Your skin is somewhat sensitive, so give it time.";
    case "high":
      return "Your skin is very sensitive, so give it time.";
    default:
      return "If your skin is sensitive, give it time.";
  }
}

export type WeekRow = { label: string; days: number[]; later?: boolean };

/** The calendar on "How often should I use it?": weeks one and two, three and four, and later. */
export function weekRows(active: StoryActive, sensitivity: Sensitivity): WeekRow[] {
  const first = startNights(active, sensitivity);
  const then = Math.max(first, active.story.start.then);
  const later = Math.max(then, active.story.start.later);
  return [
    { label: "Week 1–2", days: spread(first) },
    { label: "Week 3–4", days: spread(then) },
    { label: "Later", days: spread(later), later: true },
  ];
}

// ── What a product holds ────────────────────────────────────────────────────

/** The rules whose ingredients count as this active. */
export function activeRules(active: Active): IngredientRule[] {
  return INGREDIENT_RULES.filter((rule) => active.names.some((name) => ruleMatches(rule, name)));
}

/** Where to read about it: its first rule with a source. */
export function evidenceFor(active: Active): RuleSource | null {
  return active.evidence ?? activeRules(active).find((rule) => rule.source)?.source ?? null;
}

/**
 * Whether a label holds this active high enough to count: one of its own
 * label names (`match`, or `names`), above the stretch a label calls a trace.
 */
export function holdsActive(ingredients: readonly Pick<Ingredient, "name">[], active: Active): boolean {
  const patterns = active.match ?? active.names;
  return ingredients.some(({ name }, index) => positionWeightLabel(index) !== "trace" && nameMatches(patterns, name));
}

/**
 * A prescription-only active in a product, or `null`. Adapalene is sold over
 * the counter in the US: it counts only where the phone's region is not the
 * US, or is not known.
 */
export function prescriptionIn(ingredients: readonly Pick<Ingredient, "name">[], region: string | null): (typeof PRESCRIPTION)[number] | null {
  const names = ingredients.map(({ name }) => name.toLowerCase());
  // A whole word: "isotretinoin" is its own entry, not tretinoin.
  return PRESCRIPTION.find((entry) => !(entry.overTheCounterInUS && region === "US") && names.some((name) => new RegExp(`(^|[^a-z])${entry.name}($|[^a-z])`).test(name))) ?? null;
}

// ── The routine ─────────────────────────────────────────────────────────────

/** An active someone added to their routine from a story: the routine (morning or evening) and its days. */
export type RoutineEntry = { active: ActiveKey; time: TimeOfDay; days: number[] };

export type StepLimit = 3 | 4 | 5;
export const STEP_LIMITS: readonly StepLimit[] = [3, 4, 5];
export const DEFAULT_STEP_LIMIT: StepLimit = 4;

/** The routine as Skin needs sees it. `started` is a routine begun from a story, with no skin profile behind it. */
export type RoutineState = { entries: RoutineEntry[]; stepLimit: StepLimit; started: boolean };

/** Cleanse, moisturise and SPF in the morning; first cleanse, cleanse and moisturise in the evening. Never swapped. */
const BASIC_STEPS = 3;

/** How many steps a routine has on its busiest day. */
export function stepsIn(entries: readonly RoutineEntry[], time: TimeOfDay): number {
  const onTime = entries.filter((entry) => entry.time === time);
  const busiest = Math.max(0, ...[0, 1, 2, 3, 4, 5, 6].map((day) => onTime.filter((entry) => entry.days.includes(day)).length));
  return BASIC_STEPS + busiest;
}

/** Whether two actives should not share a routine: either one's "Avoid pairing with" names the other. */
export function clashes(a: ActiveKey, b: ActiveKey): boolean {
  const avoids = (x: ActiveKey, y: ActiveKey) => activeOf(x).story?.avoid?.with.some((entry) => entry.actives.includes(y)) ?? false;
  return a !== b && (avoids(a, b) || avoids(b, a));
}

/** The time an active goes in: the time its story says to start in. */
function timeFor(active: StoryActive): TimeOfDay {
  return active.story.time.best;
}

/** A new entry for an active, on the days its start plan gives this skin. */
export function entryFor(active: StoryActive, sensitivity: Sensitivity): RoutineEntry {
  return { active: active.key, time: timeFor(active), days: spread(startNights(active, sensitivity)) };
}

/** What tapping "Add … to my routine" leads to. */
export type AddPlan =
  /** It is already in: an added active, or a product of their own that holds it. */
  | { kind: "owned"; product: string | null }
  /** No routine yet: "Let's start your routine". */
  | { kind: "start" }
  /** It clashes with an active in the routine, or one they said they use. */
  | { kind: "clash"; with: ActiveKey; inRoutine: boolean; level: "quiet" | "alternate" | "swap"; entry: RoutineEntry }
  /** Its step is taken: "Swap or add a step?". */
  | { kind: "full"; taken: RoutineEntry; entry: RoutineEntry; stepsNow: number; stepsAfter: number; suggest: "swap" | "add" }
  /** Straight in. */
  | { kind: "add"; entry: RoutineEntry };

/**
 * The checks on Add, in the hand-off's order: already in the routine, then a
 * clash, then the step. "No routine yet" comes before the clash, so a routine
 * begun from here is checked like any other. `hasRoutine` is whether there is
 * a routine without this: one built by opening it with a skin profile (a
 * skin profile alone is not one, owner 3 October 2026), or one started earlier.
 */
export function planAdd({
  active,
  state,
  hasRoutine,
  ownProduct,
  answers,
}: {
  active: StoryActive;
  state: RoutineState;
  hasRoutine: boolean;
  /** The name of a product of their own in the routine that holds it, if one does. */
  ownProduct: string | null;
  answers: Pick<NeedAnswers, "sensitivity" | "uses">;
}): AddPlan {
  if (state.entries.some((entry) => entry.active === active.key) || ownProduct || active.basic) return { kind: "owned", product: ownProduct };
  if (!hasRoutine && !state.started && state.entries.length === 0) return { kind: "start" };
  const sensitivity = sensitivityOf(answers);
  const entry = entryFor(active, sensitivity);

  const inRoutine = state.entries.find((other) => other.time === entry.time && clashes(other.active, active.key));
  const used = answers.uses.find((other) => clashes(other, active.key));
  const against = inRoutine?.active ?? used;
  if (against) {
    const level = sensitivity === "none" ? "quiet" : sensitivity === "high" ? "swap" : "alternate";
    return { kind: "clash", with: against, inRoutine: inRoutine !== undefined, level, entry };
  }

  const taken = state.entries.find((other) => other.time === entry.time && other.days.some((day) => entry.days.includes(day)));
  if (taken) {
    const stepsNow = stepsIn(state.entries, entry.time);
    const stepsAfter = stepsIn([...state.entries, entry], entry.time);
    return { kind: "full", taken, entry, stepsNow, stepsAfter, suggest: stepsAfter > state.stepLimit ? "swap" : "add" };
  }
  return { kind: "add", entry };
}

/** The entries with a new one added. */
export function withAdded(entries: readonly RoutineEntry[], entry: RoutineEntry): RoutineEntry[] {
  return [...entries.filter((other) => other.active !== entry.active), entry];
}

/** The entries with `out` taken out and `entry` in its place. */
export function withSwapped(entries: readonly RoutineEntry[], out: ActiveKey, entry: RoutineEntry): RoutineEntry[] {
  return [...entries.filter((other) => other.active !== out && other.active !== entry.active), entry];
}

/**
 * The entries with `entry` added on other days than `other`, the active it
 * clashes with (hand-off: "different nights, a rest night between"). Its
 * pattern moves along the week until no day is shared; where `other` leaves
 * too few days free, `other` drops to every other day first. `other` may not
 * be in the routine at all (an active they said they use): then the new one
 * keeps its own days.
 */
export function withAlternated(entries: readonly RoutineEntry[], entry: RoutineEntry, other: ActiveKey): RoutineEntry[] {
  const existing = entries.find((candidate) => candidate.active === other && candidate.time === entry.time);
  if (!existing) return withAdded(entries, entry);
  const nights = entry.days.length;
  let otherDays = existing.days;
  if (7 - otherDays.length < nights) otherDays = otherDays.filter((_, index) => index % 2 === 0);
  const free = [0, 1, 2, 3, 4, 5, 6].filter((day) => !otherDays.includes(day));
  let days: number[] | null = null;
  for (let shift = 0; shift < 7 && !days; shift++) {
    const moved = entry.days.map((day) => (day + shift) % 7).sort((a, b) => a - b);
    if (moved.every((day) => free.includes(day))) days = moved;
  }
  const placed = { ...entry, days: days ?? free.slice(0, nights) };
  return withAdded(
    entries.map((candidate) => (candidate === existing ? { ...existing, days: otherDays } : candidate)),
    placed,
  );
}

/** "Mon · Thu". */
export function daysLabel(days: readonly number[]): string {
  return days.length === 7 ? "every day" : days.map((day) => DAY_SHORT[day]).join(" · ");
}

/** Where an entry sits, for the toast: "Evening, after cleansing". */
export function placeLine(entry: RoutineEntry): string {
  return `${entry.time === "morning" ? "Morning" : "Evening"}, after cleansing`;
}

/** The actives on a day of one routine. */
export function activesOn(entries: readonly RoutineEntry[], time: TimeOfDay, day: number): RoutineEntry[] {
  return entries.filter((entry) => entry.time === time && entry.days.includes(day));
}

/** The next day after `day` (a week round) that this routine has any active on, or `null`. */
export function nextActiveDay(entries: readonly RoutineEntry[], time: TimeOfDay, day: number): { day: number; entry: RoutineEntry } | null {
  for (let step = 1; step <= 7; step++) {
    const next = (day + step) % 7;
    const [entry] = activesOn(entries, time, next);
    if (entry) return { day: next, entry };
  }
  return null;
}

// ── Passing the answers on ──────────────────────────────────────────────────

const SENSITIVITIES: readonly Sensitivity[] = ["none", "some", "high"];
const PREGNANCY = ["yes", "no", "unsaid"] as const;

/** The answers as one route param, for the story: "oil.some.no.retinoids+bha". */
export function encodeAnswers(answers: NeedAnswers): string {
  return [answers.goal, answers.sensitivity ?? "", answers.pregnancy ?? "", answers.uses.join("+")].join(".");
}

/** `null` for anything that isn't a set of answers: nothing else in a link is taken on trust. */
export function decodeAnswers(param: string | string[] | undefined, goals: readonly GoalKey[]): NeedAnswers | null {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw) return null;
  const [goal, sensitivity, pregnancy, uses = ""] = raw.split(".");
  if (!goals.includes(goal as GoalKey)) return null;
  return {
    goal: goal as GoalKey,
    sensitivity: SENSITIVITIES.find((s) => s === sensitivity) ?? null,
    pregnancy: PREGNANCY.find((p) => p === pregnancy) ?? null,
    uses: uses.split("+").filter((key): key is ActiveKey => BY_KEY.has(key as ActiveKey)),
  };
}

/** The answers as the scan-from-Skin-needs check reads them (`lib/journey.ts`, `needVerdict`): skipped and "Prefer not to say" stay unanswered there. */
export function needFrom(answers: NeedAnswers): { goal: GoalKey; sensitivity: Sensitivity | null; pregnant: boolean | null; uses: readonly ActiveKey[] } {
  return { goal: answers.goal, sensitivity: answers.sensitivity, pregnant: answers.pregnancy === "yes" ? true : answers.pregnancy === "no" ? false : null, uses: answers.uses };
}
