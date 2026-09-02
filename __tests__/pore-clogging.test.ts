import type { Ingredient } from "@/data/types";
import {
  isPoreClogging,
  PORE_CLOGGERS,
  poreCloggingHits,
  poreVerdict,
} from "@/lib/pore-clogging";

/**
 * These pin the four false-negative paths that made the old pore-clogging
 * signal unusable. Each `describe` below names the specific failure it exists
 * to prevent — if one of them starts passing vacuously, the detection has
 * regressed back into the scoring engine.
 */

function known(names: string[]): Ingredient[] {
  return names.map((name) => ({
    id: name,
    name,
    comedogenic: 0 as const,
    safety: "safe" as const,
    verified: true,
  }));
}

function unknown(names: string[]): Ingredient[] {
  return names.map((name) => ({
    id: name,
    name,
    comedogenic: 0 as const,
    safety: "safe" as const,
    verified: false,
  }));
}

const CLEAN = ["water", "glycerin", "butylene glycol", "niacinamide", "xanthan gum", "panthenol"];

describe("detection", () => {
  it("finds an obvious clogger and reports where it sits", () => {
    const hits = poreCloggingHits(known(["water", "glycerin", "coconut oil", "panthenol"]));

    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("coconut oil");
    expect(hits[0].position).toBe(3);
    expect(hits[0].total).toBe(4);
    expect(hits[0].confidence).toBe("high");
  });

  it("returns hits in label order, not table order", () => {
    const hits = poreCloggingHits(known(["water", "cocoa butter", "glycerin", "lauric acid"]));

    expect(hits.map((h) => h.name)).toEqual(["cocoa butter", "lauric acid"]);
  });

  it("reports nothing for a formula with no flagged ingredients", () => {
    expect(poreCloggingHits(known(CLEAN))).toEqual([]);
  });

  it("carries a reason on every hit, since the UI renders it verbatim", () => {
    for (const entry of PORE_CLOGGERS) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });
});

/**
 * The bug: `buildFactors` sums deltas within a category, and salicylic acid is
 * filed under `pore-clogging` as a positive. A formula with both could net to
 * zero and report "nothing flagged" with a clogger sitting in the list.
 */
describe("a positive in the same category cannot cancel a clogger", () => {
  it("still reports the clogger alongside salicylic acid", () => {
    const hits = poreCloggingHits(
      known(["water", "salicylic acid", "coconut oil", "glycerin"])
    );

    expect(hits.map((h) => h.name)).toEqual(["coconut oil"]);
  });
});

/**
 * The bug: `ingredientTone` reads `MatchResult.reasons`, which is truncated to
 * six entries, so a seventh flagged ingredient rendered as "good".
 */
describe("no truncation", () => {
  it("returns every hit in a formula with more than six", () => {
    const cloggers = [
      "coconut oil",
      "isopropyl myristate",
      "myristyl myristate",
      "cocoa butter",
      "wheat germ oil",
      "lauric acid",
      "butyl stearate",
      "decyl oleate",
      "sorbitan oleate",
    ];

    expect(poreCloggingHits(known(cloggers))).toHaveLength(cloggers.length);
  });
});

/**
 * The bug: the old signal was gated on the user having declared acne-prone or
 * oily skin. Detection takes no profile at all now — this asserts the shape of
 * the API, which is what makes that impossible to reintroduce quietly.
 */
describe("profile independence", () => {
  it("takes ingredients only", () => {
    expect(poreCloggingHits).toHaveLength(1);
  });
});

describe("verdict", () => {
  it("clears a well-recognised formula with nothing flagged", () => {
    expect(poreVerdict(known(CLEAN))).toEqual({ kind: "clean" });
  });

  it("declines to clear a formula it mostly could not read", () => {
    const verdict = poreVerdict([...known(["water", "glycerin"]), ...unknown(CLEAN)]);

    expect(verdict.kind).toBe("unknown");
    if (verdict.kind === "unknown") {
      expect(verdict.recognised).toBe(2);
      expect(verdict.total).toBe(8);
    }
  });

  it("declines to clear an empty formula rather than calling it clean", () => {
    expect(poreVerdict([]).kind).toBe("unknown");
  });

  it("reports hits even when the rest of the list is unreadable", () => {
    const verdict = poreVerdict([...unknown(CLEAN), ...known(["coconut oil"])]);

    expect(verdict.kind).toBe("hits");
  });

  it("separates contested hits from the ones worth warning about", () => {
    const verdict = poreVerdict(known(["shea butter", "coconut oil", "dimethicone"]));

    expect(verdict.kind).toBe("hits");
    if (verdict.kind === "hits") {
      expect(verdict.hits).toHaveLength(3);
      expect(verdict.warned.map((h) => h.name)).toEqual(["coconut oil"]);
    }
  });

  it("does not warn on a formula whose only hits are contested", () => {
    const verdict = poreVerdict(known(["water", "shea butter", "glycerin", "dimethicone"]));

    expect(verdict.kind).toBe("hits");
    if (verdict.kind === "hits") {
      expect(verdict.warned).toEqual([]);
    }
  });
});

/**
 * The patterns are the part most likely to be wrong, and a checker that flags
 * half an ordinary shelf gets ignored just as surely as one that flags nothing.
 */
describe("pattern precision", () => {
  it("flags squalene but not squalane", () => {
    expect(isPoreClogging(known(["squalene"])[0])).toBe(true);
    expect(isPoreClogging(known(["squalane"])[0])).toBe(false);
  });

  it("flags isopropyl esters but not isopropyl alcohol", () => {
    expect(isPoreClogging(known(["isopropyl myristate"])[0])).toBe(true);
    expect(isPoreClogging(known(["isopropyl palmitate"])[0])).toBe(true);
    expect(isPoreClogging(known(["isopropyl alcohol"])[0])).toBe(false);
  });

  it("flags the self-emulsifying stearate but not the plain one", () => {
    expect(isPoreClogging(known(["glyceryl stearate se"])[0])).toBe(true);
    expect(isPoreClogging(known(["glyceryl stearate"])[0])).toBe(false);
  });

  it("flags low-ethoxylate oleths but not the high-numbered ones", () => {
    expect(isPoreClogging(known(["oleth-3"])[0])).toBe(true);
    expect(isPoreClogging(known(["oleth-20"])[0])).toBe(false);
    expect(isPoreClogging(known(["laureth-4"])[0])).toBe(true);
    expect(isPoreClogging(known(["laureth-23"])[0])).toBe(false);
  });

  it("leaves common benign ingredients alone", () => {
    const benign = [
      "water",
      "aqua",
      "glycerin",
      "niacinamide",
      "hyaluronic acid",
      "sodium hyaluronate",
      "panthenol",
      "allantoin",
      "centella asiatica extract",
      "butylene glycol",
      "1,2-hexanediol",
      "xanthan gum",
      "zinc oxide",
      "titanium dioxide",
      "tocopherol",
      "ascorbic acid",
      "adenosine",
      "green tea extract",
      "ceramide np",
      "cholesterol",
    ];

    for (const ingredient of known(benign)) {
      expect({ name: ingredient.name, flagged: isPoreClogging(ingredient) }).toEqual({
        name: ingredient.name,
        flagged: false,
      });
    }
  });

  it("matches regardless of surrounding whitespace or case", () => {
    expect(isPoreClogging(known(["  Coconut Oil "])[0])).toBe(true);
  });
});
