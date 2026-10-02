import type { Ingredient, ProductType, ProductWithIngredients, SkinProfile } from "@/data/types";
import { PREGNANCY_LINE } from "@/lib/journey";
import { matchProduct, SCORE_BANDS } from "@/lib/matching";
import { activeLine, buildRoutine, placesLabel, routinePlacesFor } from "@/lib/routine-builder";
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
/** The product a step suggests, as a list of one name or none. */
const names = (s: { pick: { product: { name: string } } | null }) => (s.pick ? [s.pick.product.name] : []);

it("lays out a morning of four steps and an evening that cleanses twice", () => {
  const routine = buildRoutine([], ACNE);
  expect(labels(routine.morning)).toEqual(["Cleansing", "Serum", "Moisturiser", "Sunscreen"]);
  expect(labels(routine.evening)).toEqual(["First cleanse", "Cleansing", "Treatment", "Moisturiser"]);
});

// One product a step, not a shortlist (owner, 2 October 2026): three options
// handed the choice back to someone who came to be told.
it("fills a basic step with the one best match of that type", () => {
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
  const best = Math.max(...catalogue.filter((p) => p.type === "moisturizer").map((p) => matchProduct(p, ACNE).score ?? 0));
  expect(moisturiser.pick?.product.type).toBe("moisturizer");
  expect(moisturiser.pick?.match.score).toBe(best);
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
  expect(slot(routine, "morning", "serum").active).toEqual({ name: "Azelaic acid", why: "For acne.", alternatives: [], caution: null });
  // It is the active the suggested product holds, so the big letters and the
  // bottle under them never name two different things.
  const treatment = slot(routine, "evening", "treatment").active!;
  expect(treatment).toMatchObject({ name: "Salicylic acid", why: "For acne.", alternatives: ["Benzoyl peroxide", "Retinoids"] });
  expect(activeLine(treatment)).toBe("For acne. Benzoyl peroxide or Retinoids would do too.");
  // With no product to suggest, it is the best active for the profile.
  expect(slot(buildRoutine([], ACNE), "evening", "treatment").active).toEqual({ name: "Benzoyl peroxide", why: "For acne.", alternatives: ["Retinoids", "Salicylic acid"], caution: null });
  expect(activeLine(slot(routine, "morning", "serum").active!)).toBe("For acne.");
});

it("suggests the product with the better active first, whatever the two score", () => {
  const catalogue = [product("serum", "BHA serum", ["salicylic acid"]), product("serum", "Retinol serum", ["retinol"])];
  const treatment = slot(buildRoutine(catalogue, ACNE), "evening", "treatment");
  // Retinoids rank above salicylic acid for acne, so the retinol serum leads and names the step.
  expect(names(treatment)).toEqual(["Retinol serum"]);
  expect(treatment.active?.name).toBe("Retinoids");
});

it("still says what to look for when the catalogue has nothing to name", () => {
  const routine = buildRoutine([product("serum", "Hydrating serum")], { ...EMPTY_PROFILE, concerns: ["fine-lines"], pregnancyStatus: "pregnant" });
  expect(slot(routine, "morning", "serum")).toMatchObject({ pick: null, active: { name: "Bakuchiol", why: "For fine lines.", alternatives: ["Peptides"] } });
  // Retinoids are off the list while pregnant, so the evening looks for the same gentle actives.
  expect(slot(routine, "evening", "treatment").active?.name).toBe("Bakuchiol");
});

// Found in review on #394: a profile that does not say whether the person is
// pregnant (unanswered, or "Prefer not to say") kept retinoids as the evening
// headline and showed nothing about pregnancy, where a Skin needs card for
// the same person carries the caution.
describe("the pregnancy caution on a step's active", () => {
  const LINES: SkinProfile = { ...EMPTY_PROFILE, concerns: ["fine-lines"] };
  const evening = (profile: SkinProfile, catalogue: ProductWithIngredients[] = []) => slot(buildRoutine(catalogue, profile), "evening", "treatment").active!;

  it("is said when the profile does not say either way", () => {
    for (const pregnancyStatus of [null, "prefer-not-to-say"] as const) {
      expect(evening({ ...LINES, pregnancyStatus })).toMatchObject({ name: "Retinoids", caution: PREGNANCY_LINE });
    }
    // On the product's own active too: a salicylic acid serum named for an unanswered acne profile.
    expect(evening(ACNE, [product("serum", "BHA serum", ["salicylic acid"])])).toMatchObject({ name: "Salicylic acid", caution: PREGNANCY_LINE });
  });

  it("is not said after a no, and the active is not offered at all after a yes", () => {
    expect(evening({ ...LINES, pregnancyStatus: "neither" })).toMatchObject({ name: "Retinoids", caution: null });
    expect(evening({ ...LINES, pregnancyStatus: "pregnant" })).toMatchObject({ name: "Bakuchiol", caution: null });
  });

  it("is not said on an active the caution list does not name", () => {
    expect(slot(buildRoutine([], LINES), "morning", "serum").active).toMatchObject({ name: "Bakuchiol", caution: null });
  });
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
    for (const s of routine[time]) if (s.pick) expect(s.pick.match.score).toBeGreaterThanOrEqual(SCORE_BANDS.fair);
  }
  // A retinol serum is a fine treatment, until the profile says pregnant.
  const retinol = [product("serum", "Retinol serum", ["retinol"])];
  const lines: SkinProfile = { ...EMPTY_PROFILE, concerns: ["fine-lines"] };
  expect(names(slot(buildRoutine(retinol, lines), "evening", "treatment"))).toEqual(["Retinol serum"]);
  expect(names(slot(buildRoutine(retinol, { ...lines, pregnancyStatus: "pregnant" }), "evening", "treatment"))).toEqual([]);
});

