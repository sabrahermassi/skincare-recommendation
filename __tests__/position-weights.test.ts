import type { Ingredient, SkinProfile } from "@/data/types";
import { matchProduct, positionNote } from "@/lib/matching";
import { MIN_ALPHABETICAL_RUN, positionWeight, positionWeights } from "@/lib/rules";

const curve = (n: number) => Array.from({ length: n }, (_, i) => positionWeight(i));
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

// Unsorted on purpose: no accidental A-to-Z run.
const DESCENDING = ["water", "glycerin", "niacinamide", "butylene glycol", "dimethicone", "tocopherol", "allantoin", "phenoxyethanol"];
const ALPHABETICAL_TAIL = ["carbomer", "disodium edta", "hydroxypropyl methylcellulose", "laureth-4", "sodium hydroxide", "water"];

describe("positionWeights", () => {
  it("keeps the concentration curve for a list that runs most to least", () => {
    expect(positionWeights(DESCENDING)).toEqual(curve(DESCENDING.length));
  });

  it("flattens an A-to-Z tail and leaves the actives in front on the curve", () => {
    const names = ["zinc oxide", "octinoxate", ...ALPHABETICAL_TAIL];
    const weights = positionWeights(names);
    expect(weights.slice(0, 2)).toEqual(curve(2));

    const run = weights.slice(2);
    expect(new Set(run).size).toBe(1);
    // The expected weight of an ingredient whose place in this stretch is arbitrary.
    expect(run[0]).toBeCloseTo(mean(curve(names.length).slice(2)), 10);
  });

  it("never flattens position 0, even when the whole list happens to be sorted", () => {
    const names = ["benzoyl peroxide", ...ALPHABETICAL_TAIL];
    const weights = positionWeights(names);
    expect(weights[0]).toBe(positionWeight(0));
    expect(new Set(weights.slice(1)).size).toBe(1);
  });

  it("ignores a sorted run shorter than the minimum", () => {
    const names = ["water", "glycerin", "niacinamide", "zinc oxide", "allantoin", "bisabolol", "carbomer", "dimethicone", "edta"];
    // Tail "allantoin".."edta" is 5 long: below MIN_ALPHABETICAL_RUN.
    expect(MIN_ALPHABETICAL_RUN).toBeGreaterThan(5);
    expect(positionWeights(names)).toEqual(curve(names.length));
  });

  it("compares case- and whitespace-insensitively", () => {
    const shouted = ["Zinc Oxide", ...ALPHABETICAL_TAIL.map((name, i) => (i % 2 ? ` ${name.toUpperCase()} ` : name))];
    expect(new Set(positionWeights(shouted).slice(1)).size).toBe(1);
  });

  it("handles empty and single-item lists", () => {
    expect(positionWeights([])).toEqual([]);
    expect(positionWeights(["water"])).toEqual([1]);
  });
});

describe("positionNote", () => {
  it("names the position on a list that runs most to least", () => {
    expect(positionNote(DESCENDING, 4)).toBe("#5 of 8 on the label - significant");
    expect(positionNote(DESCENDING, 0)).toBe("#1 of 8 on the label - high concentration");
  });

  it("says nothing for a position inside an alphabetical tail, where order is not concentration", () => {
    const names = ["zinc oxide", "octinoxate", ...ALPHABETICAL_TAIL];
    expect(positionNote(names, 1)).toBe("#2 of 8 on the label - high concentration");
    expect(positionNote(names, 2)).toBeNull();
    expect(positionNote(names, names.length - 1)).toBeNull();
  });

  it("says nothing for an ingredient that is not on the list", () => {
    expect(positionNote(DESCENDING, -1)).toBeNull();
    expect(positionNote(DESCENDING, DESCENDING.length)).toBeNull();
  });
});

describe("matchProduct on an alphabetical label", () => {
  const ing = (name: string): Ingredient => ({
    id: name, name, comedogenic: 0, safety: "safe", verified: true, functions: [],
  });
  const reactive: SkinProfile = {
    concerns: ["acne-prone"], baseSkinType: "dry", sensitivity: "high", pregnancyStatus: "neither",
  };
  const penalty = (names: string[]) =>
    matchProduct({ type: "sunscreen", ingredients: names.map(ing) }, reactive).breakdown.irritationPenalty;

  it("does not charge an active as a main ingredient just because it sorts early", () => {
    const fillers = ["butylene glycol", "caprylyl glycol", "dimethicone", "glycerin", "tocopherol", "water"];
    // Same ingredients, same active at index 1. Sorted, "ascorbic acid" is only early
    // because of its spelling; unsorted, index 1 really is the second-largest ingredient.
    const alphabetical = ["zinc oxide", "ascorbic acid", ...fillers];
    const ordered = ["zinc oxide", "ascorbic acid", "water", "glycerin", "dimethicone", "tocopherol", "butylene glycol", "caprylyl glycol"];
    expect(penalty(alphabetical)).toBeLessThan(penalty(ordered));
  });
});
