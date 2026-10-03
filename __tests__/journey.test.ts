import { DECK_MAX, GOALS, JOURNEY_CARDS, PREGNANCY_LINE, cardHelps, cardRules, decodeNeed, deckFor, encodeNeed, needDeck, needProfile, needVerdict, planFit, type Need } from "@/lib/journey";
import type { Ingredient } from "@/data/types";

const ingredient = (name: string): Pick<Ingredient, "name"> => ({ name });
const NOT_PREGNANT = { pregnancyStatus: null };
const need = (goal: Need["goal"], rest: Partial<Need> = {}): Need => ({ goal, sensitivity: null, pregnant: null, ...rest });
const keys = (n: Need) => needDeck(n).map((d) => d.card.key);

describe("the cards", () => {
  it("each stand for at least one of the score's own rules", () => {
    for (const card of JOURNEY_CARDS) expect({ card: card.key, rules: cardRules(card).length > 0 }).toEqual({ card: card.key, rules: true });
  });
});

describe("a Skin needs deck", () => {
  it("gives every goal at least one card, and five at most", () => {
    for (const goal of GOALS) {
      const deck = needDeck(need(goal.key));
      expect({ goal: goal.key, some: deck.length > 0 }).toEqual({ goal: goal.key, some: true });
      expect(deck.length).toBeLessThanOrEqual(DECK_MAX);
      expect(deck[0].role).toBe("best");
    }
  });

  it("ranks the actives by the weight of the rules that work on the goal, then the support", () => {
    const deck = needDeck(need("pimples"));
    expect(deck.map((d) => d.card.key)).toEqual(["benzoyl", "retinoids", "bha", "azelaic", "calming"]);
    // Calming is support for pimples: shown last, said to be so, and not checked for.
    expect(deck.map((d) => d.counts)).toEqual([true, true, true, true, false]);
    expect(deck[4]).toMatchObject({ role: "helpful", helps: undefined });
    expect(keys(need("lines"))).toEqual(["retinoids", "bakuchiol", "peptides"]);
  });

  it("counts the support cards where the goal is hydration, the barrier, eczema-prone skin or redness", () => {
    for (const goal of ["hydrate", "barrier", "eczema", "redness"] as const) {
      const supports = needDeck(need(goal)).filter((d) => d.card.support && d.helps !== "Dry skin");
      expect({ goal, some: supports.length > 0, counted: supports.every((d) => d.counts) }).toEqual({ goal, some: true, counted: true });
    }
  });

  it("has a card left for every goal whatever the two optional answers are", () => {
    for (const goal of GOALS) {
      for (const sensitivity of [null, "none", "some", "high"] as const) {
        for (const pregnant of [null, true, false]) {
          const deck = needDeck({ goal: goal.key, sensitivity, pregnant });
          expect({ goal: goal.key, sensitivity, pregnant, counted: deck.some((d) => d.counts) }).toEqual({ goal: goal.key, sensitivity, pregnant, counted: true });
        }
      }
    }
  });

  it("tells the two kinds of post-acne mark apart", () => {
    // Red: only what also works on redness. Dark: what also works on dark spots.
    expect(keys(need("red-marks")).slice(0, 2)).toEqual(["niacinamide", "azelaic"]);
    expect(keys(need("red-marks"))).not.toContain("vitamin-c");
    expect(keys(need("dark-marks"))).toEqual(expect.arrayContaining(["tranexamic", "vitamin-c"]));
  });

  it("says what a card is on the deck for, including one that only helps something close", () => {
    const deck = needDeck(need("red-marks"));
    expect(deck.find((d) => d.card.key === "niacinamide")?.helps).toBe("Red marks");
    expect(deck.find((d) => d.card.key === "calming")).toMatchObject({ helps: "Redness", role: "helpful", counts: false });
  });

  it("drops the pregnancy-caution cards for someone pregnant or breastfeeding", () => {
    expect(keys(need("pimples", { pregnant: true }))).toEqual(expect.not.arrayContaining(["retinoids", "bha"]));
    expect(keys(need("lines", { pregnant: true }))).toEqual(["bakuchiol", "peptides"]);
  });

  it("keeps them, with the caution, when the question was left unanswered, and plain after a no", () => {
    const unanswered = needDeck(need("lines")).find((d) => d.card.key === "retinoids");
    expect(unanswered?.caution).toBe(PREGNANCY_LINE);
    expect(needDeck(need("lines", { pregnant: false })).find((d) => d.card.key === "retinoids")?.caution).toBeUndefined();
    expect(needDeck(need("lines")).find((d) => d.card.key === "bakuchiol")?.caution).toBeUndefined();
  });

  it("puts the gentle cards first for very sensitive skin", () => {
    expect(keys(need("pimples", { sensitivity: "high" }))).toEqual(["azelaic", "bakuchiol", "zinc-clay", "benzoyl", "calming"]);
    // Somewhat sensitive keeps the order; the strong cards already say to go slow.
    expect(keys(need("pimples", { sensitivity: "some" }))).toEqual(keys(need("pimples")));
  });
});

