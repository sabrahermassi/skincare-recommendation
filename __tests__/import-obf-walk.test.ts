import {
  MAX_REQUESTS,
  PAGE_SIZE,
  TARGET_ROWS,
  parseCheckpoint,
  serialiseCheckpoint,
  stopMessage,
} from "../scripts/import-obf.mjs";

/**
 * The import's walk limits and resume file (#180): the caps are raised
 * together, a stopped run says which limit it hit, and a checkpoint survives
 * a round trip through JSON.
 */
describe("import:obf walk limits", () => {
  it("keeps the request budget a malfunction bound, well above what a full run needs", () => {
    expect(TARGET_ROWS).toBeGreaterThanOrEqual(1_000);
    expect(MAX_REQUESTS * PAGE_SIZE).toBeGreaterThanOrEqual(2 * TARGET_ROWS);
  });

  it("tells a request-budget stop apart from running out of categories", () => {
    const budget = stopMessage("budget", 1_200);
    const exhausted = stopMessage("exhausted", 1_200);
    expect(budget).toMatch(/request budget/);
    expect(budget).toMatch(/something is wrong/);
    expect(exhausted).toMatch(/every category was exhausted/);
    expect(exhausted).not.toEqual(budget);
  });

  it("says nothing when the run reached its target", () => {
    expect(stopMessage("target", TARGET_ROWS)).toBeNull();
  });
});

describe("import:obf checkpoint", () => {
  it("round-trips the walk state, maps included", () => {
    const state = {
      categoryIndex: 2,
      page: 4,
      pagesRead: 17,
      seen: 1_650,
      newestModifiedAt: 1_790_000_000,
      rows: new Map([["obf-1", { product: { id: "obf-1", name: "A" }, ingredients: [{ inci_name: "water", position: 1 }] }]]),
      rejected: new Map([["no ingredients", 3]]),
      stopReason: null,
      written: 0,
    };
    const restored = parseCheckpoint(serialiseCheckpoint(state));
    expect(restored).toEqual(state);
    expect(restored.rows).toBeInstanceOf(Map);
    expect(restored.rejected.get("no ingredients")).toBe(3);
  });
});
