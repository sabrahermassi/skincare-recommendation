import { comedogenicLabel, formatKRW, SAFETY_LABEL } from "@/lib/format";

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
