import { guessTypeFromIngredients as nodeFallback } from "../scripts/lib/guess-type-from-ingredients.mjs";
import { guessTypeFromIngredients as denoFallback } from "../supabase/functions/_shared/guess-type-from-ingredients";

/**
 * The name/tag classifier now lives in one runtime-neutral ESM module imported
 * by both callers, so there is no second copy to compare. The ingredient
 * fallback still has Node and Deno implementations and keeps this behavioral
 * parity test until those are consolidated too.
 */

describe("the ingredient fallback stays in step across both runtimes", () => {
  const ingredient = (inci_name: string, position: number) => ({ inci_name, position });

  type Case = { name: string; ingredients: { inci_name: string; position: number }[] };

  const cases: Case[] = [
    { name: "Daily Fluid", ingredients: [ingredient("aqua", 0), ingredient("avobenzone", 1)] },
    { name: "Lactic Acid 10%", ingredients: [ingredient("aqua", 0), ingredient("lactic acid", 1)] },
    { name: "Purifying Clay Mask", ingredients: [ingredient("aqua", 0), ingredient("salicylic acid", 1)] },
    { name: "Maskara Siyah", ingredients: [ingredient("aqua", 0), ingredient("lactic acid", 1)] },
    { name: "Tinted Lip Balm", ingredients: [ingredient("titanium dioxide", 0)] },
    { name: "Nothing Special", ingredients: [ingredient("aqua", 0), ingredient("glycerin", 1)] },
    {
      name: "Long Formula",
      ingredients: [...Array.from({ length: 24 }, (_, i) => ingredient(`filler-${i}`, i)), ingredient("lactic acid", 24)],
    },
  ];

  it.each(cases)("agrees on $name", ({ name, ingredients }: Case) => {
    expect(denoFallback(name, ingredients)).toBe(nodeFallback(name, ingredients));
  });
});
