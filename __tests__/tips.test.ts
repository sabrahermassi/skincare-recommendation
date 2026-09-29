import { TIPS, tipOfTheDay } from "@/lib/tips";

/** Tip of the day (v7): one tip per local day, the same for everyone, cycling through the list. */
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
