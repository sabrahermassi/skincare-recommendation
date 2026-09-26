import { INGREDIENT_RULES, ruleMatches } from "@/lib/rules";

/**
 * `findRule` (lib/matching.ts) takes the first rule that matches, so a rule
 * placed below a broader one can go silently dead: its names still read as
 * covered in review, and never score (#206). Every name a rule lists by hand
 * has to reach that rule. Ordering a specific rule above a broader pattern on
 * purpose (see the comments in lib/rules.ts) still passes: it is the later,
 * broader rule's *pattern* that yields, never a name it spells out.
 */
describe("INGREDIENT_RULES", () => {
  it("reaches every name a rule lists, with no earlier rule taking it first", () => {
    const shadowed: string[] = [];
    INGREDIENT_RULES.forEach((rule, index) => {
      for (const name of rule.names) {
        if (typeof name !== "string") continue;
        const first = INGREDIENT_RULES.findIndex((candidate) => ruleMatches(candidate, name));
        if (first !== index) shadowed.push(`"${name}" (rule ${index}) is taken by rule ${first}`);
      }
    });
    expect(shadowed).toEqual([]);
  });
});
