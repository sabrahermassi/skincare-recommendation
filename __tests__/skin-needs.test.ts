import { GOALS } from "@/lib/journey";
import {
  activeOf,
  activeRules,
  clashes,
  decodeAnswers,
  encodeAnswers,
  entryFor,
  hasStory,
  hiddenLine,
  holdsActive,
  inSentence,
  nextActiveDay,
  optionsFor,
  planAdd,
  prescriptionIn,
  spread,
  startNights,
  stepsIn,
  storyLength,
  weekRows,
  withAlternated,
  withSwapped,
  type NeedAnswers,
  type RoutineState,
  type StoryActive,
} from "@/lib/skin-needs";
import { ACTIVES, GOAL_OPTIONS, OPTIONS_MAX, type ActiveKey } from "@/lib/skin-needs-data";

const story = (key: ActiveKey) => activeOf(key) as StoryActive;
const GOAL_KEYS = GOALS.map((goal) => goal.key);
const answers = (over: Partial<NeedAnswers> = {}): NeedAnswers => ({ goal: "oil", sensitivity: "some", pregnancy: "no", uses: [], ...over });
const EMPTY: RoutineState = { entries: [], stepLimit: 4, started: false };

it("writes an active's name for the middle of a sentence", () => {
  expect(inSentence("BHA")).toBe("BHA");
  expect(inSentence("Vitamin C")).toBe("vitamin C");
  expect(inSentence("Benzoyl peroxide")).toBe("benzoyl peroxide");
});

describe("the data", () => {
  // Owner, 3 October 2026: the claims are checked against published sources only.
  it("cites only published papers and dermatology bodies for its claims", () => {
    const allowed = /^https:\/\/(pmc\.ncbi\.nlm\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov|www\.jabfm\.org|www\.aad\.org|mothertobaby\.org|health\.clevelandclinic\.org)\//;
    const sources = ACTIVES.flatMap((active) => Object.values(active.sources ?? {}).map((source) => ({ key: active.key, url: source.url, labelled: source.label.length > 0 })));
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) expect({ ...source, allowed: allowed.test(source.url) }).toEqual({ ...source, labelled: true, allowed: true });
  });

  it("gives every active the goal table names a story", () => {
    for (const goal of GOAL_KEYS) for (const key of GOAL_OPTIONS[goal].actives.flat()) expect({ goal, key, story: hasStory(activeOf(key)) }).toEqual({ goal, key, story: true });
  });

  it("matches every active on the result list to at least one scoring rule", () => {
    for (const active of ACTIVES.filter((a) => a.result)) expect({ key: active.key, rules: activeRules(active).length > 0 }).toEqual({ key: active.key, rules: true });
  });

  it("finds every story's own active in a product by its label names", () => {
    for (const active of ACTIVES.filter(hasStory)) {
      const first = (active.match ?? active.names)[0];
      const label = typeof first === "string" ? first : (active.names[0] ?? "");
      expect({ key: active.key, holds: holdsActive([{ name: label }], active) }).toEqual({ key: active.key, holds: true });
    }
  });

  it("does not take arbutin for ferulic acid, though one scoring rule covers both", () => {
    expect(holdsActive([{ name: "Alpha-Arbutin" }], activeOf("ferulic"))).toBe(false);
    expect(holdsActive([{ name: "Retinal" }], activeOf("retinoids"))).toBe(true);
  });

  it("names only actives that exist in every pairing to avoid", () => {
    const keys = new Set(ACTIVES.map((a) => a.key));
    for (const active of ACTIVES) for (const avoid of active.story?.avoid?.with ?? []) for (const key of avoid.actives) expect(keys.has(key)).toBe(true);
  });

  it("makes a story five cards when there is nothing to avoid, six otherwise", () => {
    expect(storyLength(story("bha"))).toBe(6);
    expect(storyLength(story("hydrating"))).toBe(5);
    expect(storyLength(story("ceramides"))).toBe(5);
  });
});

