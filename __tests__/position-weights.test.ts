import type { Ingredient, SkinProfile } from "@/data/types";
import { matchProduct } from "@/lib/matching";
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
