import type { Ingredient, ProductType, ProductWithIngredients, SkinProfile } from "@/data/types";
import { SCORE_BANDS } from "@/lib/matching";
import { activeLine, buildRoutine, PICKS_PER_STEP, placesLabel, routinePlacesFor } from "@/lib/routine-builder";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * The routine builder (owner, 2 October 2026): each step's best matches from
 * the catalogue, and for a serum or treatment only products that hold an
 * active for the person's concerns.
 */

const ingredient = (name: string, overrides: Partial<Ingredient> = {}): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides });
const BASE = ["water", "glycerin", "butylene glycol", "sodium hyaluronate"];

let serial = 0;
function product(type: ProductType, name: string, names: string[] = [], overrides: Partial<Ingredient>[] = []): ProductWithIngredients {
  serial += 1;
  return {
    id: `p${serial}`,
    barcode: String(8800000000000 + serial),
    brand: "Brand",
    name,
    type,
    productType: type,
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    fetchedAt: "2026-09-26T00:00:00Z",
    ingredientIds: [],
    ingredients: [...BASE, ...names].map((n, i) => ingredient(n, overrides[i - BASE.length] ?? {})),
  } as ProductWithIngredients;
}

const ACNE: SkinProfile = { ...EMPTY_PROFILE, concerns: ["acne-prone"], baseSkinType: "oily", sensitivity: "none" };
const labels = (slots: { label: string }[]) => slots.map((slot) => slot.label);
const slot = (routine: ReturnType<typeof buildRoutine>, time: "morning" | "evening", key: string) => routine[time].find((s) => s.key === key)!;
const names = (s: { picks: { product: { name: string } }[] }) => s.picks.map((pick) => pick.product.name);

it("lays out a morning of four steps and an evening that cleanses twice", () => {
  const routine = buildRoutine([], ACNE);
  expect(labels(routine.morning)).toEqual(["Cleansing", "Serum", "Moisturiser", "Sunscreen"]);
  expect(labels(routine.evening)).toEqual(["First cleanse", "Cleansing", "Treatment", "Moisturiser"]);
});

it("fills a basic step with the best matches of that type, three at most, best first", () => {
  const catalogue = [
    product("moisturizer", "Plain cream"),
    product("moisturizer", "Niacinamide cream", ["niacinamide"]),
    product("moisturizer", "Zinc cream", ["zinc pca"]),
    product("moisturizer", "Salicylic cream", ["salicylic acid"]),
    product("sunscreen", "Sun fluid"),
    product("cleanser", "Gel wash"),
  ];
  const routine = buildRoutine(catalogue, ACNE);
  const moisturiser = slot(routine, "morning", "moisturise");
  expect(moisturiser.picks).toHaveLength(PICKS_PER_STEP);
  const scores = moisturiser.picks.map((pick) => pick.match.score ?? 0);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  expect(moisturiser.picks.every((pick) => pick.product.type === "moisturizer")).toBe(true);
  expect(moisturiser.active).toBeNull();
  expect(names(slot(routine, "morning", "sunscreen"))).toEqual(["Sun fluid"]);
  expect(names(slot(routine, "morning", "cleanse"))).toEqual(["Gel wash"]);
});

it("names a serum or treatment only when it holds an active for the concern, and always says what to look for", () => {
  const catalogue = [
    product("serum", "Hydrating serum"),
    product("serum", "Azelaic serum", ["azelaic acid"]),
    product("serum", "BHA serum", ["salicylic acid"]),
    // A moisturiser with the active is still the moisturiser, not the treatment.
    product("moisturizer", "Salicylic cream", ["salicylic acid"]),
  ];
  const routine = buildRoutine(catalogue, ACNE);
  // Morning takes the gentle active, evening the strong one.
  expect(names(slot(routine, "morning", "serum"))).toEqual(["Azelaic serum"]);
  expect(names(slot(routine, "evening", "treatment"))).toEqual(["BHA serum"]);
  // The step's headline is the active itself, best first, with the others that would do.
  expect(slot(routine, "morning", "serum").active).toEqual({ name: "Azelaic acid", why: "For acne.", alternatives: [] });
  const treatment = slot(routine, "evening", "treatment").active!;
  expect(treatment).toEqual({ name: "Benzoyl peroxide", why: "For acne.", alternatives: ["Retinoids", "Salicylic acid"] });
  expect(activeLine(treatment)).toBe("For acne. Retinoids or Salicylic acid would do too.");
  expect(activeLine(slot(routine, "morning", "serum").active!)).toBe("For acne.");
});