describe("optionsFor", () => {
  it("shows at most three for every goal and every answer", () => {
    for (const goal of GOAL_KEYS)
      for (const pregnancy of ["yes", "no", null] as const)
        for (const sensitivity of ["none", "high", null] as const) expect(optionsFor({ goal, pregnancy, sensitivity }).actives.length).toBeLessThanOrEqual(OPTIONS_MAX);
  });

  it("never shows one left out in pregnancy unless the answer is no", () => {
    for (const goal of GOAL_KEYS)
      for (const pregnancy of ["yes", "unsaid", null] as const) expect(optionsFor({ goal, pregnancy, sensitivity: null }).actives.every((active) => active.shownInPregnancy)).toBe(true);
  });

  it("follows the goal table's order when nothing is filtered", () => {
    expect(optionsFor({ goal: "oil", pregnancy: "no", sensitivity: "some" }).actives.map((a) => a.key)).toEqual(["bha", "niacinamide", "retinoids"]);
    expect(optionsFor({ goal: "texture", pregnancy: "no", sensitivity: "some" }).actives.map((a) => a.key)).toEqual(["aha", "bha", "retinoids"]);
  });

  // Owner, 3 October 2026, after research (AAD; Hughes 2013): sunscreen comes
  // before any active for lines and dark spots.
  it("puts SPF first for lines and dark spots, and second for red marks and dull skin", () => {
    const first = (goal: NeedAnswers["goal"]) => optionsFor({ goal, pregnancy: "no", sensitivity: "some" }).actives.map((a) => a.key);
    expect(first("lines")).toEqual(["spf", "retinoids", "peptides"]);
    expect(first("dark-marks")[0]).toBe("spf");
    expect(first("dark-spots")[0]).toBe("spf");
    expect(first("red-marks")[1]).toBe("spf");
    expect(first("dull")[1]).toBe("spf");
    // Safe in pregnancy: still first when the filter is on.
    expect(optionsFor({ goal: "lines", pregnancy: "yes", sensitivity: null }).actives[0].key).toBe("spf");
  });

  it("never adds SPF: it is a basic step, already in every routine", () => {
    expect(planAdd({ active: story("spf"), state: EMPTY, hasRoutine: false, ownProduct: null, answers: answers() })).toEqual({ kind: "owned", product: null });
  });

  it("swaps in one that is shown from the same family, and fills a gap from a nearby one, while pregnant", () => {
    const { actives, hidden } = optionsFor({ goal: "oil", pregnancy: "yes", sensitivity: null });
    // BHA becomes PHA; retinoids have none that is shown in their family, so azelaic acid fills the gap.
    expect(actives.map((a) => a.key)).toEqual(["pha", "niacinamide", "azelaic"]);
    expect(hiddenLine(hidden)).toBe("BHA and Retinoids are hidden while you're pregnant or breastfeeding. Check with your doctor or midwife before starting anything new.");
  });

  it("names as hidden only what the carousel would have shown, and says it in good English", () => {
    // Dark marks: retinoids sit past the first three places, so they hide nothing.
    expect(optionsFor({ goal: "dark-marks", pregnancy: "yes", sensitivity: null }).hidden).toEqual([]);
    expect(hiddenLine([activeOf("retinoids")])).toBe("Retinoids are hidden while you're pregnant or breastfeeding. Check with your doctor or midwife before starting anything new.");
    expect(hiddenLine([activeOf("bha")])).toBe("BHA is hidden while you're pregnant or breastfeeding. Check with your doctor or midwife before starting anything new.");
  });

  // Owner, 3 October 2026: each person needs a different active.
  it("gives very sensitive skin each family's gentlest", () => {
    expect(optionsFor({ goal: "oil", pregnancy: "no", sensitivity: "high" }).actives.map((a) => a.key)).toEqual(["pha", "niacinamide", "bakuchiol"]);
    expect(optionsFor({ goal: "dark-spots", pregnancy: "no", sensitivity: "high" }).actives.map((a) => a.key)).toEqual(["spf", "tranexamic", "niacinamide"]);
  });

  it("passes over an active they already use for another in its family", () => {
    expect(optionsFor({ goal: "dull", pregnancy: "no", sensitivity: "some", uses: ["vitamin-c"] }).actives[0].key).toBe("tranexamic");
    expect(optionsFor({ goal: "oil", pregnancy: "no", sensitivity: "some", uses: ["bha"] }).actives[0].key).toBe("pha");
  });

  it("gives the strongest first choice to skin that isn't very sensitive", () => {
    expect(optionsFor({ goal: "pimples", pregnancy: "no", sensitivity: "none" }).actives.map((a) => a.key)).toEqual(["bha", "benzoyl", "retinoids"]);
  });
});

