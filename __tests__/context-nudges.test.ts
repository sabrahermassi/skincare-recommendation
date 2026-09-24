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

  // #186 moved retinyl retinoate out of RETINOID_NAMES onto its own scoring
  // rule; it's still a retinoid, so it must not quietly lose the nudge.
  it("still adds it for retinyl retinoate, now on its own scoring rule", () => {
    expect(nudgesFor([ing("retinyl retinoate")])[0].text).toMatch(/^Retinoids /);
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
  it("never nudges a formula with a UV filter it reads off a CosIng tag, in any spelling", () => {
    // A filter on no name list, so only the tag can be what recognises it.
    const filter = (tag: string) => ing("tris-biphenyl triazine", { functions: [tag] });
    expect(nudgesFor([ing("glycolic acid"), filter("uv-filter")])).toEqual([]);
    expect(nudgesFor([ing("retinol"), filter("en:uv-filter")])).toEqual([]);
  });

  // #262 review (Codex): CosIng also tags photostabilisers "uv-absorber" —
  // additives that protect a formula's other ingredients from light, not the
  // wearer's skin. Benzotriazolyl Dodecyl P-Cresol carries only this tag and
  // is used at 0.01-0.1%, far below anything that filters UV for a person.
  it("does not take a bare uv-absorber tag as proof of sun protection", () => {
    const photostabiliser = ing("benzotriazolyl dodecyl p-cresol", { functions: ["uv-absorber"] });
    expect(nudgesFor([ing("retinol"), photostabiliser])).toHaveLength(1);
  });

  // #262 review: an unresolved label photo arrives as stubs with no
  // `functions` at all, so an organic filter's own name has to count — every
  // spelling the app knows, including the classifier's own list.
  it("never nudges a sunscreen whose names didn't resolve — recognised by filter name", () => {
    const stub = (name: string) => ing(name, { verified: false, functions: undefined });
    expect(nudgesFor([stub("retinol"), stub("butyl methoxydibenzoylmethane")])).toEqual([]); // EU INCI
    expect(nudgesFor([stub("retinol"), stub("avobenzone")])).toEqual([]); // US drug name
    expect(nudgesFor([stub("glycolic acid"), stub("padimate o")])).toEqual([]);
    expect(nudgesFor([stub("glycolic acid"), stub("sulisobenzone")])).toEqual([]);
  });

  // #262 review: both are pigments as often as filters. A retinoid foundation
  // or an AHA clay mask with titanium dioxide still gets its nudge — by name
  // or by CosIng's unconditional uv-filter tag — once it sits deep in the
  // list, where pigment use typically does.
  it("does not take a titanium dioxide or zinc oxide deep in the list as proof of a sunscreen", () => {
    const deepTitanium = [
      ing("water"),
      ing("glycerin"),
      ing("dimethicone"),
      ing("niacinamide"),
      ing("phenoxyethanol"),
      ing("titanium dioxide", { functions: ["uv-filter", "colorant"] }),
      ing("retinol"),
    ];
    expect(nudgesFor(deepTitanium)).toHaveLength(1);

    const deepZinc = [
      ing("water"),
      ing("glycerin"),
      ing("dimethicone"),
      ing("niacinamide"),
      ing("phenoxyethanol"),
      ing("zinc oxide", { verified: false, functions: undefined }),
      ing("glycolic acid"),
    ];
    expect(nudgesFor(deepZinc)).toHaveLength(1);
  });

  // #262 review, Codex: a photographed read never has a product type to fall
  // back on (#214), so a mineral-only sunscreen needs another signal. Real
  // mineral sunscreens use 5-25% titanium dioxide/zinc oxide — high enough to
  // sit near the top of a list printed in concentration order — while pigment
  // use is usually a smaller share further down.
  it("takes a titanium dioxide or zinc oxide near the top of the list as evidence of a sunscreen", () => {
    expect(
      nudgesFor([ing("water"), ing("titanium dioxide", { functions: ["uv-filter", "colorant"] }), ing("retinol")])
    ).toEqual([]);
    expect(nudgesFor([ing("zinc oxide", { verified: false, functions: undefined }), ing("glycolic acid")])).toEqual(
      []
    );
  });

  it("treats a product typed sunscreen as sun protection — the one signal a deep-list mineral-only sunscreen has", () => {
    const deepZinc = [
      ing("water"),
      ing("glycerin"),
      ing("dimethicone"),
      ing("niacinamide"),
      ing("phenoxyethanol"),
      ing("zinc oxide"),
      ing("glycolic acid"),
    ];
    expect(nudgesFor(deepZinc, "sunscreen")).toEqual([]);
    expect(nudgesFor(deepZinc, "serum")).toHaveLength(1);
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

  it("stays quiet on sun protection — an organic filter, or a product typed sunscreen", () => {
    expect(goalNudgesFor([ing("niacinamide"), ing("octocrylene")], ["hyperpigmentation"])).toEqual([]);
    expect(goalNudgesFor([ing("niacinamide"), ing("zinc oxide")], ["hyperpigmentation"], "sunscreen")).toEqual([]);
  });

  it("stays quiet on a sunscreen whose names didn't resolve (#262 review)", () => {
    const stub = (name: string) => ing(name, { verified: false, functions: undefined });
    expect(goalNudgesFor([stub("niacinamide"), stub("octocrylene")], ["hyperpigmentation"])).toEqual([]);
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
