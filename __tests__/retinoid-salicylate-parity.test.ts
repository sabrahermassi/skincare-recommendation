import { INGREDIENT_RULES } from "@/lib/rules";
import { PREGNANCY_CAUTION } from "@/lib/pregnancy-caution";
import {
  RETINYL_PALMITATE_NAME,
  BENZYL_SALICYLATE_NAME,
} from "@/lib/retinoid-salicylate-names";

/**
 * Guards the trap #186 fixed: scoring (`lib/rules.ts`) and pregnancy caution
 * (`lib/pregnancy-caution.ts`) each answer a different question, so their
 * name lists can never be asserted equal outright. Instead this walks the
 * two real, live lists and requires every retinoid/salicylate name used by
 * either one to be used by both — or to be a documented, deliberate
 * asymmetry below. A name added to one side and forgotten on the other
 * fails this test instead of silently shipping a coverage gap.
 */

type Pattern = string | RegExp;

function key(pattern: Pattern): string {
  return typeof pattern === "string" ? `s:${pattern}` : `r:${pattern.source}`;
}

function findRuleNames(anchorName: string): Pattern[] {
  const rule = INGREDIENT_RULES.find((r) =>
    r.names.some((n) => typeof n === "string" && n === anchorName)
  );
  if (!rule) throw new Error(`No rule in INGREDIENT_RULES contains "${anchorName}"`);
  return rule.names;
}

function findPregnancyNames(category: "retinoid" | "salicylic-acid"): Pattern[] {
  const entry = PREGNANCY_CAUTION.find((e) => e.category === category);
  if (!entry) throw new Error(`No PREGNANCY_CAUTION entry for category "${category}"`);
  return entry.names;
}

// Names deliberately on one side only, with the reason why. Every key here
// must correspond to a real asymmetry produced below — an unused entry
// would hide the divergence check it's meant to document.
const DELIBERATE_ASYMMETRIES: Record<string, string> = {
  "s:tretinoin":
    "Prescription-only active, never on an OTC ingredient label — scoring has no rule for it.",
  "s:tazarotene":
    "Prescription-only active, never on an OTC ingredient label — scoring has no rule for it.",
  "s:willow bark extract":
    "English common name with no separate scoring rule — salicylic acid/bha/betaine salicylate already cover the scored actives.",
  "s:salix alba bark extract":
    "English common name with no separate scoring rule — salicylic acid/bha/betaine salicylate already cover the scored actives.",
  "s:bha":
    "A marketing shorthand for salicylic acid — scoring recognises it as printed on some labels; pregnancy caution doesn't need a separate entry since salicylic acid/betaine salicylate already cover the acid itself.",
  [`s:${RETINYL_PALMITATE_NAME}`]:
    "Scoring gives retinyl palmitate its own weaker rule since it must convert in skin; pregnancy folds it into the general ester regex instead.",
  "r:^retinyl (palmitate|acetate|linoleate|propionate)$":
    "Pregnancy covers all four retinyl esters generally regardless of conversion rate; scoring only rates retinyl palmitate specifically, at reduced weight.",
};

function assertNoUndocumentedDivergence(
  rulesNames: Pattern[],
  pregnancyNames: Pattern[],
  label: string
) {
  const rulesKeys = new Set(rulesNames.map(key));
  const pregnancyKeys = new Set(pregnancyNames.map(key));
  const allKeys = new Set([...rulesKeys, ...pregnancyKeys]);

  for (const k of allKeys) {
    const inRules = rulesKeys.has(k);
    const inPregnancy = pregnancyKeys.has(k);
    if (inRules && inPregnancy) continue;
    if (DELIBERATE_ASYMMETRIES[k]) continue;
    const side = inRules ? "lib/rules.ts" : "lib/pregnancy-caution.ts";
    throw new Error(
      `${label}: "${k}" is only in ${side} and isn't in DELIBERATE_ASYMMETRIES — add it to both lists or document why not.`
    );
  }
}

describe("retinoid/salicylate name parity", () => {
  it("shares every retinoid name between scoring and pregnancy caution, or documents why not", () => {
    const rulesNames = [...findRuleNames("retinol"), ...findRuleNames(RETINYL_PALMITATE_NAME)];
    const pregnancyNames = findPregnancyNames("retinoid");
    assertNoUndocumentedDivergence(rulesNames, pregnancyNames, "retinoid");
  });

  it("shares every salicylate name between scoring and pregnancy caution, or documents why not", () => {
    const rulesNames = findRuleNames("salicylic acid");
    const pregnancyNames = findPregnancyNames("salicylic-acid");
    assertNoUndocumentedDivergence(rulesNames, pregnancyNames, "salicylate");
  });

  it("fails when a name is added to only one side", () => {
    const rulesNames: Pattern[] = ["salicylic acid", "a brand new name"];
    const pregnancyNames: Pattern[] = ["salicylic acid"];
    expect(() => assertNoUndocumentedDivergence(rulesNames, pregnancyNames, "test")).toThrow(
      /a brand new name/
    );
  });

  it("keeps benzyl salicylate out of both salicylate lists", () => {
    const rulesSalicylate = findRuleNames("salicylic acid");
    const pregnancySalicylate = findPregnancyNames("salicylic-acid");
    expect(rulesSalicylate).not.toContain(BENZYL_SALICYLATE_NAME);
    expect(pregnancySalicylate).not.toContain(BENZYL_SALICYLATE_NAME);
  });
});
