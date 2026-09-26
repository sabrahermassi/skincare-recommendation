/**
 * How an ingredient name reads on screen.
 *
 * Names are stored lower-case, and screens used to title-case them with a
 * `capitalize` text transform, which turned "glyceryl stearate se" into
 * "Glyceryl Stearate Se" and "disodium edta" into "Disodium Edta" (#294).
 * This title-cases each word but keeps the INCI abbreviations that are only
 * ever written in capitals.
 *
 * Deliberately short: an abbreviation that is also an ordinary word is left
 * out — "tea" is triethanolamine in "TEA-lauryl sulfate" but a plant in "tea
 * tree", and upper-casing the plant is the worse mistake.
 */
const ABBREVIATIONS = new Set([
  "se", "edta", "peg", "ppg", "bht", "bha", "pca", "pvp", "dmdm", "mea", "dea", "mipa",
  "hcl", "ci", "np", "ap", "eop", "ns", "ng", "uv", "spf",
]);

export function displayIngredientName(name: string): string {
  return name.replace(/[a-z0-9]+/gi, (word) => {
    const lower = word.toLowerCase();
    if (ABBREVIATIONS.has(lower)) return lower.toUpperCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}
