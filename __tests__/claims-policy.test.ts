import { INGREDIENTS } from "@/data/ingredients";
import { PRODUCTS } from "@/data/products";
import { claimPolicyViolations } from "@/lib/claims-policy";
import { goalNudgesFor, nudgesFor } from "@/lib/context-nudges";
import { PORE_CLOGGERS } from "@/lib/pore-clogging";
import { PREGNANCY_CAUTION } from "@/lib/pregnancy-caution";
import { scoreExplanation, verdictHeadline, type MatchResult } from "@/lib/matching";
import { INGREDIENT_RULES } from "@/lib/rules";
import { contraindications } from "@/lib/safety";
import { EMPTY_PROFILE } from "@/store/useAppStore";

type OwnedClaim = { source: string; text: string };

const STRICTEST_PROFILE = {
  ...EMPTY_PROFILE,
  concerns: ["acne-prone" as const],
  sensitivity: "high" as const,
  pregnancyStatus: "pregnant" as const,
};

const WARNINGS = contraindications(Object.values(INGREDIENTS), STRICTEST_PROFILE);

// Every branch of scoreExplanation: concerns up/down/neutral, type up/down,
// both penalty lines and the hazard line.
const EXPLANATION_RESULTS = [
  { concernFit: 100, typeFit: 100 },
  { concernFit: 0, typeFit: 0 },
  { concernFit: 50, typeFit: 50 },
].map(
  (fit) =>
    ({
      score: 50,
      breakdown: { ...fit, irritationPenalty: 10, porePenalty: 10 },
      warnings: WARNINGS,
    }) as unknown as MatchResult
);

// #187: verdictHeadline was never in this audit before — added as its own
// collection, covering every band and both the pregnancy and non-pregnancy
// variant, since a pregnancy qualifier is new user-facing copy.
const PREGNANCY_WARNING = {
  ingredient: { id: "retinol", name: "Retinol", comedogenic: 0, safety: "safe" as const, verified: true },
  reason: "A vitamin A derivative — commonly advised against in pregnancy and while breastfeeding",
  severity: "irritant" as const,
  origin: "pregnancy" as const,
};

const HEADLINE_RESULTS: OwnedClaim[] = (["excellent", "good", "fair", "poor"] as const)
  .flatMap((verdict) =>
    [false, true].map((pregnant) => ({
      source: `verdictHeadline.${verdict}${pregnant ? ".pregnant" : ""}`,
      text: verdictHeadline({
        verdict,
        warnings: pregnant ? [PREGNANCY_WARNING] : [],
      } as unknown as MatchResult),
    }))
  )
  .concat(
    (["not_personalized", "low_coverage"] as const).map((unknownReason) => ({
      source: `verdictHeadline.unknown.${unknownReason}`,
      text: verdictHeadline({ verdict: "unknown", warnings: [], unknownReason } as unknown as MatchResult),
    }))
  );

// #234: sun/SPF context nudges — the copy most at risk of reading as a
// disease-prevention claim, so every variant is audited, not a sample.
const nudgeIngredient = (name: string) => ({
  id: name,
  name,
  comedogenic: 0 as const,
  safety: "safe" as const,
  verified: true,
});
const NUDGE_RESULTS: OwnedClaim[] = [
  ...nudgesFor([nudgeIngredient("glycolic acid")]),
  ...nudgesFor([nudgeIngredient("retinol")]),
  ...nudgesFor([nudgeIngredient("glycolic acid"), nudgeIngredient("retinol")]),
  ...goalNudgesFor([nudgeIngredient("niacinamide")], ["hyperpigmentation"]),
].map((nudge, index) => ({ source: `contextNudges[${index}].${nudge.id}`, text: nudge.text }));

const OWNED_CLAIMS: OwnedClaim[] = [
  ...HEADLINE_RESULTS,
  ...NUDGE_RESULTS,
  // Audited directly (#261 review): `WARNINGS` below comes from the sample
  // INGREDIENTS, which hold none of the pregnancy-caution names — so these
  // reasons were never actually reaching the audit, despite
  // docs/claims-policy.md saying they were.
  ...PREGNANCY_CAUTION.map((entry) => ({
    source: `PREGNANCY_CAUTION.${entry.category}.reason`,
    text: entry.reason,
  })),
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
  ...WARNINGS.map((hit) => ({
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
  // Without this, a regression that stopped the nudges firing would empty
  // the collection and the audit below would pass on nothing.
  it("audits every context-nudge variant, not an empty collection", () => {
    expect(NUDGE_RESULTS.map((claim) => claim.source)).toEqual([
      "contextNudges[0].photosensitising",
      "contextNudges[1].photosensitising",
      "contextNudges[2].photosensitising",
      "contextNudges[3].pigment-goal",
    ]);
    // Four distinct sentences — the three photosensitising variants differ by subject.
    expect(new Set(NUDGE_RESULTS.map((claim) => claim.text)).size).toBe(4);
  });

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
