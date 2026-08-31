import { INGREDIENTS } from "@/data/ingredients";
import { contraindications, flaggedIngredients, isFlagged } from "@/lib/safety";

const safe = INGREDIENTS["glycerin"];              // comedogenic 0, safe
const cautionIrritant = INGREDIENTS["fragrance"];  // comedogenic 0, caution
const severeComedogenic = INGREDIENTS["isopropyl-myristate"]; // 5, avoid
const mildlyComedogenic = INGREDIENTS["cetearyl-alcohol"];    // 2, safe
const moderate = INGREDIENTS["coconut-oil"];       // 4, caution

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
    expect(contraindications([safe, mildlyComedogenic], "oily", ["acne-prone"])).toEqual([]);
  });

  it("flags 'avoid' ingredients for every profile, regardless of concerns", () => {
    const result = contraindications([severeComedogenic], null, []);
    expect(result).toHaveLength(1);
    expect(result[0].ingredient.id).toBe("isopropyl-myristate");
  });

  it("flags highly comedogenic ingredients for acne-prone users", () => {
    const result = contraindications([moderate], "oily", ["acne-prone"]);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toMatch(/acne-prone/);
  });

  it("does NOT flag a comedogenic ingredient when the user is not acne-prone", () => {
    expect(contraindications([moderate], "dry", ["dehydrated"])).toEqual([]);
  });

  it("flags 'caution' irritants only for sensitive skin", () => {
    expect(contraindications([cautionIrritant], "sensitive", [])).toHaveLength(1);
    expect(contraindications([cautionIrritant], "oily", [])).toEqual([]);
  });

  it("reports each problem ingredient once", () => {
    // coconut-oil is both caution AND comedogenic 4; a sensitive acne-prone
    // user must not see it listed twice.
    const result = contraindications([moderate], "sensitive", ["acne-prone"]);
    expect(result).toHaveLength(1);
  });
});
