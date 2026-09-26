import { GREETING_WIDTH, homeGreetingWidth } from "@/lib/home-greeting";

describe("homeGreetingWidth", () => {
  it("grows the greeting with the text size, up to a limit", () => {
    expect(homeGreetingWidth(1)).toBe(GREETING_WIDTH);
    expect(homeGreetingWidth(1.3)).toBeCloseTo(GREETING_WIDTH * 1.3);
    expect(homeGreetingWidth(3)).toBeCloseTo(GREETING_WIDTH * 1.5);
  });

  it("never draws it smaller than its own size", () => {
    expect(homeGreetingWidth(0.8)).toBe(GREETING_WIDTH);
  });
});
