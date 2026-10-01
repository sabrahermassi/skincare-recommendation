import { cardHelps, decodeConcerns, deckFor, encodeConcerns, planFit } from "@/lib/journey";
import type { Ingredient } from "@/data/types";

const ingredient = (name: string): Pick<Ingredient, "name"> => ({ name });
const NOT_PREGNANT = { pregnancyStatus: null };

describe("the journey's deck", () => {
  it("leads with the card that helps the most chosen concerns", () => {
    const deck = deckFor(["acne-prone", "post-acne-marks"], NOT_PREGNANT);
    expect(deck[0]).toMatchObject({ card: { key: "azelaic" }, role: "best" });
  });

  it("always keeps the hydrating basics, as the foundation", () => {
    const deck = deckFor(["fine-lines"], NOT_PREGNANT);
    expect(deck.find((d) => d.card.key === "hydrating")?.role).toBe("foundation");
  });

  it("drops a card that helps none of the chosen concerns", () => {
    const keys = deckFor(["dehydrated"], NOT_PREGNANT).map((d) => d.card.key);
    expect(keys).toEqual(["hydrating"]);
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

it("carries the concerns through a route param, ignoring anything else in it", () => {
  expect(decodeConcerns(encodeConcerns(["acne-prone", "dehydrated"]))).toEqual(["acne-prone", "dehydrated"]);
  expect(decodeConcerns("acne-prone,not-a-concern,dullness,redness,fine-lines")).toEqual(["acne-prone", "dullness", "redness"]);
  expect(decodeConcerns(undefined)).toEqual([]);
});