describe("the profile a Skin needs scan is scored with", () => {
  it("is the goal and the two answers, and nothing else", () => {
    expect(needProfile(need("pimples"))).toEqual({ concerns: ["acne-prone"], baseSkinType: null, sensitivity: null, pregnancyStatus: null });
    expect(needProfile(need("oil", { sensitivity: "high", pregnant: true }))).toEqual({ concerns: [], baseSkinType: "oily", sensitivity: "high", pregnancyStatus: "pregnant" });
    expect(needProfile(need("hydrate", { pregnant: false })).pregnancyStatus).toBe("neither");
  });

  it("reads a stinging barrier as sensitive skin unless told otherwise", () => {
    expect(needProfile(need("barrier")).sensitivity).toBe("some");
    expect(needProfile(need("barrier", { sensitivity: "none" })).sensitivity).toBe("none");
  });
});

describe("a skin profile's own plan", () => {
  it("is read against the four core cards only", () => {
    const deck = deckFor(["acne-prone", "post-acne-marks", "dullness"], NOT_PREGNANT);
    expect(deck.every((d) => d.card.core)).toBe(true);
    expect(deck[0]).toMatchObject({ card: { key: "azelaic" }, role: "best" });
  });

  it("always keeps the hydrating basics, as the foundation", () => {
    const deck = deckFor(["fine-lines"], NOT_PREGNANT);
    expect(deck.find((d) => d.card.key === "hydrating")?.role).toBe("foundation");
  });

  it("drops a card that helps none of the chosen concerns", () => {
    expect(deckFor(["dehydrated"], NOT_PREGNANT).map((d) => d.card.key)).toEqual(["hydrating"]);
  });

  it("leaves retinoids out while pregnant or breastfeeding", () => {
    for (const pregnancyStatus of ["pregnant", "breastfeeding"] as const) {
      expect(deckFor(["fine-lines", "acne-prone"], { pregnancyStatus }).map((d) => d.card.key)).not.toContain("retinoids");
    }
    expect(deckFor(["fine-lines"], NOT_PREGNANT).map((d) => d.card.key)).toContain("retinoids");
  });

  it("ticks only what the score's own rules say a card helps", () => {
    const niacinamide = deckFor(["acne-prone", "post-acne-marks"], NOT_PREGNANT).find((d) => d.card.key === "niacinamide");
    expect(niacinamide && cardHelps(niacinamide.card).has("post-acne-marks")).toBe(true);
    expect(niacinamide && cardHelps(niacinamide.card).has("acne-prone")).toBe(false);
  });
});

