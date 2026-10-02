import { ingredientGroups } from "@/components/result/IngredientsCard";
import { INGREDIENTS } from "@/data/ingredients";
import { PRODUCTS } from "@/data/products";
import type { Ingredient } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { PORE_CLOGGERS, poreVerdict } from "@/lib/pore-clogging";
import { irritationCounts, irritationRisk, poreRisk } from "@/lib/risk";
import { INGREDIENT_RULES } from "@/lib/rules";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * A risk row that counts ingredients opens the list filtered to them. The
 * two are worked out by different functions, and once drifted apart: the
 * pore-clogging row said "5 ingredients, mixed evidence" over a list that
 * said "Nothing here clogs pores" (owner, 2 October 2026). This holds every
 * such pair together across every name the app has an opinion on.
 */

const named = (name: string, overrides: Partial<Ingredient> = {}): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides });
const PLAIN = ["water", "glycerin", "butylene glycol", "sodium hyaluronate", "panthenol"].map((name) => named(name));

// Every literal name a rule or a pore-clogging entry knows, and every sample ingredient.
const literal = (names: readonly (string | RegExp)[]) => names.filter((n): n is string => typeof n === "string");
const KNOWN: Ingredient[] = [
  ...INGREDIENT_RULES.flatMap((rule) => literal(rule.names)).map((name) => named(name)),
  ...PORE_CLOGGERS.flatMap((entry) => literal(entry.names)).map((name) => named(name)),
  ...Object.values(INGREDIENTS),
  named("restricted thing", { safety: "caution" }),
  named("banned thing", { safety: "avoid" }),
  named("misread nmae", { verified: false }),
];

// Each known name on its own in a plain base, then the sample products, then everything at once.
const FORMULAS: { label: string; ingredients: Ingredient[] }[] = [
  ...KNOWN.map((ingredient) => ({ label: ingredient.name, ingredients: [...PLAIN, ingredient] })),
  ...PRODUCTS.map((product) => ({ label: product.name, ingredients: product.ingredientIds.map((id) => INGREDIENTS[id]).filter(Boolean) })),
  { label: "everything", ingredients: KNOWN },
];

// The Ingredients tab is the same for everyone: it is read with no profile.
const general = (ingredients: Ingredient[]) => matchProduct({ type: "serum", ingredients }, EMPTY_PROFILE);

it("has formulas to check", () => {
  expect(FORMULAS.length).toBeGreaterThan(200);
});

it("opens a pore-clogging list with exactly the ingredients its row counts", () => {
  for (const { label, ingredients } of FORMULAS) {
    const risk = poreRisk({ ingredients });
    const listed = ingredientGroups(ingredients, general(ingredients), false).pore;
    const verdict = poreVerdict(ingredients);
    const counted = verdict.kind === "hits" ? verdict.hits.length : 0;
    expect({ label, listed: listed.length, tappable: risk.hasEntries }).toEqual({ label, listed: counted, tappable: counted > 0 });
  }
});

it("opens a watch-outs list with at least the ingredients its irritation row counts", () => {
  for (const { label, ingredients } of FORMULAS) {
    const match = general(ingredients);
    const risk = irritationRisk({ ingredients }, match);
    if (!risk.hasEntries) continue;
    const { personal, restricted, common } = irritationCounts({ ingredients }, match);
    // The row names one of the three counts; the list must hold at least that many.
    const named = personal > 0 ? personal : restricted > 0 ? restricted : common;
    const listed = ingredientGroups(ingredients, match, false).watch.length;
    expect({ label, enough: listed >= named, some: listed > 0 }).toEqual({ label, enough: true, some: true });
  }
});
