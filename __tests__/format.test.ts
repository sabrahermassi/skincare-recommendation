import {
  comedogenicLabel,
  formatKRW,
  relativeTime,
  SAFETY_LABEL,
} from "@/lib/format";

describe("formatKRW", () => {
  it("groups thousands and prefixes the won sign", () => {
    expect(formatKRW(28000)).toBe("₩28,000");
  });

  it("handles small and large amounts", () => {
    expect(formatKRW(900)).toBe("₩900");
    expect(formatKRW(1234567)).toBe("₩1,234,567");
  });
});

describe("comedogenicLabel", () => {
  it("distinguishes every band", () => {
    expect(comedogenicLabel(0)).toBe("Won't clog pores");
    expect(comedogenicLabel(2)).toMatch(/Low/);
    expect(comedogenicLabel(3)).toMatch(/Moderate/);
    expect(comedogenicLabel(5)).toMatch(/High/);
  });

  it("agrees with the flag threshold: 2 is low, 3 is not", () => {
    expect(comedogenicLabel(2)).toMatch(/Low/);
    expect(comedogenicLabel(3)).not.toMatch(/Low/);
  });
});

describe("SAFETY_LABEL", () => {
  it("covers every safety level", () => {
    expect(Object.keys(SAFETY_LABEL).sort()).toEqual(["avoid", "caution", "safe"]);
  });
});

describe("relativeTime", () => {
  const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
  const ago = (ms: number) => relativeTime(NOW - ms, NOW);

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it("collapses anything under a minute", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(59 * SECOND)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(ago(5 * MINUTE)).toBe("5 min ago");
    expect(ago(3 * HOUR)).toBe("3 hours ago");
    expect(ago(4 * DAY)).toBe("4 days ago");
  });

  it("singularises the units that need it", () => {
    expect(ago(HOUR)).toBe("1 hour ago");
    expect(ago(DAY)).toBe("yesterday");
    expect(ago(7 * DAY)).toBe("1 week ago");
  });

  it("gets vaguer the further back it goes", () => {
    expect(ago(21 * DAY)).toBe("3 weeks ago");
    expect(ago(90 * DAY)).toBe("3 months ago");
  });

  /** Clock skew between devices shouldn't produce "in -3 minutes". */
  it("never reports a future timestamp as negative", () => {
    expect(relativeTime(NOW + 10 * MINUTE, NOW)).toBe("just now");
  });
});