describe("how a product fits the plan", () => {
  const concerns = ["post-acne-marks", "dehydrated"] as const;
  const deck = deckFor([...concerns], NOT_PREGNANT);

  it("counts each card the product has an ingredient for", () => {
    const fit = planFit(["water", "niacinamide", "glycerin"].map(ingredient), deck, [...concerns]);
    expect(fit.covered.map((c) => c.card.key)).toEqual(["niacinamide", "hydrating"]);
    expect(fit.total).toBe(deck.length);
    expect(fit.notCovered).toEqual([]);
  });

  it("names the concerns nothing in it covers", () => {
    const fit = planFit(["water", "glycerin"].map(ingredient), deck, [...concerns]);
    expect(fit.notCovered).toEqual(["post-acne-marks"]);
  });
});

it("carries a need through a route param, ignoring anything that isn't one", () => {
  const full = need("dark-marks", { sensitivity: "high", pregnant: false });
  expect(decodeNeed(encodeNeed(full))).toEqual(full);
  expect(decodeNeed(encodeNeed(need("oil")))).toEqual(need("oil"));
  expect(decodeNeed("pimples.extreme.maybe")).toEqual(need("pimples"));
  expect(decodeNeed("not-a-goal.high.yes")).toBeNull();
  expect(decodeNeed(undefined)).toBeNull();
});

