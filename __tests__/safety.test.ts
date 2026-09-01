import { INGREDIENTS } from "@/data/ingredients";
import type { SkinProfile } from "@/data/types";
import type { Ingredient } from "@/data/types";
import {
  contraindications,
  flaggedIngredients,
  groupByRisk,
  isFlagged,
  isVerified,
} from "@/lib/safety";
import { EMPTY_PROFILE } from "@/store/useAppStore";

const safe = INGREDIENTS["glycerin"]; // comedogenic 0, safe
const cautionIrritant = INGREDIENTS["fragrance"]; // comedogenic 0, caution
const severeComedogenic = INGREDIENTS["isopropyl-myristate"]; // 5, avoid
const mildlyComedogenic = INGREDIENTS["cetearyl-alcohol"]; // 2, safe
const moderate = INGREDIENTS["coconut-oil"]; // 4, caution

function profile(overrides: Partial<SkinProfile> = {}): SkinProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

describe("isFlagged", () => {
  it("does not flag a benign ingredient", () => {
    expect(isFlagged(safe)).toBe(false);
  });

  it("flags on safety level even when comedogenic rating is 0", () => {
    expect(isFlagged(cautionIrritant)).toBe(true);
    expect(isFlagged(INGREDIENTS["denatured-alcohol"])).toBe(true);
  });

  it("flags on comedogenic rating even when safety is 'safe'", () => {
    // Guards the threshold: 2 is below it, so a fatty alcohol stays unflagged.
    expect(isFlagged(mildlyComedogenic)).toBe(false);
  });

  it("flags high comedogenic ratings", () => {
    expect(isFlagged(moderate)).toBe(true);
    expect(isFlagged(severeComedogenic)).toBe(true);
  });
});

describe("flaggedIngredients", () => {
  it("returns only the flagged subset, preserving order", () => {
    const result = flaggedIngredients([safe, severeComedogenic, mildlyComedogenic, cautionIrritant]);
    expect(result.map((i) => i.id)).toEqual(["isopropyl-myristate", "fragrance"]);
  });
});

describe("contraindications", () => {
  it("returns nothing for a clean formula", () => {
    const p = profile({ baseSkinType: "oily", concerns: ["acne-prone"] });
    expect(contraindications([safe, mildlyComedogenic], p)).toEqual([]);
  });

  it("flags 'avoid' ingredients for every profile, regardless of concerns", () => {
    const result = contraindications([severeComedogenic], EMPTY_PROFILE);
    expect(result).toHaveLength(1);
    expect(result[0].ingredient.id).toBe("isopropyl-myristate");
  });

  it("flags highly comedogenic ingredients for acne-prone users", () => {
    const p = profile({ baseSkinType: "oily", concerns: ["acne-prone"] });
    const result = contraindications([moderate], p);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toMatch(/acne-prone/);
  });

  it("does NOT flag a comedogenic ingredient when the user is not acne-prone", () => {
    const p = profile({ baseSkinType: "dry", concerns: ["dehydrated"] });
    expect(contraindications([moderate], p)).toEqual([]);
  });

  it("flags 'caution' irritants only for sensitive skin", () => {
    const sensitive = profile({ sensitive: true });
    const notSensitive = profile({ baseSkinType: "oily" });
    expect(contraindications([cautionIrritant], sensitive)).toHaveLength(1);
    expect(contraindications([cautionIrritant], notSensitive)).toEqual([]);
  });

  it("reports each problem ingredient once", () => {
    // coconut-oil is both caution AND comedogenic 4; a sensitive acne-prone
    // user must not see it listed twice.
    const p = profile({ sensitive: true, concerns: ["acne-prone"] });
    const result = contraindications([moderate], p);
    expect(result).toHaveLength(1);
  });
});

/**
 * Open Beauty Facts ingredient text is crowdsourced and often OCR-mangled —
 * the live catalogue contains fused entries like "Ulmus Davidiana Root raria
 * Lobata Root". These pin the rule that an unrecognised name is *unassessed*,
 * never quietly counted as fine.
 */
describe("unverified ingredients", () => {
  const unrecognised: Ingredient = {
    id: "ulmus davidiana root raria lobata root",
    name: "ulmus davidiana root raria lobata root",
    comedogenic: 0,
    safety: "safe",
    verified: false,
  };

  // The hand-written sample catalogue predates the flag and is trusted.
  it("treats a missing flag as verified, so the sample catalogue is unaffected", () => {
    expect(safe.verified).toBeUndefined();
    expect(isVerified(safe)).toBe(true);
  });

  it("treats an explicit false as unverified", () => {
    expect(isVerified(unrecognised)).toBe(false);
  });

  it("does not flag an unrecognised name — it is unassessed, not clean", () => {
    expect(isFlagged(unrecognised)).toBe(false);
    expect(flaggedIngredients([unrecognised])).toEqual([]);
  });

  /** The heart of it: never file an unknown under "No concerns". */
  it("buckets an unrecognised name as unknown rather than clean", () => {
    const groups = groupByRisk([unrecognised]);
    expect(groups.unknown).toHaveLength(1);
    expect(groups.clean).toEqual([]);
    expect(groups.caution).toEqual([]);
    expect(groups.avoid).toEqual([]);
  });

  it("keeps verified ingredients in their normal tiers alongside it", () => {
    const groups = groupByRisk([safe, severeComedogenic, unrecognised]);
    expect(groups.clean).toEqual([safe]);
    expect(groups.avoid).toEqual([severeComedogenic]);
    expect(groups.unknown).toEqual([unrecognised]);
  });

  /**
   * A name we cannot identify supports no claim in either direction, so it
   * must not raise a warning any more than it may suppress one.
   */
  it("raises no contraindication from an unrecognised name", () => {
    const dangerousLooking: Ingredient = { ...unrecognised, safety: "avoid", comedogenic: 5 };
    expect(contraindications([dangerousLooking], profile({ concerns: ["acne-prone"] }))).toEqual(
      []
    );
  });

  it("still contraindicates the same ingredient once it is verified", () => {
    const verified: Ingredient = {
      ...unrecognised,
      safety: "avoid",
      comedogenic: 5,
      verified: true,
    };
    expect(contraindications([verified], profile())).toHaveLength(1);
  });
});
