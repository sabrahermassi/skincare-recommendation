import { readFileSync } from "node:fs";
import { join } from "node:path";

import { functionSignal } from "@/lib/rules";
import { ANCHORS, SCORED_FUNCTIONS, checkFunctionTags } from "../scripts/audit-function-tags.mjs";

const row = (inci_name: string, functions: string[] | null, source = "cosing") => ({ inci_name, functions, source });

describe("the scored function list", () => {
  it("is exactly the table lib/rules.ts scores", () => {
    const source = readFileSync(join(__dirname, "..", "lib", "rules.ts"), "utf8");
    const block = source.slice(source.indexOf("const FUNCTION_SIGNALS"));
    const keys = [...block.slice(0, block.indexOf("};")).matchAll(/^\s+"?([a-z-]+)"?:\s*\{\s*category/gm)].map((m) => m[1]);
    expect([...SCORED_FUNCTIONS].sort()).toEqual([...keys].sort());
  });

  it("all resolve to a signal", () => {
    for (const tag of SCORED_FUNCTIONS) expect(functionSignal(tag)).toBeDefined();
  });

  it("covers every tag an anchor expects", () => {
    for (const [, expected] of ANCHORS) expect(SCORED_FUNCTIONS).toContain(expected);
  });

  // #175: both describe protecting the product, not the skin, so neither is
  // skin-benefit evidence.
  it("scores neither a formula antioxidant nor a product UV absorber", () => {
    expect(functionSignal("antioxidant")).toBeUndefined();
    expect(functionSignal("UV absorber")).toBeUndefined();
    expect(functionSignal("uv-filter")).toBeDefined();
  });
});

describe("checkFunctionTags", () => {
  it("counts the rows carrying each scored tag, once per row, whatever the spelling", () => {
    const result = checkFunctionTags([
      row("a", ["humectant", "humectant"]),
      row("b", ["Humectant", "skin protecting"]),
      row("c", ["en:humectant"]),
    ]);
    expect(result.scoredCounts.humectant).toBe(3);
    expect(result.scoredCounts["skin-protecting"]).toBe(1);
  });

  it("names a scored tag that no row carries", () => {
    const result = checkFunctionTags([row("a", ["humectant"])]);
    expect(result.neverFire).not.toContain("humectant");
    expect(result.neverFire).toContain("tonic");
  });

  it("finds a stored tag that is a misspelling of a scored one, biggest first", () => {
    const result = checkFunctionTags([
      row("a", ["moisturizing"]),
      row("b", ["moisturizing"]),
      row("c", ["humectants"]),
      row("d", ["skin-conditioning", "perfuming", "surfactant"]),
    ]);
    expect(result.nearMisses).toEqual([
      { tag: "moisturizing", near: "moisturising", rows: 2 },
      { tag: "humectants", near: "humectant", rows: 1 },
    ]);
  });

  it("does not call one scored tag a misspelling of another", () => {
    const result = checkFunctionTags([row("a", ["smoothing", "soothing"])]);
    expect(result.nearMisses).toEqual([]);
  });

  it("counts rows with no functions, per source", () => {
    const result = checkFunctionTags([row("a", null), row("b", []), row("c", [], "obf"), row("d", ["humectant"])]);
    expect(result.noFunctions).toEqual({ cosing: 2, obf: 1 });
  });

  it("counts stored tags that are not in the normalised spelling", () => {
    const result = checkFunctionTags([row("a", ["skin conditioning", "humectant", "en:tonic"])]);
    expect(result.unnormalised).toBe(2);
  });

  it("finds a well-known ingredient that is absent or lacks its tag", () => {
    const result = checkFunctionTags([
      row("glycerin", ["humectant"]),
      row("urea", ["buffering"]),
      row("sodium hyaluronate", ["Humectant"]),
    ]);
    const problems = Object.fromEntries(result.anchorProblems.map((p) => [p.inci_name, p.found]));
    expect(problems.urea).toBe("missing");
    expect(problems.allantoin).toBe("absent");
    expect(problems.glycerin).toBeUndefined();
    expect(problems["sodium hyaluronate"]).toBeUndefined();
  });
});
