import { anotherTip, TIPS, tipOfTheDay } from "@/lib/tips";

/** Tip of the day (v7): the day's tip to start, the same for everyone; a tap shuffles to another. */
describe("tipOfTheDay", () => {
  it("keeps the same tip all day, and moves to the next one the next day", () => {
    const morning = new Date(2026, 8, 29, 7, 0);
    const night = new Date(2026, 8, 29, 23, 30);
    const tomorrow = new Date(2026, 8, 30, 7, 0);
    expect(tipOfTheDay(morning)).toBe(tipOfTheDay(night));
    const today = TIPS.indexOf(tipOfTheDay(morning));
    expect(TIPS.indexOf(tipOfTheDay(tomorrow))).toBe((today + 1) % TIPS.length);
  });

  it("goes through every tip before any comes back", () => {
    const seen = new Set(Array.from({ length: TIPS.length }, (_, i) => tipOfTheDay(new Date(2026, 0, 1 + i, 12))));
    expect(seen.size).toBe(TIPS.length);
  });

  it("keeps every tip short enough for the card", () => {
    for (const tip of TIPS) expect(tip.length).toBeLessThanOrEqual(90);
  });
});

describe("anotherTip", () => {
  it("never picks the tip already showing, whatever the draw", () => {
    const current = TIPS[3];
    for (const draw of [0, 0.1, 0.5, 0.999999]) {
      const next = anotherTip(current, () => draw);
      expect(next).not.toBe(current);
      expect(TIPS).toContain(next);
    }
  });
});
