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

// What every label starts with, and says nothing about the product: water,
// however the pack prints it ("Aqua/Water/Eau", "Water (Aqua)", "Purified Water").
const WATER = /^(aqua|eau|(purified |deionized |deionised |demineralized |demineralised |distilled )?water)$/;

function saysNothing(name: string): boolean {
  const parts = name
    .toLowerCase()
    .split(/[/()]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => WATER.test(part));
}

/**
 * The ingredients that say most about a label, three at most: its actives
 * first, in printed order; then, where it has fewer, the ingredients our
 * rules credit most (ceramides before butylene glycol), and last whatever is
 * printed first, water left out.
 */
export function labelHighlights(names: readonly string[]): string[] {
  // Each name is looked up once: History titles every label row each time it
  // draws, and the rule list is headed for hundreds (#237).
  const rules = new Map(names.map((name) => [name, INGREDIENT_RULES.find((candidate) => ruleMatches(candidate, name))]));
  const ruleOf = (name: string) => rules.get(name);
  const actives = names.filter((name) => {
    const rule = ruleOf(name);
    return rule !== undefined && isActiveRule(rule);
  });
  const others = names.filter((name) => !actives.includes(name) && !saysNothing(name));
  // A rule that helps something, heaviest first; the sort is stable, so equals keep printed order.
  const credited = others.filter((name) => ruleOf(name)?.helps).sort((a, b) => (ruleOf(b)?.weight ?? 0) - (ruleOf(a)?.weight ?? 0));
  const plain = others.filter((name) => !credited.includes(name));
  return [...actives, ...credited, ...plain].slice(0, TITLE_NAMES).map(displayIngredientName);
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
