// The Deno half of the ingredient-based type fallback, tried only once
// `guessType` (name/tags) has already returned "unknown".
//
// Keep in step with `scripts/lib/guess-type-from-ingredients.mjs` — the two
// run on different runtimes (Deno here, Node there) so they cannot share a
// module, exactly like `guessType` itself. A product typed one way at import
// and another way on a live scan is a real inconsistency, not a cosmetic one:
// `contactWeight` reads the result.
//
// Why these two rules and no others, in short (the Node copy carries the full
// history): a product named after its active ingredient ("Lactic Acid 10%")
// has no format word for any regex to catch, so the formula is the only
// signal left — but only the couple of signals strong enough to trust, since
// guessing wrong is worse than staying "unknown" (see `ProductType` in
// data/types.ts).

/**
 * Organic UV filters with no other common cosmetic role — deliberately
 * excludes Titanium Dioxide and Zinc Oxide, which CosIng tags as UV filters
 * but which are used just as often as a plain pigment/opacifier in lip
 * products and masks.
 */
const ORGANIC_UV_FILTERS = [
  "avobenzone",
  "octocrylene",
  "octinoxate",
  "ethylhexyl methoxycinnamate",
  "octisalate",
  "ethylhexyl salicylate",
  "homosalate",
  "oxybenzone",
  "benzophenone-3",
  "ensulizole",
  "phenylbenzimidazole sulfonic acid",
  "bemotrizinol",
  "bisoctrizole",
  "drometrizole trisiloxane",
  "ecamsule",
  "terephthalylidene dicamphor sulfonic acid",
  "diethylamino hydroxybenzoyl hexyl benzoate",
  "polysilicone-15",
  "amiloxate",
  "isoamyl p-methoxycinnamate",
  "padimate o",
  "cinoxate",
  "dioxybenzone",
  "sulisobenzone",
];

/** The AHA/BHA names curated in lib/rules.ts's two acid rules. */
const LEAVE_ON_ACIDS = [
  "salicylic acid",
  "betaine salicylate",
  "glycolic acid",
  "lactic acid",
  "mandelic acid",
  "malic acid",
  "tartaric acid",
];

/** INCI order is concentration order; a trace pH-adjusting acid sits far later. */
const ACID_LEADING_POSITION_MAX = 5;

/** The length a single-active, concentration-named serum's list runs to. */
const SHORT_INGREDIENT_LIST_MAX = 20;

/**
 * A clay/mud mask carrying an acid active reads exactly like an acid serum by
 * ingredients alone. `guessType` now has its own generic "face-mask" rule
 * using this same pattern (issue #105), so the normal pipeline never reaches
 * this fallback for a mask-named product — this guard is a defense-in-depth
 * backstop for when the function is called standalone. The lookahead keeps
 * "maskara" (Turkish for mascara) out.
 */
const MASK_NAME_PATTERN = /\bmask(?=[eis]|\b)|\bmaschera|\bmasque|\bmascarilla/i;

export function guessTypeFromIngredients(
  name: string,
  ingredients: { inci_name: string; position: number }[],
): string {
  if (ingredients.some((i) => ORGANIC_UV_FILTERS.includes(i.inci_name))) return "sunscreen";

  if (!MASK_NAME_PATTERN.test(name) && ingredients.length <= SHORT_INGREDIENT_LIST_MAX) {
    const hasLeadingAcid = ingredients.some(
      (i) => i.position < ACID_LEADING_POSITION_MAX && LEAVE_ON_ACIDS.includes(i.inci_name),
    );
    // "serum", not "exfoliator": that type is rinse-off in this app's scoring
    // and an acid treatment is left on.
    if (hasLeadingAcid) return "serum";
  }

  return "unknown";
}
