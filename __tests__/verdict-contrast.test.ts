import { CANVAS, SHEET, STONE, VERDICT, WARN, WHITE } from "@/lib/tokens";

/**
 * Fair's word and pill (6 October 2026 critique): the hand-off's `#C26E1E` read
 * 3.4-3.8:1 on the page, the tint and the sheet, and white on it as a pill
 * 3.8:1, under the 4.5:1 a 13-17pt word needs. Good's and Poor's words are the
 * hand-off's and sit below it too (3.1:1 and 4.39:1 on white); they are left
 * for the owner, so they are not asserted here.
 */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("Fair's orange", () => {
  it("is readable as a word on every surface it is set on", () => {
    for (const surface of [WHITE, SHEET, CANVAS, STONE, VERDICT.medium.tint]) {
      expect(contrast(VERDICT.medium.deep, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("is readable as a pill with a white label", () => {
    expect(contrast(WHITE, VERDICT.medium.deep)).toBeGreaterThanOrEqual(4.5);
  });

  it("is the warning colour too, so a caution reads as well as a verdict", () => {
    expect(WARN).toBe(VERDICT.medium.deep);
  });
});
