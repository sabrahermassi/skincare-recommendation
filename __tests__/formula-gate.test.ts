import { readFormula, type FormulaSources } from "@/supabase/functions/_shared/formula-gate";

/**
 * The gate `product-lookup` holds a barcode source's text to before storing it
 * (#184) — the exact module Deno runs. The dictionary is injected, not the
 * live one: a ratio test against an empty dictionary passes for the wrong
 * reason (0 recognised out of anything is always "garbage"), so every case
 * here names the dictionary it is judged against.
 */

const DICTIONARY = [
  "aqua",
  "glycerin",
  "butyrospermum parkii butter",
  "tocopherol",
  "niacinamide",
  "sodium hyaluronate",
  "phenoxyethanol",
  "panthenol",
];

function sources(names: string[] = DICTIONARY, aliases: [string, string][] = []) {
  const verified = new Set(names);
  const calls = { known: 0, dictionary: 0 };
  const s: FormulaSources = {
    known: async (asked) => {
      calls.known++;
      return new Set(asked.filter((n) => verified.has(n)));
    },
    dictionary: async () => {
      calls.dictionary++;
      return { dictionary: new Set(names), aliases: new Map(aliases) };
    },
  };
  return { sources: s, calls };
}

describe("the barcode formula gate", () => {
  it("refuses a mostly-garbage formula — even after the dictionary has had its go", async () => {
    const { sources: s, calls } = sources();
    const read = await readFormula("Aqua, lorem ipsum, promo code, buy now, free shipping, limited offer", s);
    expect(read).toEqual({ ok: false, reason: "gated" });
    expect(calls.dictionary).toBe(1);
  });

  it("keeps a good formula exactly as the plain parser read it, and never loads the dictionary", async () => {
    const { sources: s, calls } = sources();
    const read = await readFormula("Aqua, Glycerin, Niacinamide, Sodium Hyaluronate, Phenoxyethanol", s);
    if (!read.ok) throw new Error("expected a pass");
    expect(read.ingredients.map((p) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
      "niacinamide",
      "sodium hyaluronate",
      "phenoxyethanol",
    ]);
    expect(calls.dictionary).toBe(0);
    expect(calls.known).toBe(1);
  });

  // The case a gate without the repair would silently regress: every name is
  // real, just not printed the way the dictionary spells it.
  it("keeps a formula that only passes after the dictionary repairs it", async () => {
    const { sources: s, calls } = sources();
    const read = await readFormula("Purified Water, Glycerol, Shea Butter, Vitamin E", s);
    if (!read.ok) throw new Error("expected a pass after repair");
    expect(read.ingredients.map((p) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
      "butyrospermum parkii butter",
      "tocopherol",
    ]);
    expect(calls.dictionary).toBe(1);
    // Re-reading a stored copy goes through the same repair, so the repair
    // itself never reads as a reformulation.
    expect(read.reparse("purified water, glycerol, shea butter, vitamin e").map((p) => p.inci_name)).toEqual(
      read.ingredients.map((p) => p.inci_name)
    );
  });

  it("resolves a synonym on the repaired read", async () => {
    const { sources: s } = sources(DICTIONARY, [["glycérine", "glycerin"], ["eau", "aqua"]]);
    const read = await readFormula("Eau, Glycérine, Panthenol, Tocopherol", s);
    if (!read.ok) throw new Error("expected a pass");
    expect(read.ingredients.map((p) => p.inci_name)).toEqual(["aqua", "glycerin", "panthenol", "tocopherol"]);
  });

  it("says text with no ingredient at all is no formula, not a gated one", async () => {
    const { sources: s, calls } = sources();
    expect(await readFormula("", s)).toEqual({ ok: false, reason: "empty" });
    expect(calls.known).toBe(0);
  });

  it("keeps a short real formula — a single-oil product is a formula", async () => {
    const { sources: s } = sources(["simmondsia chinensis seed oil"]);
    const read = await readFormula("Simmondsia Chinensis Seed Oil", s);
    expect(read.ok).toBe(true);
  });

  it("lets a dictionary failure surface rather than read as garbage", async () => {
    const failing: FormulaSources = {
      known: async () => {
        throw new Error("db down");
      },
      dictionary: async () => ({ dictionary: new Set(), aliases: new Map() }),
    };
    await expect(readFormula("Aqua, Glycerin", failing)).rejects.toThrow("db down");
  });
});
