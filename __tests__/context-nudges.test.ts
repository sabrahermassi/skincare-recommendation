import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { goalNudgesFor, nudgesFor } from "@/lib/context-nudges";
import { matchProduct, resetScoreCache } from "@/lib/matching";
import { EMPTY_PROFILE } from "@/store/useAppStore";

function ing(name: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides };
}

describe("nudgesFor", () => {
  it("adds the daytime-SPF nudge for an AHA", () => {
    const [nudge] = nudgesFor([ing("water"), ing("glycolic acid")]);
    expect(nudge).toMatchObject({ id: "photosensitising", label: "sunlight" });
    expect(nudge.text).toMatch(/^AHAs can leave skin more reactive to sunlight/);
  });

  it("adds it for a retinoid, including a prescription-only one", () => {
    expect(nudgesFor([ing("retinol")])[0].text).toMatch(/^Retinoids /);
    expect(nudgesFor([ing("tretinoin")])[0].text).toMatch(/^Retinoids /);
  });

  it("says it once, naming both, when a formula has an AHA and a retinoid", () => {
    const nudges = nudgesFor([ing("lactic acid"), ing("retinal")]);
    expect(nudges).toHaveLength(1);
    expect(nudges[0].text).toMatch(/^AHAs and retinoids /);
  });

  it("matches a label's casing and spacing, and an unrecognised name too", () => {
    expect(nudgesFor([ing(" Glycolic Acid ", { verified: false })])).toHaveLength(1);
  });

  it("adds nothing for a formula with neither", () => {
    expect(nudgesFor([ing("water"), ing("glycerin"), ing("niacinamide")])).toEqual([]);
  });

  // Telling someone holding a sunscreen to wear sunscreen is the one outcome
  // that makes the whole feature look careless (#234).
  it("never nudges a formula with a UV filter, read off the function tags", () => {
    expect(nudgesFor([ing("glycolic acid"), ing("zinc oxide", { functions: ["uv-filter"] })])).toEqual([]);
    expect(nudgesFor([ing("retinol"), ing("avobenzone", { functions: ["UV absorber"] })])).toEqual([]);
    expect(nudgesFor([ing("retinol"), ing("octinoxate", { functions: ["en:uv-filter"] })])).toEqual([]);
  });

  it("is deterministic — nothing reads the clock", () => {
    const ingredients = [ing("glycolic acid")];
    expect(nudgesFor(ingredients)).toEqual(nudgesFor(ingredients));
  });
});

describe("goalNudgesFor", () => {
  it("fires for a pigment-targeting active when the profile is working on dark spots", () => {
    const [nudge] = goalNudgesFor([ing("niacinamide")], ["hyperpigmentation"]);
    expect(nudge).toMatchObject({ id: "pigment-goal", label: "sunlight" });
  });

  it("does not fire without the dark-spots concern", () => {
    expect(goalNudgesFor([ing("niacinamide")], ["dehydrated"])).toEqual([]);
    expect(goalNudgesFor([ing("niacinamide")], [])).toEqual([]);
  });

  it("does not fire when nothing in the formula targets pigment", () => {
    expect(goalNudgesFor([ing("water"), ing("glycerin")], ["hyperpigmentation"])).toEqual([]);
  });

  it("stays quiet when the photosensitising nudge already said it — one SPF line per product", () => {
    const ingredients = [ing("glycolic acid")];
    expect(nudgesFor(ingredients)).toHaveLength(1);
    expect(goalNudgesFor(ingredients, ["hyperpigmentation"])).toEqual([]);
  });

  it("stays quiet on a formula with a UV filter", () => {
    expect(
      goalNudgesFor([ing("niacinamide"), ing("zinc oxide", { functions: ["uv-filter"] })], ["hyperpigmentation"])
    ).toEqual([]);
  });
});

describe("nudges and the score", () => {
  // Context, not a defect: detection is separate from scoring, so a nudge can
  // never move the score, verdict or breakdown (#234).
  it("leaves score, verdict and breakdown identical", () => {
    const product = {
      type: "serum",
      ingredients: [ing("water"), ing("glycolic acid"), ing("niacinamide"), ing("glycerin")],
    } as unknown as ProductWithIngredients;
    const profile: SkinProfile = { ...EMPTY_PROFILE, baseSkinType: "normal", concerns: ["hyperpigmentation"] };

    resetScoreCache();
    const before = matchProduct(product, profile);

    expect(nudgesFor(product.ingredients)).toHaveLength(1);
    goalNudgesFor(product.ingredients, profile.concerns);

    resetScoreCache();
    const after = matchProduct(product, profile);

    expect(after.score).toBe(before.score);
    expect(after.verdict).toBe(before.verdict);
    expect(after.breakdown).toEqual(before.breakdown);
    expect(after.warnings).toEqual(before.warnings);
  });
});