describe("How often do I use it?", () => {
  it("starts BHA at two nights, one more when not sensitive, one fewer when very", () => {
    expect(startNights(story("bha"), "some")).toBe(2);
    expect(startNights(story("bha"), "none")).toBe(3);
    expect(startNights(story("bha"), "high")).toBe(1);
  });

  it("keeps a gentle one at every day, whatever the skin", () => {
    expect(startNights(story("niacinamide"), "high")).toBe(7);
  });

  it("spreads the nights out over the week", () => {
    expect(spread(2)).toEqual([0, 3]);
    expect(spread(3)).toEqual([0, 2, 4]);
    expect(weekRows(story("bha"), "some").map((row) => row.days)).toEqual([[0, 3], [0, 2, 4], [0, 2, 4, 6]]);
  });
});

describe("planAdd: the checks on Add", () => {
  const bha = story("bha");

  it("says it is already in when it was added, or a product of theirs holds it", () => {
    expect(planAdd({ active: bha, state: { ...EMPTY, entries: [entryFor(bha, "some")] }, hasRoutine: true, ownProduct: null, answers: answers() }).kind).toBe("owned");
    expect(planAdd({ active: bha, state: EMPTY, hasRoutine: true, ownProduct: "Clear Days Gel Cleanser", answers: answers() })).toEqual({ kind: "owned", product: "Clear Days Gel Cleanser" });
  });

  it("starts a routine when there is none", () => {
    expect(planAdd({ active: bha, state: EMPTY, hasRoutine: false, ownProduct: null, answers: answers() }).kind).toBe("start");
    expect(planAdd({ active: bha, state: { ...EMPTY, started: true }, hasRoutine: false, ownProduct: null, answers: answers() }).kind).toBe("add");
  });

  it("adds it straight in, in the evening, on its start days", () => {
    expect(planAdd({ active: bha, state: EMPTY, hasRoutine: true, ownProduct: null, answers: answers() })).toEqual({ kind: "add", entry: { active: "bha", time: "evening", days: [0, 3] } });
  });

  it("asks about a clash by sensitivity: quietly, alternate, or swap", () => {
    const state = { ...EMPTY, entries: [entryFor(story("retinoids"), "some")] };
    const level = (sensitivity: NeedAnswers["sensitivity"]) => {
      const plan = planAdd({ active: bha, state, hasRoutine: true, ownProduct: null, answers: answers({ sensitivity }) });
      return plan.kind === "clash" ? plan.level : plan.kind;
    };
    expect(level("none")).toBe("quiet");
    expect(level("some")).toBe("alternate");
    expect(level(null)).toBe("alternate");
    expect(level("high")).toBe("swap");
  });

  it("checks a clash against the actives they said they use, too", () => {
    const plan = planAdd({ active: bha, state: EMPTY, hasRoutine: true, ownProduct: null, answers: answers({ uses: ["retinoids"] }) });
    expect(plan).toMatchObject({ kind: "clash", with: "retinoids", inRoutine: false });
  });

  it("does not call two actives in different routines a clash", () => {
    const state = { ...EMPTY, entries: [{ active: "retinoids" as const, time: "morning" as const, days: [0, 3] }] };
    expect(planAdd({ active: bha, state, hasRoutine: true, ownProduct: null, answers: answers() }).kind).toBe("add");
  });

  it("offers swap or add when the step is taken, and suggests swap over the limit", () => {
    const azelaic = { active: "azelaic" as const, time: "evening" as const, days: [0, 2, 4] };
    const plan = planAdd({ active: story("niacinamide"), state: { ...EMPTY, entries: [{ ...azelaic, time: "morning" }] }, hasRoutine: true, ownProduct: null, answers: answers() });
    expect(plan).toMatchObject({ kind: "full", stepsNow: 4, stepsAfter: 5, suggest: "swap" });
    const roomy = planAdd({ active: story("niacinamide"), state: { entries: [{ ...azelaic, time: "morning" }], stepLimit: 5, started: false }, hasRoutine: true, ownProduct: null, answers: answers() });
    expect(roomy).toMatchObject({ kind: "full", suggest: "add" });
  });
});

