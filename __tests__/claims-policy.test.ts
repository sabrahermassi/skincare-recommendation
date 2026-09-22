import { INGREDIENTS } from "@/data/ingredients";
import { PRODUCTS } from "@/data/products";
import { claimPolicyViolations } from "@/lib/claims-policy";
import { PORE_CLOGGERS } from "@/lib/pore-clogging";
import { scoreExplanation, type MatchResult } from "@/lib/matching";
import { INGREDIENT_RULES } from "@/lib/rules";
import { contraindications } from "@/lib/safety";
import { EMPTY_PROFILE } from "@/store/useAppStore";

type OwnedClaim = { source: string; text: string };

// Every branch of scoreExplanation: concerns up/down/neutral, type up/down,
// and both penalty lines.
const EXPLANATION_RESULTS = [
  { concernFit: 100, typeFit: 100 },
  { concernFit: 0, typeFit: 0 },
  { concernFit: 50, typeFit: 50 },
].map(
  (fit) =>
    ({
      score: 50,
      breakdown: { ...fit, irritationPenalty: 10, porePenalty: 10 },
    }) as unknown as MatchResult
);

const STRICTEST_PROFILE = {
  ...EMPTY_PROFILE,
  concerns: ["acne-prone" as const],
  sensitivity: "high" as const,
  pregnancyStatus: "pregnant" as const,
};

const OWNED_CLAIMS: OwnedClaim[] = [
  ...INGREDIENT_RULES.map((rule, index) => ({
    source: `INGREDIENT_RULES[${index}].reason`,
    text: rule.reason,
  })),
  ...PORE_CLOGGERS.map((rule, index) => ({
    source: `PORE_CLOGGERS[${index}].reason`,
    text: rule.reason,
  })),
  ...Object.entries(INGREDIENTS).flatMap(([id, ingredient]) =>
    ingredient.note ? [{ source: `INGREDIENTS.${id}.note`, text: ingredient.note }] : []
  ),
  ...EXPLANATION_RESULTS.flatMap((result, i) =>
    scoreExplanation(result).map((line) => ({
      source: `scoreExplanation[${i}].${line.label}`,
      text: line.detail,
    }))
  ),
  ...contraindications(Object.values(INGREDIENTS), STRICTEST_PROFILE).map((hit) => ({
    source: `contraindications.${hit.ingredient.id}`,
    text: hit.reason,
  })),
  ...PRODUCTS.flatMap((product) => [
    { source: `PRODUCTS.${product.id}.description`, text: product.description },
    ...product.benefits.map((text, index) => ({
      source: `PRODUCTS.${product.id}.benefits[${index}]`,
      text,
    })),
  ]),
];

describe("medical and safety claims policy", () => {
  it("keeps every app-authored ingredient and product claim within policy", () => {
    const failures = OWNED_CLAIMS.flatMap(({ source, text }) =>
      claimPolicyViolations(text).map((rule) => ({ source, text, rule: rule.id }))
    );

    expect(failures).toEqual([]);
  });

  it.each([
    ["cures acne", "disease-or-treatment"],
    ["heals eczema", "disease-or-treatment"],
    ["prevents rosacea", "disease-or-treatment"],
    ["repairs the skin barrier", "body-structure"],
    ["regenerates skin cells", "body-structure"],
    ["kills acne bacteria", "antimicrobial-or-symptom"],
    ["FDA approved", "regulatory-endorsement"],
    ["skin regeneration", "body-structure"],
    ["reparative lipid for the barrier", "body-structure"],
    ["a bacteria-killing option", "antimicrobial-or-symptom"],
    ["germ-eliminating formula", "antimicrobial-or-symptom"],
    ["barrier restoration", "body-structure"],
    ["clinically proven to work", "guaranteed-outcome"],
  ])("rejects %s", (text: string, ruleId: string) => {
    expect(claimPolicyViolations(text).map((rule) => rule.id)).toContain(ruleId);
  });

  it.each([
    "May be irritating on reactive skin",
    "Supports the skin barrier",
    "Helps prevent moisture loss",
    "Helps skin look smoother",
    "Associated with congestion on acne-prone skin",
    "Not medical advice",
  ])("allows bounded compatibility copy: %s", (text: string) => {
    expect(claimPolicyViolations(text)).toEqual([]);
  });
});
