import { SWIPE_MIN_DISTANCE, slideDirection, swipeDirection } from "@/lib/onboarding-slide";

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

describe("swipeDirection", () => {
  it("goes forward when the finger moves left far enough", () => {
    expect(swipeDirection(-SWIPE_MIN_DISTANCE, 0)).toBe(1);
  });

  it("goes back when the finger moves right far enough", () => {
    expect(swipeDirection(SWIPE_MIN_DISTANCE, 5)).toBe(-1);
  });

  it("ignores a tap and a short drag", () => {
    expect(swipeDirection(0, 0)).toBe(0);
    expect(swipeDirection(SWIPE_MIN_DISTANCE - 1, 0)).toBe(0);
  });

  it("ignores a drag that is mostly vertical", () => {
    expect(swipeDirection(-60, 80)).toBe(0);
  });
});
