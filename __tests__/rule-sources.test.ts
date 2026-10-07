import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { PREGNANCY_CAUTION } from "@/lib/pregnancy-caution";
import { INGREDIENT_RULES, type IngredientRule, type RuleSource } from "@/lib/rules";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * #326: every claim the app makes about an ingredient either carries a source
 * that was opened and read as supporting it, or is named below as still
 * needing one. The lists only shrink: source a rule, then delete its line and
 * lower the ceiling. A new rule (#237) arrives with a source or not at all.
 */

/** A rule is named by its first INCI name (or pattern) — unique across the table. */
const ruleKey = (rule: IngredientRule) => String(rule.names[0]);

/** Rules still waiting for a checked source. Never add to this list. */
const UNSOURCED_RULES = [
  // Searched for #347; the sources disagree with the claim as worded:
  // - alcohol denat: a 2025 randomised pilot found 12% ethanol harmless to
  //   atopic skin's barrier (PMID 40954169), and a 2008 review reports
  //   conflicting barrier findings (PMC2596158).
  // - menthol: the JAAD review (PMID 17498839) says it cools by activating the
  //   cold receptor TRPM8, not by irritating nerve endings.
  "alcohol denat",
  "menthol",
  // Irritants and pore-clogging: a source was found for part of the claim
  // only, or disagreed with it — see the PR for #326.
  "tea tree oil",
  "sodium bicarbonate",
  "/hamamelis/",
  "benzoyl peroxide",
  "cocos nucifera oil",
  "lauric acid",
  "/theobroma cacao/",
  "palmitic acid",
  // Benefits.
  "glycerin",
  "sodium hyaluronate",
  "panthenol",
  "/^butyrospermum/",
  "/^vitreoscilla/",
  "squalane",
  "tocopherol",
  "caprylic/capric triglyceride",
  "cetearyl alcohol",
  "butylene glycol",
  "fructooligosaccharides",
  "urea",
  "beta-glucan",
  "allantoin",
  "/centella/",
  "bisabolol",
  "/^glycyrrhiza/",
  "green tea extract",
  "retinyl palmitate",
  "retinyl retinoate",
  "ascorbic acid",
  "3-o-ethyl ascorbic acid",
  "alpha-arbutin",
  "adenosine",
  "zinc pca",
  "sulfur",
  "kaolin",
  "/^houttuynia/",
  "/^propolis/",
  "capryloyl glycine",
  "lauroyl lysine",
  "ubiquinone",
  "resveratrol",
  "glutathione",
  "/^palmitoyl (tri|penta|hexa|oligo)peptide/",
  "/^panax ginseng/",
  "sodium cocoyl isethionate",
];

/** Pregnancy cautions still waiting for a checked source. Never add to this list. */
const UNSOURCED_PREGNANCY = ["retinoid", "salicylic-acid", "essential-oil"];

// Lower these as sources land; raising one is how an unsourced claim sneaks in.
const MAX_UNSOURCED_RULES = 47;
const MAX_UNSOURCED_PREGNANCY = 3;

function expectWellFormed(source: RuleSource) {
  expect(source.label.trim()).not.toBe("");
  expect(source.url).toMatch(/^https:\/\/[^\s]+$/);
}

describe("rule sources", () => {
  it("names every rule uniquely, so the allow-list can point at one", () => {
    const keys = INGREDIENT_RULES.map(ruleKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every rule a source, or lists it as still needing one", () => {
    const missing = INGREDIENT_RULES.filter((rule) => !rule.source && !UNSOURCED_RULES.includes(ruleKey(rule)));
    expect(missing.map(ruleKey)).toEqual([]);
  });

  it("drops a rule from the list once it has a source", () => {
    const keys = new Map(INGREDIENT_RULES.map((rule) => [ruleKey(rule), rule]));
    const stale = UNSOURCED_RULES.filter((key) => !keys.has(key) || keys.get(key)?.source);
    expect(stale).toEqual([]);
  });

  it("only ever shrinks the list", () => {
    expect(new Set(UNSOURCED_RULES).size).toBe(UNSOURCED_RULES.length);
    expect(UNSOURCED_RULES.length).toBeLessThanOrEqual(MAX_UNSOURCED_RULES);
  });

  it("gives every pregnancy caution a source, or lists it, and only shrinks that list", () => {
    for (const entry of PREGNANCY_CAUTION) {
      expect(Boolean(entry.source) !== UNSOURCED_PREGNANCY.includes(entry.category)).toBe(true);
    }
    expect(UNSOURCED_PREGNANCY.length).toBeLessThanOrEqual(MAX_UNSOURCED_PREGNANCY);
  });

  it("holds every source to a label and an https link", () => {
    for (const rule of INGREDIENT_RULES) if (rule.source) expectWellFormed(rule.source);
    for (const entry of PREGNANCY_CAUTION) if (entry.source) expectWellFormed(entry.source);
  });

  it("carries a rule's source into the score's reasons and a pregnancy caution's into its warning", () => {
    const ingredients: Ingredient[] = ["water", "niacinamide", "glycerin", "hydroquinone"].map((name) => ({
      id: name,
      name,
      comedogenic: 0,
      safety: "safe",
      verified: true,
    }));
    const product = { id: "p", name: "Serum", type: "serum", productType: "serum", ingredients } as ProductWithIngredients;
    const match = matchProduct(product, {
      ...EMPTY_PROFILE,
      concerns: ["large-pores", "dehydrated"],
      baseSkinType: "oily",
      pregnancyStatus: "pregnant",
    });
    const reason = (name: string) => match.reasons.find((r) => r.ingredient === name);
    expect(reason("niacinamide")?.source?.label).toBe("DermNet: nicotinamide");
    expect(reason("glycerin")).toBeDefined();
    expect(reason("glycerin")?.source).toBeUndefined();
    const pregnancy = match.warnings.find((w) => w.origin === "pregnancy");
    expect(pregnancy?.source?.label).toBe("NSW Health MotherSafe");
  });
});