// A scan opened from Skin needs (owner, 2 October 2026): not the skin match,
// which called a dark-spot serum "80, good match" for pimples because nothing
// in it clogs pores. Only an active for what was picked counts.
describe("the answer for a scan from Skin needs", () => {
  const label = (...names: string[]) => names.map(ingredient);
  // The serum that showed the problem: actives for dark spots, support for everything, nothing for pimples.
  const DARK_SPOT_SERUM = label("water", "glycerin", "niacinamide", "tranexamic acid", "panthenol", "allantoin", "ceramide np");

  it("says a product with no active for the goal is not made for it, however kind it is to skin", () => {
    const verdict = needVerdict(DARK_SPOT_SERUM, need("pimples"));
    expect(verdict.level).toBe("none");
    expect(verdict.headline).toBe("Not made for pimples");
    expect(verdict.line).toBe("It has none of the actives we suggest to clear pimples.");
    expect(verdict.actives).toEqual([]);
    // What the carousel showed for this pick, pregnancy skipped (owner, 3 October 2026): BHA becomes PHA, retinoids give way to azelaic acid.
    expect(verdict.missing).toEqual(["PHA", "Benzoyl peroxide", "Azelaic acid"]);
  });

  it("says what such a product is better for, from its actives only", () => {
    const { betterFor } = needVerdict(DARK_SPOT_SERUM, need("pimples"));
    // Dark marks and uneven tone are met by the very same two actives, so only the first is said.
    expect(betterFor.map((b) => b.label)).toEqual(["Fade dark marks", "Unclog pores"]);
    expect(betterFor[0].ingredients).toEqual(["niacinamide", "tranexamic acid"]);
    // Never "better for dry skin" on the strength of glycerin.
    expect(needVerdict(label("water", "glycerin", "ceramide np"), need("pimples")).betterFor).toEqual([]);
  });

  it("names support once, without counting it", () => {
    // Nothing among the serum's support works on pimples by the rules, so none is named for it.
    expect(needVerdict(DARK_SPOT_SERUM, need("pimples")).helpful).toEqual([]);
    const withCentella = needVerdict(label("water", "centella asiatica extract"), need("pimples"));
    expect(withCentella).toMatchObject({ level: "none", helpful: ["centella asiatica extract"] });
  });

  it("works on the goal when it has one of its strong actives", () => {
    const verdict = needVerdict(label("water", "salicylic acid", "glycerin"), need("pimples", { pregnant: false }));
    expect(verdict).toMatchObject({ level: "works", headline: "Works on pimples", line: "It has 1 of the 3 actives we suggest to clear pimples.", betterFor: [] });
    expect(verdict.actives.map((a) => a.card?.key)).toEqual(["bha"]);
    expect(needVerdict(DARK_SPOT_SERUM, need("dark-marks")).level).toBe("works");
  });

  it("helps a little when its only active for the goal is a mild one", () => {
    const verdict = needVerdict(label("water", "tea tree oil"), need("pimples"));
    expect(verdict).toMatchObject({ level: "little", headline: "Helps a little with pimples", line: "It has an active for this, though not one of our top picks." });
    expect(verdict.actives).toEqual([expect.objectContaining({ card: null, ingredients: ["tea tree oil"] })]);
  });

  it("counts hydration as the active where hydration is the goal", () => {
    expect(needVerdict(label("water", "glycerin", "sodium hyaluronate"), need("hydrate")).level).toBe("works");
    expect(needVerdict(label("water", "ceramide np", "cholesterol"), need("barrier")).level).toBe("works");
    expect(needVerdict(label("water", "glycerin"), need("lines")).level).toBe("none");
  });

  it("checks the hand-picked cards for texture, which no rule is tagged for", () => {
    expect(needVerdict(label("water", "glycolic acid"), need("texture"))).toMatchObject({ level: "works", headline: "Works on rough texture" });
    expect(needVerdict(label("water", "niacinamide"), need("texture")).level).toBe("none");
  });

  it("checks for the actives the carousel showed, so a pregnancy drops retinoids from what was looked for", () => {
    expect(needVerdict(label("water"), need("lines", { pregnant: true })).missing).toEqual(["SPF", "Peptides", "Green tea"]);
  });

  // Owner, 3 October 2026: the story calls SPF step one for lines, so a sunscreen scanned from there must not be "not made for" them.
  it("counts an active the carousel showed even where no scoring rule credits it for the goal", () => {
    const sunscreen = needVerdict(label("water", "zinc oxide", "glycerin"), need("lines"));
    expect(sunscreen).toMatchObject({ level: "works", headline: "Works on lines and wrinkles", line: "It has 1 of the 3 actives we suggest to smooth fine lines." });
    expect(sunscreen.actives).toEqual([expect.objectContaining({ card: null, ingredients: ["zinc oxide"], line: "(SPF): it sends back the rays that mark and age skin." })]);
  });

  it("lets an active near the end of the list help a little at most", () => {
    const base = Array.from({ length: 24 }, (_, i) => `filler ${i}`);
    const high = needVerdict(label("water", "salicylic acid", ...base), need("pimples"));
    const trace = needVerdict(label("water", ...base, "salicylic acid"), need("pimples"));
    expect(high).toMatchObject({ level: "works", actives: [expect.objectContaining({ trace: false })] });
    expect(trace).toMatchObject({ level: "little", headline: "Helps a little with pimples", actives: [expect.objectContaining({ trace: true })] });
  });

  it("only helps a little with a pores pick when a strong pore-clogger is in it too", () => {
    const verdict = needVerdict(label("water", "salicylic acid", "isopropyl palmitate"), need("pimples", { pregnant: false }));
    expect(verdict).toMatchObject({ level: "little", clogged: true, line: "It has 1 of the 3 actives we suggest to clear pimples. It also has an ingredient that can clog pores." });
    // Pores are not the point of dark marks, so the same clogger changes nothing there.
    expect(needVerdict(label("water", "niacinamide", "isopropyl palmitate"), need("dark-marks"))).toMatchObject({ level: "works", clogged: false });
    // And with no active at all it is simply not made for it.
    expect(needVerdict(label("water", "isopropyl palmitate"), need("pimples"))).toMatchObject({ level: "none", clogged: false });
  });

  it("measures against the actives shown to this person: bakuchiol works for very sensitive skin, which was shown it", () => {
    const bakuchiol = label("water", "bakuchiol");
    expect(needVerdict(bakuchiol, need("lines", { pregnant: false })).level).toBe("little");
    expect(needVerdict(bakuchiol, need("lines", { pregnant: false, sensitivity: "high" }))).toMatchObject({ level: "works", line: "It has 1 of the 3 actives we suggest to smooth fine lines." });
  });
});
