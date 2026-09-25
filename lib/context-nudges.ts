import type { Concern, Ingredient, ProductType } from "@/data/types";
import { AHA_NAMES } from "./aha-names";
import { RETINOID_ACTIVE_PATTERNS } from "./retinoid-salicylate-names";
import { INGREDIENT_RULES, nameMatches, normaliseFunction, ruleMatches } from "./rules";
import { MINERAL_UV_FILTER_NAMES, ORGANIC_UV_FILTER_NAMES } from "./uv-filter-names";

/**
 * Hand-written context nudges — static content, no live API (`FOR_ME_MVP.md`
 * §25, #234). Context, not a warning: no score effect, no verdict effect, no
 * cap. Same reasoning as `lib/pregnancy-caution.ts`: an ingredient list
 * carries no concentration, so this is something worth knowing about the
 * formula, not a defect in it.
 *
 * The trigger is what's in the bottle, never the time of day. The app knows
 * when someone *scanned* a product, not when they'll use it — a nudge keyed
 * to the clock would be wrong for anyone shopping at lunch for a night serum,
 * and wrong half the time trains people to ignore it. So nothing here reads
 * the clock, the network or the device's location.
 *
 * The photosensitivity nudge mirrors existing labelling guidance rather than
 * asserting something new: the US FDA's AHA labelling guidance recommends a
 * "Sunburn Alert" on cosmetics containing alpha hydroxy acids, because AHAs
 * can increase sensitivity to the sun, and prescription and OTC retinoid
 * labels (tretinoin, adapalene) carry the same sun-exposure advice.
 * That citation lives here, in the code, on purpose — "FDA" in user-facing
 * copy trips the claims policy's regulatory-endorsement rule, and the copy
 * below states a property of the formula, not an authority's endorsement.
 */

export type ContextNudge = {
  id: "photosensitising" | "pigment-goal";
  /** The short topic shown beside the sentence, e.g. "sunlight". */
  label: string;
  /** Shown verbatim. Audited by `__tests__/claims-policy.test.ts`. */
  text: string;
};

/**
 * Whether this is sun protection — a "pair this with SPF" line on a sunscreen
 * is the one outcome that makes the whole feature look careless. Evidence,
 * any of:
 *
 * - the product is typed "sunscreen" (a guess from its name);
 * - an organic filter, by name — which also works on an unresolved label
 *   photo's stubs, since those carry no `functions` (#262 review);
 * - a CosIng "uv-filter" tag on anything but the two minerals;
 * - titanium dioxide or zinc oxide within the first `MINERAL_LEADING_POSITION_MAX`
 *   ingredients (see below) — the one case a mineral name/tag alone isn't
 *   proof, but its position in the list still can be.
 *
 * Titanium dioxide and zinc oxide are never evidence by name or tag alone:
 * both are pigments as often as filters, so a retinoid foundation or a clay
 * mask would otherwise lose its nudge (#262 review; see
 * `MINERAL_UV_FILTER_NAMES`). But real mineral sunscreens use them as an
 * active at 5-25% — high enough to sit near the top of an ingredient list,
 * which is printed in concentration order — while pigment use is usually a
 * smaller share further down. `productType === "sunscreen"` still covers a
 * database/barcode product either way; this position check is what a
 * photographed read (always typed "unknown", #214) falls back on for a
 * mineral-only sunscreen, since it has no type to rely on (#262 review,
 * Codex). `ACID_LEADING_POSITION_MAX` in
 * `supabase/functions/_shared/guess-type-from-ingredients.ts` is the same
 * pattern for a leading acid active.
 *
 * A "uv-absorber" tag alone is deliberately NOT evidence (#262 review,
 * Codex): CosIng uses it for photostabilisers too — additives that shield a
 * *formula's* other ingredients (a retinoid, an organic filter) from
 * breaking down in light, at a level far too low to filter UV for the
 * wearer. Benzotriazolyl Dodecyl P-Cresol is the concrete case: CosIng
 * carries only "uv-absorber" for it, and it's used at 0.01-0.1% purely to
 * protect other actives — crediting that as sun protection would suppress
 * the sun nudge on a product that provides none.
 */
const MINERAL_LEADING_POSITION_MAX = 5;

function isSunProtection(ingredients: Ingredient[], productType?: ProductType): boolean {
  if (productType === "sunscreen") return true;
  return ingredients.some((ingredient, position) => {
    if (nameMatches(MINERAL_UV_FILTER_NAMES, ingredient.name)) return position < MINERAL_LEADING_POSITION_MAX;
    if (nameMatches(ORGANIC_UV_FILTER_NAMES, ingredient.name)) return true;
    return (ingredient.functions ?? []).some((fn) => normaliseFunction(fn) === "uv-filter");
  });
}

/**
 * Nudges that are true of the formula regardless of who's asking — no
 * profile, every ingredient checked, no truncation. `productType` is only
 * ever used to *suppress* a nudge on a sunscreen, never to trigger one.
 */
export function nudgesFor(ingredients: Ingredient[], productType?: ProductType): ContextNudge[] {
  if (isSunProtection(ingredients, productType)) return [];

  const aha = ingredients.some((i) => nameMatches(AHA_NAMES, i.name));
  const retinoid = ingredients.some((i) => nameMatches(RETINOID_ACTIVE_PATTERNS, i.name));
  if (!aha && !retinoid) return [];

  // One nudge, not two saying the same thing, when a formula has both.
  const subject = aha && retinoid ? "AHAs and retinoids" : aha ? "AHAs" : "Retinoids";
  return [
    {
      id: "photosensitising",
      label: "sunlight",
      text: `${subject} can leave skin more reactive to sunlight — worth pairing this with a daytime SPF.`,
    },
  ];
}

/**
 * The one profile-dependent nudge, kept apart from `nudgesFor` so detection
 * itself stays profile-free. Fires when the person is working on dark spots
 * and the formula targets pigment: daytime sun working against that goal is
 * standard dermatology (UV exposure drives melanin production), stated here
 * as "tends to", not as a promise either way.
 *
 * "Targets pigment" is read off the curated rules — an ingredient whose rule
 * helps `hyperpigmentation` — rather than a third hand-copied list of names.
 * Skipped when `nudgesFor` already fired: one SPF sentence per product is
 * enough.
 */
export function goalNudgesFor(
  ingredients: Ingredient[],
  concerns: readonly Concern[],
  productType?: ProductType
): ContextNudge[] {
  if (!concerns.includes("hyperpigmentation")) return [];
  if (isSunProtection(ingredients, productType) || nudgesFor(ingredients, productType).length > 0) return [];

  const targetsPigment = ingredients.some((ingredient) => {
    const rule = INGREDIENT_RULES.find((candidate) => ruleMatches(candidate, ingredient.name));
    return rule?.helps?.concerns?.includes("hyperpigmentation") ?? false;
  });
  if (!targetsPigment) return [];

  return [
    {
      id: "pigment-goal",
      label: "sunlight",
      text: "You're working on dark spots, and daytime sun tends to work against that — worth pairing this with an SPF.",
    },
  ];
}
