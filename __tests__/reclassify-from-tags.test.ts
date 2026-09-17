import { parseLimit, proposeChange } from "../scripts/reclassify-from-tags.mjs";

/**
 * The two decisions `reclassify-from-tags.mjs` makes that aren't I/O. It is
 * the only script allowed to overwrite a type that already looks right, so
 * the rule about what it will and won't write is worth pinning.
 */

describe("parseLimit", () => {
  it("defaults to no limit", () => {
    expect(parseLimit(["node", "script.mjs", "--dry-run"])).toBe(Infinity);
  });

  it("reads a positive whole number", () => {
    expect(parseLimit(["node", "script.mjs", "--limit", "60"])).toBe(60);
  });

  // The bug this replaced: `Number(undefined)` is NaN, `slice(0, NaN)` is
  // empty, and the run reported "0 candidates" as though all was well.
  it("refuses a missing, zero, negative or non-numeric value rather than silently doing nothing", () => {
    for (const argv of [
      ["node", "s.mjs", "--limit"],
      ["node", "s.mjs", "--limit", "0"],
      ["node", "s.mjs", "--limit", "-5"],
      ["node", "s.mjs", "--limit", "abc"],
      ["node", "s.mjs", "--limit", "2.5"],
    ]) {
      expect(() => parseLimit(argv)).toThrow(/positive whole number/);
    }
  });
});

describe("proposeChange", () => {
  const row = { id: "obf-1", brand: "B", name: "N", type: "sunscreen" };

  it("proposes a change when the fresh guess differs", () => {
    expect(proposeChange(row, "lip-balm")).toMatchObject({ id: "obf-1", type: "sunscreen", now: "lip-balm" });
  });

  it("proposes nothing when the guess agrees with what's stored", () => {
    expect(proposeChange(row, "sunscreen")).toBeNull();
  });

  it("never trades a real type for unknown", () => {
    // The row already carries a guess made from this same evidence; replacing
    // it with "unknown" is a regression, not a repair.
    expect(proposeChange(row, "unknown")).toBeNull();
  });

  it("does fill in a row that is currently unknown", () => {
    expect(proposeChange({ ...row, type: "unknown" }, "serum")).toMatchObject({ now: "serum" });
  });
});
