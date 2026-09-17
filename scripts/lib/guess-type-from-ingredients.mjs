// A second, narrower fallback for products `guessType` (name/tag based)
// could not resolve — see scripts/import-obf.mjs and
// scripts/reclassify-types.mjs, the two callers. Never invoked directly by
// itself; only tried once the name-based guess has already returned
// "unknown".
//
// A product named after its active ingredient (e.g. "Lactic Acid 10%") has
// no format word anywhere in its text, so no amount of extending guessType's
// regex table can ever catch it — there is nothing there to match. This
// looks at the *formula* instead, but only for the couple of signals strong
// enough to trust: guessing wrong is worse than staying "unknown" (see
// ProductType's own doc comment in data/types.ts).
//
// A first version keyed the sunscreen rule off CosIng's "uv-filter" function
// tag, and a dry run caught why that's wrong: CosIng tags Titanium Dioxide
// and Zinc Oxide as UV filters unconditionally, but both are used just as
// often as a plain white pigment/opacifier in lip products and masks — the
// tag doesn't (and can't) know which job a given formula is using them for.
// That mistyped roughly two dozen lip balms and clay masks as sunscreen.
// Fixed by naming only organic/chemical filters that have no other common
// cosmetic role — there's no reason a formula would contain one of these
// except for UV protection.

/**
 * Organic UV filters with no other common cosmetic role — deliberately
 * excludes Titanium Dioxide and Zinc Oxide (see the file header). Sourced
 * from the commonly approved FDA/EU organic filter list, not from CosIng's
 * function tag.
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

/**
 * The exact AHA/BHA name lists curated in lib/rules.ts (the salicylic-acid
 * and alpha-hydroxy-acid rules, ~line 289 and ~line 297 at time of writing).
 * Copied rather than imported: lib/rules.ts is TypeScript with RN path
 * aliases and can't be loaded into a plain Node .mjs without a build step —
 * the same reason guessType itself is a hand-kept-in-sync duplicate rather
 * than a shared module. Keep this in step if those two rules change.
 */
const LEAVE_ON_ACIDS = [
  "salicylic acid",
  "betaine salicylate",
  "glycolic acid",
  "lactic acid",
  "mandelic acid",
  "malic acid",
  "tartaric acid",
];

/**
 * INCI order is concentration order. A named acid this early is the
 * formula's whole reason to exist — a trace amount of citric acid used only
 * to adjust pH near the end of a long ingredient list is a completely
 * different, much more common case, and must not trigger this.
 */
const ACID_LEADING_POSITION_MAX = 5;

/**
 * "Short" here means the kind of list a single-active, concentration-named
 * serum carries (a handful of actives plus solvent/preservative/thickener),
 * not a full multi-benefit formula. Unvalidated against real data — a
 * reasonable starting point, reviewable (and adjustable) via the callers'
 * own --dry-run output before anything is written.
 */
const SHORT_INGREDIENT_LIST_MAX = 20;

/**
 * A dry run also caught this: a clay/mud mask carrying an acid active (a
 * real, common combination) otherwise reads exactly like an acid serum by
 * ingredients alone. There's no ProductType for a generic mask yet (see
 * issue #105 — only sheet/night/hair mask exist), so the honest answer for
 * one is "unknown", not a wrong specific guess of "serum". guessType only
 * checks English mask words; this repeats the same check in the languages
 * issue #105's own examples surfaced (German, Italian, French, Spanish,
 * Turkish), since a name this heuristic never sees the tags for is the one
 * place this module has no other way to know.
 */
// No trailing \b: German "Maske" and Turkish "Maskesi" both already start
// with the literal four letters "mask", so a leading boundary alone covers
// English/German/Turkish together. French and Italian spell it differently
// and need their own alternatives.
const MASK_NAME_PATTERN = /\bmask|\bmaschera|\bmasque|\bmascarilla/i;

/**
 * @param {string} name product name, used only for the mask-name guard above
 * @param {{ inci_name: string, position: number }[]} ingredients
 * @returns {string} a ProductType value, or "unknown"
 */
export function guessTypeFromIngredients(name, ingredients) {
  // Checked across the whole formula, not just the leading ingredients —
  // these are never present except to filter UV, so concentration doesn't
  // matter the way it does for the acid rule below.
  if (ingredients.some((i) => ORGANIC_UV_FILTERS.includes(i.inci_name))) return "sunscreen";

  if (!MASK_NAME_PATTERN.test(name) && ingredients.length <= SHORT_INGREDIENT_LIST_MAX) {
    const hasLeadingAcid = ingredients.some(
      (i) => i.position < ACID_LEADING_POSITION_MAX && LEAVE_ON_ACIDS.includes(i.inci_name)
    );
    // "serum", not "exfoliator": that type is rinse-off in this app's
    // scoring (RINSE_OFF_TYPES / contactWeight in lib/rules.ts), and an acid
    // treatment like this is left on — mapping it to exfoliator would
    // silently undercount exactly the exposure that matters most for it.
    if (hasLeadingAcid) return "serum";
  }

  return "unknown";
}
