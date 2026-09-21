import { GREETING_WIDTH, homeGreetingLayout, SIGNATURE_WIDTH } from "@/lib/home-greeting";

const GUTTER = 26;
const RIGHT = 22;
const layout = (screenWidth: number, fontScale = 1) => homeGreetingLayout({ screenWidth, fontScale, gutter: GUTTER, signatureRight: RIGHT });

/** Whether the two pictures share any horizontal space. */
function overlap(screenWidth: number, fontScale: number): boolean {
  const { greetingWidth, signatureWidth } = layout(screenWidth, fontScale);
  if (signatureWidth === null) return false;
  const greetingRight = GUTTER + greetingWidth;
  const signatureLeft = screenWidth - RIGHT - signatureWidth;
  return signatureLeft < greetingRight;
}

describe("homeGreetingLayout", () => {
  it("draws both at full size on an ordinary phone", () => {
    expect(layout(390)).toEqual({ greetingWidth: GREETING_WIDTH, signatureWidth: SIGNATURE_WIDTH });
  });

  it("shrinks the signature, rather than overlapping the greeting, on a narrow phone", () => {
    const narrow = layout(320);
    expect(narrow.signatureWidth).not.toBeNull();
    expect(narrow.signatureWidth as number).toBeLessThan(SIGNATURE_WIDTH);
  });

  it("grows the greeting with the text size, up to a limit", () => {
    expect(layout(430, 1.3).greetingWidth).toBeCloseTo(GREETING_WIDTH * 1.3);
    expect(layout(430, 3).greetingWidth).toBeCloseTo(GREETING_WIDTH * 1.5);
    expect(layout(430, 0.8).greetingWidth).toBe(GREETING_WIDTH);
  });

  it("leaves the signature out when the greeting has taken its room", () => {
    expect(layout(360, 1.5).signatureWidth).toBeNull();
  });

  it.each([
    [320, 1],
    [340, 1],
    [360, 1],
    [360, 1.3],
    [390, 1.15],
    [412, 1.5],
    [768, 1],
  ])("never overlaps at %dpt wide with font scale %d", (width: number, scale: number) => {
    expect(overlap(width, scale)).toBe(false);
  });
});
