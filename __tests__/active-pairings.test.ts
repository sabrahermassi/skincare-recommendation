import { readFileSync } from "fs";
import { join } from "path";

import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { ACTIVE_PAIRINGS, pairingNotesFor, shelfPairingNotes } from "@/lib/active-pairings";
import { matchProduct, resetScoreCache } from "@/lib/matching";
import { RETINOID_ACTIVE_PATTERNS } from "@/lib/retinoid-salicylate-names";
import { EMPTY_PROFILE } from "@/store/useAppStore";

function ing(name: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides };
}

const shelf = (id: string, names: string[]) => ({ id, name: `Product ${id}`, ingredients: names.map((n) => ing(n)) });

describe("the pairing table", () => {
  it("gives every pairing a cited source and a confidence tier", () => {
    for (const pairing of ACTIVE_PAIRINGS) {
      expect(pairing.source.trim().length).toBeGreaterThan(20);
      expect(["high", "moderate", "contested"]).toContain(pairing.confidence);
    }
  });

  it("keeps vitamin C + niacinamide, marked contested, with the reason written down", () => {
    const pairing = ACTIVE_PAIRINGS.find((p) => p.id === "vitamin-c-niacinamide");
    expect(pairing?.confidence).toBe("contested");
    expect(pairing?.source).toMatch(/unformulated/);
  });

  it("uses the shared retinoid list rather than its own", () => {
    for (const pairing of ACTIVE_PAIRINGS.filter((p) => p.id.startsWith("retinoid-"))) {
      expect(pairing.a.names).toBe(RETINOID_ACTIVE_PATTERNS);
    }
  });
});

describe("pairingNotesFor", () => {
  it("adds the evening note and one layering line for a retinoid", () => {
    const notes = pairingNotesFor([ing("water"), ing("retinol")]);
    expect(notes.map((n) => n.id)).toEqual(["retinoid-evening", "layering"]);
    expect(notes[1].text).toMatch(/another product with BHA, AHAs, benzoyl peroxide or sulfur /);
  });

  it("covers prescription retinoids and retinyl retinoate", () => {
    expect(pairingNotesFor([ing("tretinoin")])[0].id).toBe("retinoid-evening");
    expect(pairingNotesFor([ing("retinyl retinoate")])[0].id).toBe("retinoid-evening");
  });

  it("names a retinoid as the partner for each other active, with no evening note", () => {
    for (const name of ["salicylic acid", "bha", "glycolic acid", "benzoyl peroxide", "sulfur"]) {
      const notes = pairingNotesFor([ing(name)]);
      expect(notes.map((n) => n.id)).toEqual(["layering"]);
      expect(notes[0].text).toMatch(/another product with a retinoid /);
    }
  });

  it("matches a label's casing and spacing", () => {
    expect(pairingNotesFor([ing(" Salicylic Acid ", { verified: false })])).toHaveLength(1);
  });

  it("names every partner once when a formula has both sides", () => {
    const [, layering] = pairingNotesFor([ing("retinol"), ing("salicylic acid")]);
    expect(layering.text).toMatch(/with BHA, AHAs, benzoyl peroxide, sulfur or a retinoid /);
  });

  it("never shows the contested vitamin C + niacinamide pairing", () => {
    expect(pairingNotesFor([ing("ascorbic acid")])).toEqual([]);
    expect(pairingNotesFor([ing("niacinamide")])).toEqual([]);
    expect(shelfPairingNotes([shelf("A", ["ascorbic acid"]), shelf("B", ["niacinamide"])])).toEqual([]);
  });

  it("checks every ingredient, with no truncation", () => {
    const filler = Array.from({ length: 60 }, (_, i) => ing(`filler ${i}`));
    expect(pairingNotesFor([...filler, ing("retinal")])[0].id).toBe("retinoid-evening");
  });

  it("adds nothing for a formula with none of these actives", () => {
    expect(pairingNotesFor([ing("water"), ing("glycerin")])).toEqual([]);
  });
});

describe("shelfPairingNotes", () => {
  it("flags two saved products whose actives stack, naming both", () => {
    const notes = shelfPairingNotes([shelf("A", ["retinol"]), shelf("B", ["glycerin"]), shelf("C", ["lactic acid"])]);
    expect(notes).toHaveLength(1);
    expect(notes[0].label).toBe("Product A + Product C");
    expect(notes[0].text).toMatch(/^Between them, these bring together a retinoid with AHAs, /);
  });

  it("finds the pair whichever side each product is on", () => {
    expect(shelfPairingNotes([shelf("A", ["benzoyl peroxide"]), shelf("B", ["adapalene"])])).toHaveLength(1);
  });

  it("folds several partners into one line per pair", () => {
    const notes = shelfPairingNotes([shelf("A", ["retinol"]), shelf("B", ["salicylic acid", "glycolic acid"])]);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toMatch(/a retinoid with BHA and AHAs/);
  });

  it("doesn't flag a single product against itself", () => {
    expect(shelfPairingNotes([shelf("A", ["retinol", "salicylic acid"])])).toEqual([]);
  });
});

describe("pairings and the score", () => {
  // A pairing is about two products used together; each has already been
  // scored on its own actives (#233).
  it("leaves score, verdict, breakdown and warnings identical", () => {
    const product = {
      type: "serum",
      ingredients: [ing("water"), ing("retinol"), ing("salicylic acid"), ing("glycerin")],
    } as unknown as ProductWithIngredients;
    const profile: SkinProfile = { ...EMPTY_PROFILE, baseSkinType: "oily", concerns: ["acne-prone"] };

    resetScoreCache();
    const before = matchProduct(product, profile);
    expect(pairingNotesFor(product.ingredients).length).toBeGreaterThan(0);
    expect(shelfPairingNotes([{ id: "x", name: "x", ingredients: product.ingredients }, shelf("y", ["retinal"])])).toHaveLength(1);
    resetScoreCache();
    const after = matchProduct(product, profile);

    expect(after).toEqual(before);
  });

  it("is never read by scoring", () => {
    for (const file of ["matching.ts", "safety.ts", "rules.ts"]) {
      expect(readFileSync(join(__dirname, "..", "lib", file), "utf8")).not.toMatch(/active-pairings/);
    }
  });
});
