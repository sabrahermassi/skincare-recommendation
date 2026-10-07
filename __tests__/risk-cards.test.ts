import { irritationCounts, irritationRisk, poreRisk } from "@/lib/risk";
import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { matchProduct, type MatchResult } from "@/lib/matching";
import { EMPTY_PROFILE } from "@/store/useAppStore";

const ingredient = (name: string): Ingredient => ({
  id: name,
  name,
  comedogenic: 0,
  safety: "safe",
  verified: true,
  functions: [],
});

const FILLER = ["glycerin", "propanediol", "carbomer", "xanthan gum", "allantoin", "panthenol", "disodium edta", "tocopherol"];
const product = (names: string[]) =>
  ({ type: "serum", ingredients: names.map(ingredient) }) as unknown as ProductWithIngredients;
const profile = (over: Partial<SkinProfile>): SkinProfile => ({ ...EMPTY_PROFILE, ...over });

/**
 * The product page's irritation card and the ingredient list must agree. An active
 * the score charged as an irritant for this profile shows as Avoid in the list, so
 * the card cannot read "Low — Nothing flagged" above it.
 */
describe("irritationRisk", () => {
  const retinolSerum = product(["water", "retinol", ...FILLER]);

  it("counts an active charged as an irritant, even though its regulatory status is safe", () => {
    const reactive = profile({ concerns: ["fine-lines"], sensitivity: "high" });
    const risk = irritationRisk(retinolSerum, matchProduct(retinolSerum, reactive));
    expect(risk).toMatchObject({ level: "Elevated", note: "1 flagged for your skin", tone: "avoid", hasEntries: true });
  });

  it("stays Low for a tolerant profile", () => {
    const tolerant = profile({ concerns: ["fine-lines"], sensitivity: "none" });
    const risk = irritationRisk(retinolSerum, matchProduct(retinolSerum, tolerant));
    expect(risk).toMatchObject({ level: "Low", note: "Nothing flagged", hasEntries: false });
  });

  it("counts an ingredient once when it is both warned about and charged as an irritant", () => {
    const reactive = profile({ concerns: ["fine-lines"], sensitivity: "high" });
    const match = matchProduct(retinolSerum, reactive);
    const retinol = retinolSerum.ingredients.find((i) => i.name === "retinol") as Ingredient;
    const both = { ...match, warnings: [{ ingredient: retinol }] } as unknown as MatchResult;
    expect(irritationRisk(retinolSerum, both).note).toBe("1 flagged for your skin");
  });

  // #187: a pregnancy hit gets its own section on the result screen and must
  // not inflate this card's count or hide behind a false "Nothing
  // restricted" claim.
  it("excludes a pregnancy hit from the irritation count", () => {
    const pregnancyOnly = product(["water", "tretinoin", ...FILLER]);
    const pregnant = profile({ concerns: ["fine-lines"], pregnancyStatus: "pregnant" });
    const match = matchProduct(pregnancyOnly, pregnant);
    expect(match.warnings.map((w) => w.origin)).toEqual(["pregnancy"]);
    expect(irritationRisk(pregnancyOnly, match).hasEntries).toBe(false);
  });

  it("does not claim 'Nothing flagged' when the only hit is a pregnancy caution", () => {
    const pregnancyOnly = product(["water", "tretinoin", ...FILLER]);
    const pregnant = profile({ concerns: ["fine-lines"], pregnancyStatus: "pregnant" });
    const risk = irritationRisk(pregnancyOnly, matchProduct(pregnancyOnly, pregnant));
    expect(risk.level).toBe("Low");
    expect(risk.note).not.toBe("Nothing flagged");
    // Both result screens render the pregnancy section *before* this card,
    // so the pointer says "above" (#257 review — it used to say "below").
    expect(risk.note).toBe("See the pregnancy note below");
  });

  it("still reads 'Nothing flagged' when there is truly nothing to report", () => {
    const clean = product(["water", ...FILLER]);
    const pregnant = profile({ concerns: ["fine-lines"], pregnancyStatus: "pregnant" });
    const risk = irritationRisk(clean, matchProduct(clean, pregnant));
    expect(risk.note).toBe("Nothing flagged");
  });
});

// #379 review (Codex): a read that recognised too little can't be called Low.
describe("irritationRisk on a list too little of which was recognised", () => {
  it("says Unknown, not 'Nothing flagged'", () => {
    const read = {
      type: "serum",
      ingredients: [ingredient("glycerin"), ...["mystery one", "mystery two", "mystery three"].map((name) => ({ ...ingredient(name), verified: false }))],
    } as unknown as ProductWithIngredients;
    const risk = irritationRisk(read, matchProduct(read, EMPTY_PROFILE));
    expect(risk).toMatchObject({ level: "Unknown", note: "Too little recognised" });
  });
});

