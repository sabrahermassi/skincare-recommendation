import { irritationCounts, irritationRisk, poreRisk } from "@/components/RiskCards";
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
 * the card cannot read "Low — Nothing restricted" above it.
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
    expect(risk).toMatchObject({ level: "Low", note: "Nothing restricted", hasEntries: false });
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

  it("does not claim 'Nothing restricted' when the only hit is a pregnancy caution", () => {
    const pregnancyOnly = product(["water", "tretinoin", ...FILLER]);
    const pregnant = profile({ concerns: ["fine-lines"], pregnancyStatus: "pregnant" });
    const risk = irritationRisk(pregnancyOnly, matchProduct(pregnancyOnly, pregnant));
    expect(risk.level).toBe("Low");
    expect(risk.note).not.toBe("Nothing restricted");
    // Both result screens render the pregnancy section *before* this card,
    // so the pointer says "above" (#257 review — it used to say "below").
    expect(risk.note).toBe("See the pregnancy note above");
  });

  it("still reads 'Nothing restricted' when there is truly nothing to report", () => {
    const clean = product(["water", ...FILLER]);
    const pregnant = profile({ concerns: ["fine-lines"], pregnancyStatus: "pregnant" });
    const risk = irritationRisk(clean, matchProduct(clean, pregnant));
    expect(risk.note).toBe("Nothing restricted");
  });
});

// #290: the browse row reads these same counts, so it can't say "1 flagged"
// above a product page that says "3 flagged for your skin".
describe("irritationCounts", () => {
  it("counts what this profile is charged for, not only the EU-restricted entries", () => {
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
      restricted: 0,
      common: 0,
    });
  });

  it("does not count an unrecognised name as restricted — it is unassessed, not flagged", () => {
    const unread = {
      type: "serum",
      ingredients: [{ ...ingredient("mystery extract"), safety: "caution", verified: false }, ...FILLER.map(ingredient)],
    } as unknown as ProductWithIngredients;
    expect(irritationCounts(unread, matchProduct(unread, EMPTY_PROFILE)).restricted).toBe(0);
  });
});

// #345: the Ingredient check puts fragrance and the common irritants "to
// watch" for everyone, so the card beside it can't say "Nothing restricted".
describe("irritationRisk beside the Ingredient check", () => {
  const scented = product(["water", "parfum", ...FILLER]);
  const tolerant = profile({ baseSkinType: "normal", sensitivity: "none" });

  it("names a common irritant the person isn't warned about, instead of 'Nothing restricted'", () => {
    const match = matchProduct(scented, tolerant);
    expect(irritationCounts(scented, match)).toEqual({ personal: 0, restricted: 0, common: 1 });
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

  it("leaves a restricted fragrance to the restricted count, not both", () => {
    const restrictedScent = {
      type: "serum",
      ingredients: [{ ...ingredient("parfum"), safety: "caution" }, ...FILLER.map(ingredient)],
    } as unknown as ProductWithIngredients;
    const counts = irritationCounts(restrictedScent, matchProduct(restrictedScent, tolerant));
    expect(counts).toMatchObject({ restricted: 1, common: 0 });
  });

  it("no longer counts sodium hydroxide, a pH adjuster", () => {
    const adjusted = product(["water", "sodium hydroxide", ...FILLER]);
    expect(irritationRisk(adjusted, matchProduct(adjusted, tolerant)).note).toBe("Nothing restricted");
  });
});

describe("irritationRisk wording", () => {
  const withRestricted = (count: number) =>
    ({
      type: "serum",
      ingredients: [
        ...Array.from({ length: count }, (_, i) => ({ ...ingredient(`restricted ${i}`), safety: "caution" })),
        ...FILLER.map(ingredient),
      ],
    }) as unknown as ProductWithIngredients;

  // #294: "1 restricted entries".
  it.each([
    [1, "1 restricted entry"],
    [2, "2 restricted entries"],
  ])("says %i restricted as %s", (count: number, note: string) => {
    const tolerant = profile({ baseSkinType: "normal", sensitivity: "none" });
    const product = withRestricted(count);
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
