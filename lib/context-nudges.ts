import type { Concern, Ingredient, ProductType } from "@/data/types";
import { AHA_NAMES } from "./aha-names";
import { RETINOID_NAMES, RETINOID_PRESCRIPTION_NAMES, RETINYL_RETINOATE_NAME } from "./retinoid-salicylate-names";
import { INGREDIENT_RULES, normaliseFunction, ruleMatches } from "./rules";
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

// The main retinoid rule's names, the prescription-only ones (tretinoin and
// tazarotene carry the strongest sun guidance of the family), and retinyl
// retinoate — scored on its own, gentler rule since #186, but still a
// retinoid, so the sun advice still applies. The fatty-acid retinyl esters
// (palmitate and friends) are left out: they're weak converters, and
// scoring rates them separately for the same reason.
const RETINOID_PATTERNS: (string | RegExp)[] = [
  ...RETINOID_NAMES,
  ...RETINOID_PRESCRIPTION_NAMES,
  RETINYL_RETINOATE_NAME,
];

function matchesAny(patterns: (string | RegExp)[], inciName: string): boolean {
  const name = inciName.trim().toLowerCase();
  return patterns.some((pattern) => (typeof pattern === "string" ? name === pattern : pattern.test(name)));
}

/**
 * Whether this is sun protection — a "pair this with SPF" line on a sunscreen
 * is the one outcome that makes the whole feature look careless. Evidence,
 * any of:
 *
 * - the product is typed "sunscreen" (a guess from its name — and the only
 *   way a mineral-only sunscreen is recognised, see below);
 * - an organic filter, by name — which also works on an unresolved label
 *   photo's stubs, since those carry no `functions` (#262 review);
 * - a CosIng "uv-filter"/"uv-absorber" tag on anything but the two minerals.
 *
 * Titanium dioxide and zinc oxide are never evidence on their own, by name
 * or by tag: both are pigments as often as filters, so a retinoid
 * foundation or a clay mask would otherwise lose its nudge (#262 review;
 * see `MINERAL_UV_FILTER_NAMES`).
 */
function isSunProtection(ingredients: Ingredient[], productType?: ProductType): boolean {
  if (productType === "sunscreen") return true;
  return ingredients.some((ingredient) => {
    if (matchesAny(MINERAL_UV_FILTER_NAMES, ingredient.name)) return false;
    if (matchesAny(ORGANIC_UV_FILTER_NAMES, ingredient.name)) return true;
    return (ingredient.functions ?? []).some((fn) => {
      const role = normaliseFunction(fn);
      return role === "uv-filter" || role === "uv-absorber";
    });
  });
}

/**
 * Nudges that are true of the formula regardless of who's asking — no
 * profile, every ingredient checked, no truncation. `productType` is only
 * ever used to *suppress* a nudge on a sunscreen, never to trigger one.
 */
export function nudgesFor(ingredients: Ingredient[], productType?: ProductType): ContextNudge[] {
  if (isSunProtection(ingredients, productType)) return [];

  const aha = ingredients.some((i) => matchesAny(AHA_NAMES, i.name));
  const retinoid = ingredients.some((i) => matchesAny(RETINOID_PATTERNS, i.name));
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