it("still says what to look for when the catalogue has nothing to name", () => {
  const routine = buildRoutine([product("serum", "Hydrating serum")], { ...EMPTY_PROFILE, concerns: ["fine-lines"], pregnancyStatus: "pregnant" });
  expect(slot(routine, "morning", "serum")).toMatchObject({ picks: [], active: { name: "Bakuchiol", why: "For fine lines.", alternatives: ["Peptides"] } });
  // Retinoids are off the list while pregnant, so the evening looks for the same gentle actives.
  expect(slot(routine, "evening", "treatment").active?.name).toBe("Bakuchiol");
});

it("keeps the strong actives away from very sensitive skin at night", () => {
  const routine = buildRoutine([], { ...ACNE, sensitivity: "high" });
  const night = slot(routine, "evening", "treatment").active!;
  expect([night.name, ...night.alternatives].join()).not.toMatch(/Benzoyl|Retinoids|Salicylic/);
});

it("counts hydration as the active for dry, dehydrated skin", () => {
  const routine = buildRoutine([product("serum", "Hydrating serum")], { ...EMPTY_PROFILE, concerns: ["dehydrated"], baseSkinType: "dry" });
  expect(names(slot(routine, "morning", "serum"))).toEqual(["Hydrating serum"]);
});

it("goes by skin type when the profile names no concern", () => {
  expect(slot(buildRoutine([], { ...EMPTY_PROFILE, baseSkinType: "oily" }), "morning", "serum").active?.why).toBe("For oily skin.");
  expect(slot(buildRoutine([], { ...EMPTY_PROFILE, baseSkinType: "dry" }), "morning", "serum").active?.why).toBe("For hydration.");
});

it("never recommends what the skin match warns against", () => {
  const catalogue = [
    product("moisturizer", "Banned cream", ["bad thing"], [{ safety: "avoid" }]),
    product("moisturizer", "Unread cream", ["mystery a", "mystery b", "mystery c", "mystery d", "mystery e", "mystery f", "mystery g", "mystery h", "mystery i", "mystery j", "mystery k", "mystery l", "mystery m"], Array(13).fill({ verified: false })),
    product("moisturizer", "Fine cream"),
  ];
  const routine = buildRoutine(catalogue, ACNE);
  expect(names(slot(routine, "morning", "moisturise"))).toEqual(["Fine cream"]);
  for (const time of ["morning", "evening"] as const) {
    for (const s of routine[time]) for (const pick of s.picks) expect(pick.match.score).toBeGreaterThanOrEqual(SCORE_BANDS.fair);
  }
  // A retinol serum is a fine treatment, until the profile says pregnant.
  const retinol = [product("serum", "Retinol serum", ["retinol"])];
  const lines: SkinProfile = { ...EMPTY_PROFILE, concerns: ["fine-lines"] };
  expect(names(slot(buildRoutine(retinol, lines), "evening", "treatment"))).toEqual(["Retinol serum"]);
  expect(names(slot(buildRoutine(retinol, { ...lines, pregnancyStatus: "pregnant" }), "evening", "treatment"))).toEqual([]);
});

