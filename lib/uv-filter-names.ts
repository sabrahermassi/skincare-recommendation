/**
 * UV filter names, shared between `lib/rules.ts` (which scores the mineral
 * filters) and `lib/context-nudges.ts` (which must never tell someone
 * holding a sunscreen to wear sunscreen).
 *
 * The nudge can't rely on CosIng function tags alone: when a photographed
 * label's names can't be resolved against the dictionary (offline, or a
 * name we don't hold yet), `resolveIngredientNames` returns stubs with no
 * `functions`, and a sunscreen would read as a plain AHA product (#234
 * review). So filters are recognised by name as well — INCI names, plus the
 * US drug names a US label prints instead.
 *
 * Matching is exact after `normalise`, which strips bracketed qualifiers, so
 * "Titanium Dioxide (Nano)" arrives as "titanium dioxide". Titanium dioxide
 * used as a colourant prints as "CI 77891" instead, so it doesn't match here.
 */

export const MINERAL_UV_FILTER_NAMES: string[] = ["zinc oxide", "titanium dioxide"];

export const CHEMICAL_UV_FILTER_NAMES: string[] = [
  "butyl methoxydibenzoylmethane",
  "avobenzone",
  "ethylhexyl methoxycinnamate",
  "octyl methoxycinnamate",
  "octinoxate",
  "octocrylene",
  "homosalate",
  "ethylhexyl salicylate",
  "octisalate",
  "benzophenone-3",
  "oxybenzone",
  "bis-ethylhexyloxyphenol methoxyphenyl triazine",
  "ethylhexyl triazone",
  "diethylamino hydroxybenzoyl hexyl benzoate",
  "methylene bis-benzotriazolyl tetramethylbutylphenol",
  "drometrizole trisiloxane",
  "terephthalylidene dicamphor sulfonic acid",
  "phenylbenzimidazole sulfonic acid",
  "ensulizole",
  "diethylhexyl butamido triazone",
  "isoamyl p-methoxycinnamate",
  "polysilicone-15",
];
