import { shrinkWidth } from "@/lib/crop-to-guide";
import { shouldPop } from "@/components/PopOnToggle";

describe("shouldPop", () => {
  it("pops when switched on", () => {
    expect(shouldPop(false, true, false)).toBe(true);
  });
  it("does not pop on first render of something already on, or when switched off", () => {
    expect(shouldPop(true, true, false)).toBe(false);
    expect(shouldPop(true, false, false)).toBe(false);
    expect(shouldPop(false, false, false)).toBe(false);
  });
  it("does not pop with Reduce Motion on", () => {
    expect(shouldPop(false, true, true)).toBe(false);
  });
});

describe("shrinkWidth", () => {
  it("leaves a small enough picture alone", () => {
    expect(shrinkWidth(1500, 2000)).toBeNull();
    expect(shrinkWidth(2000, 2000)).toBeNull();
  });
  it("shrinks a wider one to the maximum", () => {
    expect(shrinkWidth(4032, 2000)).toBe(2000);
  });
});