it("splits cleansers into the first cleanse and the face wash", () => {
  const catalogue = [product("micellar-water", "Micellar water"), product("cleanser", "Cleansing oil"), product("cleanser", "Foaming gel")];
  const routine = buildRoutine(catalogue, ACNE);
  expect(names(slot(routine, "evening", "first-cleanse")).sort()).toEqual(["Cleansing oil", "Micellar water"]);
  expect(names(slot(routine, "evening", "cleanse"))).toEqual(["Foaming gel"]);
  expect(names(slot(routine, "morning", "cleanse"))).toEqual(["Foaming gel"]);
});

// The catalogue's types are guesses; a name that says otherwise wins.
it("keeps a product whose name says it is something else out of a step", () => {
  const catalogue = [
    product("cleanser", "Dissolvant express sans acétone"),
    product("cleanser", "Patch anti-boutons"),
    product("cleanser", "Gentle wash"),
    product("moisturizer", "Lotion exfoliante"),
    product("moisturizer", "Day cream"),
  ];
  const routine = buildRoutine(catalogue, ACNE);
  expect(names(slot(routine, "morning", "cleanse"))).toEqual(["Gentle wash"]);
  expect(names(slot(routine, "morning", "moisturise"))).toEqual(["Day cream"]);
  expect(names(slot(routine, "evening", "first-cleanse"))).toEqual([]);
});

it("gives the same profile the same routine every time", () => {
  const catalogue = [product("sunscreen", "B sun"), product("sunscreen", "A sun"), product("sunscreen", "C sun")];
  expect(names(slot(buildRoutine(catalogue, ACNE), "morning", "sunscreen"))).toEqual(["A sun", "B sun", "C sun"]);
  expect(names(slot(buildRoutine([...catalogue].reverse(), ACNE), "morning", "sunscreen"))).toEqual(["A sun", "B sun", "C sun"]);
});

// "Add to my routine" (owner): we put the product in the step it belongs to.
describe("where a product someone adds goes", () => {
  const where = (p: ProductWithIngredients) => routinePlacesFor(p).map((place) => place.id);

  it("puts the basics where their type says, morning and evening where the step is in both", () => {
    expect(where(product("cleanser", "Foaming gel"))).toEqual(["morning:cleanse", "evening:cleanse"]);
    expect(where(product("cleanser", "Cleansing oil"))).toEqual(["evening:first-cleanse"]);
    expect(where(product("micellar-water", "Micellar water"))).toEqual(["evening:first-cleanse"]);
    expect(where(product("moisturizer", "Day cream"))).toEqual(["morning:moisturise", "evening:moisturise"]);
    expect(where(product("night-mask", "Sleeping mask"))).toEqual(["evening:moisturise"]);
    expect(where(product("sunscreen", "Sun fluid"))).toEqual(["morning:sunscreen"]);
  });

  it("puts a serum with a strong active in the evening treatment, and any other in the morning serum", () => {
    expect(where(product("serum", "Retinol serum", ["retinol"]))).toEqual(["evening:treatment"]);
    expect(where(product("serum", "BHA serum", ["salicylic acid"]))).toEqual(["evening:treatment"]);
    expect(where(product("serum", "Vitamin C serum", ["ascorbic acid"]))).toEqual(["morning:serum"]);
    expect(where(product("serum", "Hydrating serum"))).toEqual(["morning:serum"]);
    expect(where(product("exfoliator", "Peeling pads"))).toEqual(["evening:treatment"]);
  });

  it("has no place for what no step takes", () => {
    expect(where(product("lip-balm", "Lip balm"))).toEqual([]);
    expect(where(product("cleanser", "Dissolvant express"))).toEqual([]);
  });

  it("says where in words", () => {
    expect(placesLabel(routinePlacesFor(product("serum", "Retinol serum", ["retinol"])))).toBe("Evening · Treatment");
    expect(placesLabel(routinePlacesFor(product("moisturizer", "Day cream")))).toBe("Morning and evening · Moisturiser");
  });
});