describe("the routine's days", () => {
  it("alternates a clash onto other nights, with no night shared", () => {
    const retinoid = entryFor(story("retinoids"), "some");
    const next = withAlternated([retinoid], entryFor(story("bha"), "some"), "retinoids");
    const bha = next.find((entry) => entry.active === "bha")!;
    expect(bha.days.some((day) => retinoid.days.includes(day))).toBe(false);
    expect(bha.days).toHaveLength(2);
  });

  it("thins out an every-day active to make room for the other", () => {
    const daily = { active: "niacinamide" as const, time: "evening" as const, days: [0, 1, 2, 3, 4, 5, 6] };
    const next = withAlternated([daily], { active: "bha", time: "evening", days: [0, 3] }, "niacinamide");
    const [niacinamide, bha] = [next.find((e) => e.active === "niacinamide")!, next.find((e) => e.active === "bha")!];
    expect(bha.days.some((day) => niacinamide.days.includes(day))).toBe(false);
  });

  it("swaps one active for another", () => {
    expect(withSwapped([{ active: "azelaic", time: "evening", days: [0] }], "azelaic", { active: "bha", time: "evening", days: [0, 3] })).toEqual([{ active: "bha", time: "evening", days: [0, 3] }]);
  });

  it("counts steps on the busiest day", () => {
    expect(stepsIn([], "evening")).toBe(3);
    expect(stepsIn([{ active: "bha", time: "evening", days: [0, 3] }, { active: "retinoids", time: "evening", days: [1, 4] }], "evening")).toBe(4);
    expect(stepsIn([{ active: "bha", time: "evening", days: [0, 3] }, { active: "azelaic", time: "evening", days: [0] }], "evening")).toBe(5);
  });

  it("finds the next active night, a week round", () => {
    const entries = [{ active: "bha" as const, time: "evening" as const, days: [0, 3] }];
    expect(nextActiveDay(entries, "evening", 1)?.day).toBe(3);
    expect(nextActiveDay(entries, "evening", 5)?.day).toBe(0);
    expect(nextActiveDay(entries, "morning", 1)).toBeNull();
  });
});

describe("what a product holds", () => {
  it("counts an active above the trace stretch only", () => {
    const high = ["water", "salicylic acid", "glycerin"].map((name) => ({ name }));
    expect(holdsActive(high, activeOf("bha"))).toBe(true);
    const trace = [...Array.from({ length: 21 }, (_, i) => ({ name: `filler ${i}` })), { name: "salicylic acid" }];
    expect(holdsActive(trace, activeOf("bha"))).toBe(false);
  });

  it("calls adapalene prescription-only outside the US, and over the counter in it", () => {
    const gel = [{ name: "Water" }, { name: "Adapalene" }];
    expect(prescriptionIn(gel, "FR")?.name).toBe("adapalene");
    expect(prescriptionIn(gel, null)?.name).toBe("adapalene");
    expect(prescriptionIn(gel, "US")).toBeNull();
    expect(prescriptionIn([{ name: "Tretinoin" }], "US")).toMatchObject({ name: "tretinoin", alternative: "retinoids" });
    expect(prescriptionIn([{ name: "Retinol" }], "FR")).toBeNull();
    // A whole name: isotretinoin is not read as tretinoin.
    expect(prescriptionIn([{ name: "Isotretinoin" }], "US")?.name).toBe("isotretinoin");
  });

  it("tells BHA and retinoids apart as a clash, and not niacinamide and ceramides", () => {
    expect(clashes("bha", "retinoids")).toBe(true);
    expect(clashes("retinoids", "bha")).toBe(true);
    expect(clashes("ceramides", "hydrating")).toBe(false);
  });
});

describe("the answers in a link", () => {
  it("round-trips, and refuses anything else", () => {
    const sample = answers({ uses: ["retinoids", "bha"], pregnancy: "unsaid", sensitivity: null });
    expect(decodeAnswers(encodeAnswers(sample), GOAL_KEYS)).toEqual(sample);
    expect(decodeAnswers("nonsense.some.no.", GOAL_KEYS)).toBeNull();
    expect(decodeAnswers("oil.weird.maybe.retinoids+bogus", GOAL_KEYS)).toEqual({ goal: "oil", sensitivity: null, pregnancy: null, uses: ["retinoids"] });
  });
});
