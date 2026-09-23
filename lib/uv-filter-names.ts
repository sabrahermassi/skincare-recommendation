import { ORGANIC_UV_FILTERS } from "@/supabase/functions/_shared/guess-type-from-ingredients";

/**
 * UV filter names for `lib/context-nudges.ts` (which must never tell someone
 * holding a sunscreen to wear sunscreen) and `lib/rules.ts` (which scores
 * the mineral filters).
 *
 * The nudge can't rely on CosIng function tags alone: when a photographed
 * label's names can't be resolved against the dictionary (offline, or a name
 * we don't hold yet), `resolveIngredientNames` returns stubs with no
 * `functions` (#262 review). So organic filters are recognised by name too.
 */

/**
 * Titanium dioxide and zinc oxide. Scored as filters by `lib/rules.ts`, but
 * never taken as proof a product is a sunscreen — by name or by CosIng's
 * "uv-filter" tag, which it applies to both unconditionally. Both are used
 * just as often as a plain white pigment or opacifier (foundations, lip
 * products, clay masks), and the repo's own sunscreen classifier excludes
 * them for exactly that reason after a dry run mistyped two dozen lip balms
 * and masks (`scripts/lib/guess-type-from-ingredients.mjs`, file header).
 */
export const MINERAL_UV_FILTER_NAMES: string[] = ["zinc oxide", "titanium dioxide"];

/**
 * Organic filters: filters with no other common cosmetic role, so their
 * presence alone means the formula is sun protection. The classifier's own
 * list (shared, not copied), plus the EU INCI spellings it doesn't carry —
 * its list leans on US/INN names ("avobenzone"), while an EU label prints
 * the INCI name ("butyl methoxydibenzoylmethane").
 */
export const ORGANIC_UV_FILTER_NAMES: string[] = [
  ...ORGANIC_UV_FILTERS,
  "butyl methoxydibenzoylmethane",
  "octyl methoxycinnamate",
  "bis-ethylhexyloxyphenol methoxyphenyl triazine",
  "methylene bis-benzotriazolyl tetramethylbutylphenol",
  "ethylhexyl triazone",
  "diethylhexyl butamido triazone",
];
