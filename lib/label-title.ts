import { displayIngredientName } from "@/lib/ingredient-name";
import { INGREDIENT_RULES, isActiveRule, ruleMatches } from "@/lib/rules";

/**
 * What a label photo is called. A photo of an ingredient list has no name, no
 * brand and no picture of its own, and "Label photo" said nothing about which
 * product it was. So it is numbered, and named by what is in it (owner, 2
 * October 2026): "Product 2: Niacinamide, Salicylic Acid, Retinol". No name is
 * asked for: a prompt after every scan is friction nobody wants.
 */

/** How many ingredients a title names. */
const TITLE_NAMES = 3;

// What every label starts with, and says nothing about the product.
const SAYS_NOTHING = /^(aqua|water|eau|aqua\/water|water\/aqua|aqua\/eau|water\/eau)$/i;

/**
 * The ingredients that say most about a label: its actives, in printed order,
 * three at most; where it has fewer, its first ingredients fill the rest,
 * water left out.
 */
export function labelHighlights(names: readonly string[]): string[] {
  const active = (name: string) => {
    const rule = INGREDIENT_RULES.find((candidate) => ruleMatches(candidate, name));
    return rule !== undefined && isActiveRule(rule);
  };
  const actives = names.filter(active);
  const rest = names.filter((name) => !actives.includes(name) && !SAYS_NOTHING.test(name.trim()));
  return [...actives, ...rest].slice(0, TITLE_NAMES).map(displayIngredientName);
}

/** "Product 2", or "Label photo" for an entry scanned before they were numbered. */
export function labelName(number: number | undefined): string {
  return number ? `Product ${number}` : "Label photo";
}

/** "Product 2: Niacinamide, Salicylic Acid, Retinol". */
export function labelTitle(names: readonly string[], number: number | undefined): string {
  const highlights = labelHighlights(names);
  return highlights.length > 0 ? `${labelName(number)}: ${highlights.join(", ")}` : labelName(number);
}