// #290: the browse row reads these same counts, so it can't say "1 flagged"
// above a product page that says "3 flagged for your skin".
describe("irritationCounts", () => {
  it("counts what this profile is charged for, not only the EU-flagged entries", () => {
    const scented = product(["water", "parfum", "alcohol denat", ...FILLER]);
    const reactive = profile({ baseSkinType: "dry", sensitivity: "high" });
    const match = matchProduct(scented, reactive);
    const counts = irritationCounts(scented, match);
    expect(counts.personal).toBeGreaterThan(0);
    expect(irritationRisk(scented, match).note).toBe(`${counts.personal} flagged for your skin`);
  });

  it("counts nothing personal for a formula with nothing to flag", () => {
    const clean = product(["water", ...FILLER]);
    expect(irritationCounts(clean, matchProduct(clean, profile({ sensitivity: "high", baseSkinType: "dry" })))).toEqual({
      personal: 0,
      euFlagged: 0,
      common: 0,
    });
  });

  it("does not count an unrecognised name as flagged — it is unassessed", () => {
    const unread = {
      type: "serum",
      ingredients: [{ ...ingredient("mystery extract"), safety: "caution", verified: false }, ...FILLER.map(ingredient)],
    } as unknown as ProductWithIngredients;
    expect(irritationCounts(unread, matchProduct(unread, EMPTY_PROFILE)).euFlagged).toBe(0);
  });
});

// #345: the Ingredient check puts fragrance and the common irritants "to
// watch" for everyone, so the card beside it can't say "Nothing flagged".
describe("irritationRisk beside the Ingredient check", () => {
  const scented = product(["water", "parfum", ...FILLER]);
  const tolerant = profile({ baseSkinType: "normal", sensitivity: "none" });

  it("names a common irritant the person isn't warned about, instead of 'Nothing flagged'", () => {
    const match = matchProduct(scented, tolerant);
    expect(irritationCounts(scented, match)).toEqual({ personal: 0, euFlagged: 0, common: 1 });
    expect(irritationRisk(scented, match)).toMatchObject({
      level: "Low",
      note: "1 common irritant",
      tone: "watch",
      hasEntries: true,
    });
  });

  it("says the same with no skin profile", () => {
    expect(irritationRisk(scented, matchProduct(scented, EMPTY_PROFILE)).note).toBe("1 common irritant");
  });

  it("counts several", () => {
    const both = product(["water", "parfum", "alcohol denat", ...FILLER]);
    expect(irritationRisk(both, matchProduct(both, tolerant)).note).toBe("2 common irritants");
  });

  it("leaves an EU-labelled allergen to the EU-flagged count, not both", () => {
    const allergenScent = {
      type: "serum",
      ingredients: [{ ...ingredient("limonene"), safety: "caution" }, ...FILLER.map(ingredient)],
    } as unknown as ProductWithIngredients;
    const counts = irritationCounts(allergenScent, matchProduct(allergenScent, tolerant));
    expect(counts).toMatchObject({ euFlagged: 1, common: 0 });
  });

  // #407: Annex III alone is "allowed with limits", not a flag.
  it("does not count sodium hydroxide, a pH adjuster, or exempt benzyl alcohol", () => {
    const adjusted = {
      type: "serum",
      ingredients: ["water", "sodium hydroxide", "benzyl alcohol", ...FILLER].map((name) => ({ ...ingredient(name), safety: name === "water" ? "safe" : "caution" })),
    } as unknown as ProductWithIngredients;
    expect(irritationRisk(adjusted, matchProduct(adjusted, tolerant)).note).toBe("Nothing flagged");
  });

  it("counts an EU allergen the dictionary calls safe", () => {
    const hexyl = product(["water", "hexyl cinnamal", ...FILLER]);
    expect(irritationCounts(hexyl, matchProduct(hexyl, tolerant))).toMatchObject({ euFlagged: 1, common: 0 });
  });
});

describe("irritationRisk wording", () => {
  // Names from Annex III's allergen entries, with no rule of their own to add a count.
  const ALLERGENS = ["vanillin", "linalyl acetate", "terpineol"];
  const withAllergens = (count: number) =>
    ({
      type: "serum",
      ingredients: [...ALLERGENS.slice(0, count).map(ingredient), ...FILLER.map(ingredient)],
    }) as unknown as ProductWithIngredients;

  // #294: "1 EU-flagged entries".
  it.each([
    [1, "1 EU-flagged entry"],
    [2, "2 EU-flagged entries"],
  ])("says %i EU-flagged as %s", (count: number, note: string) => {
    const tolerant = profile({ baseSkinType: "normal", sensitivity: "none" });
    const product = withAllergens(count);
    expect(irritationRisk(product, matchProduct(product, tolerant)).note).toBe(note);
  });
});

describe("poreRisk", () => {
  it("names the disputed entries the Pore clogging tab also lists", () => {
    const mixed = product(["water", "glyceryl stearate se", "steareth-20", ...FILLER]);
    expect(poreRisk(mixed)).toMatchObject({ level: "Moderate", note: "1 on the lists · 1 disputed" });
  });

  it("keeps the short note when nothing is disputed", () => {
    const single = product(["water", "glyceryl stearate se", ...FILLER]);
    expect(poreRisk(single).note).toBe("1 on the lists");
  });
});
