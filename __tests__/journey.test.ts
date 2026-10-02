import { DECK_MAX, GOALS, JOURNEY_CARDS, PREGNANCY_LINE, cardHelps, cardRules, decodeNeed, deckFor, encodeNeed, needDeck, needFit, needProfile, planFit, type Need } from "@/lib/journey";
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

  it("ranks by the weight of the rules that work on the goal", () => {
    expect(keys(need("pimples"))).toEqual(["benzoyl", "retinoids", "bha", "azelaic", "calming"]);
    expect(keys(need("lines"))).toEqual(["retinoids", "bakuchiol", "peptides"]);
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
    expect(deck.find((d) => d.card.key === "calming")?.helps).toBe("Redness");
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
    expect(keys(need("pimples", { sensitivity: "high" }))).toEqual(["azelaic", "calming", "bakuchiol", "zinc-clay", "benzoyl"]);
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

  it("reads a Skin needs scan against that goal's cards", () => {
    const { fit, phrase } = needFit(["water", "salicylic acid", "glycerin"].map(ingredient), need("pimples"));
    expect(fit.covered.map((c) => c.card.key)).toEqual(["bha"]);
    expect(fit.total).toBe(5);
    expect(phrase).toBe("clear pimples");
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
