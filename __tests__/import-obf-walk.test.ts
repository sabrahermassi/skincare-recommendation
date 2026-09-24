import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  MAX_REQUESTS,
  PAGE_SIZE,
  TARGET_ROWS,
  dictionaryStamp,
  parseCheckpoint,
  resumeProblem,
  serialiseCheckpoint,
  stopMessage,
  writeAtomically,
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

// #265 review: a checkpoint must not be resumed against another project, or
// over rows parsed under a different dictionary or script, and a crash while
// saving it must not leave a half-written file.
describe("import:obf resume safety", () => {
  const saved = { target: "staging-ref", stamp: "abc:36000:25000" };

  it("resumes only against the project and stamp it was written with", () => {
    expect(resumeProblem(saved, "staging-ref", "abc:36000:25000")).toBeNull();
    expect(resumeProblem(saved, "prod-ref", "abc:36000:25000")).toMatch(/written against project staging-ref, not prod-ref/);
    expect(resumeProblem(saved, "staging-ref", "abc:36100:25000")).toMatch(/different dictionary or version/);
  });

  // #265 review round 2: counts alone miss a corrected mapping.
  it("stamps the dictionary by content, so a corrected mapping with the same count still changes it", () => {
    const known = new Set(["aqua", "glycerin"]);
    const stamp = dictionaryStamp(known, new Map([["water", "aqua"]]));
    expect(dictionaryStamp(new Set(["glycerin", "aqua"]), new Map([["water", "aqua"]]))).toBe(stamp);
    expect(dictionaryStamp(known, new Map([["water", "glycerin"]]))).not.toBe(stamp);
    expect(dictionaryStamp(new Set(["aqua", "glycerine"]), new Map([["water", "aqua"]]))).not.toBe(stamp);
  });

  it("replaces the file whole, leaving no temp copy behind", () => {
    const path = join(mkdtempSync(join(tmpdir(), "obf-")), "checkpoint.json");
    writeFileSync(path, "old");
    writeAtomically(path, "new");
    expect(readFileSync(path, "utf8")).toBe("new");
    expect(existsSync(`${path}.tmp`)).toBe(false);
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
