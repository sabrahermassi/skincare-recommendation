import { INGREDIENTS } from "@/data/ingredients";
import { PRODUCTS } from "@/data/products";
import { claimPolicyViolations } from "@/lib/claims-policy";
import { PORE_CLOGGERS } from "@/lib/pore-clogging";
import { INGREDIENT_RULES } from "@/lib/rules";

type OwnedClaim = { source: string; text: string };

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