it("splits cleansers into the first cleanse and the face wash", () => {
  const cleanse = (name: string, type: ProductType = "cleanser") => {
    const routine = buildRoutine([product(type, name)], ACNE);
    return { first: names(slot(routine, "evening", "first-cleanse")), evening: names(slot(routine, "evening", "cleanse")), morning: names(slot(routine, "morning", "cleanse")) };
  };
  expect(cleanse("Micellar water", "micellar-water")).toEqual({ first: ["Micellar water"], evening: [], morning: [] });
  expect(cleanse("Cleansing oil")).toEqual({ first: ["Cleansing oil"], evening: [], morning: [] });
  expect(cleanse("Foaming gel")).toEqual({ first: [], evening: ["Foaming gel"], morning: ["Foaming gel"] });
  // "Oil" in a name is not an oil cleanser: an oil-control wash is a face wash.
  expect(cleanse("Oil control wash")).toEqual({ first: [], evening: ["Oil control wash"], morning: ["Oil control wash"] });
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

// Real names from the staging catalogue, each filed under a face category by Open Beauty Facts.
it("keeps hand, body, shaving and soap products out of a face routine", () => {
  const picked = (type: ProductType, name: string) => {
    const routine = buildRoutine([product(type, name)], ACNE);
    return [...routine.morning, ...routine.evening].flatMap((step) => (step.pick ? [step.pick.product.name] : []));
  };
  const junk: [ProductType, string][] = [
    ["moisturizer", "Ombia Med Hand Creme 5% Urea"],
    ["moisturizer", "Crema Manos"],
    ["moisturizer", "Mains à Croquer"],
    ["moisturizer", "Bodycreme Vitamin E"],
    ["moisturizer", "Dove Nourishing Body Care Intensiva Piel Extra Seca"],
    ["moisturizer", "Baume après-rasage"],
    ["moisturizer", "Pre-Shave Creme (Sensitive Skin, with Green Tea and Oatmeal)"],
    ["cleanser", "GILLETTE Shave Foam"],
    ["cleanser", "Detergente intimo uomo"],
    ["cleanser", "Dove Nemlendirici Sıvı Sabun Caring"],
    ["cleanser", "Charcoal & Dead Sea Salt Detox Soap - Bag"],
    ["cleanser", "25 lingettes démaquillantes fraîcheur"],
    ["sunscreen", "Sensitive Protect Body Spray"],
    ["sunscreen", "Spray Solare Protezione alta SPF 50 - Corpo"],
    ["sunscreen", "Nivea Sun SPF50 Güneş Koruyucu ve Ferahlık Vücut Spreyi"],
    ["sunscreen", "Lait autobronzant"],
  ];
  for (const [type, name] of junk) expect({ name, picked: picked(type, name) }).toEqual({ name, picked: [] });

  // "Face and body" is still for the face, and "handmade" is not a hand.
  expect(picked("moisturizer", "Crème hydratante visage et corps")).not.toEqual([]);
  expect(picked("sunscreen", "Anthelios UVMUNE 400, Face & Body hydrating milk")).not.toEqual([]);
  expect(picked("moisturizer", "Handmade day cream")).not.toEqual([]);
});

it("gives the same profile the same routine every time", () => {
  const catalogue = [product("sunscreen", "B sun"), product("sunscreen", "A sun"), product("sunscreen", "C sun")];
  // Three equal matches: the name settles it, whatever order the catalogue came in.
  expect(names(slot(buildRoutine(catalogue, ACNE), "morning", "sunscreen"))).toEqual(["A sun"]);
  expect(names(slot(buildRoutine([...catalogue].reverse(), ACNE), "morning", "sunscreen"))).toEqual(["A sun"]);
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

