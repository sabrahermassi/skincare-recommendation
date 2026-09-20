import { slideDirection } from "@/lib/onboarding-slide";

describe("slideDirection", () => {
  it("moves forward when the next screen is later", () => {
    expect(slideDirection(0, 1)).toBe(1);
    expect(slideDirection(1, 2)).toBe(1);
  });

  it("moves back when the next screen is earlier", () => {
    expect(slideDirection(2, 1)).toBe(-1);
    expect(slideDirection(1, 0)).toBe(-1);
  });
});
