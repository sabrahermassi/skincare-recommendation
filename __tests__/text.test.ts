import { namesOwnFontFamily } from "@/components/Text";

/**
 * Regression guard for a silent bug: the Text wrapper used to merge its
 * default `font-sans` into every className. Tailwind emits `.font-display`
 * before `.font-sans`, and for equal specificity the later stylesheet rule
 * wins no matter what order the classes are written in — so every Fraunces
 * title silently rendered in Inter instead. The wrapper now steps aside
 * whenever the caller names a family, and this pins that predicate.
 */
describe("namesOwnFontFamily", () => {
  it("detects the display family, so Fraunces is never overridden", () => {
    expect(namesOwnFontFamily("font-display text-2xl text-ink")).toBe(true);
    expect(namesOwnFontFamily("mt-1 font-display-bold leading-7")).toBe(true);
  });

  it("detects every sans weight", () => {
    for (const cls of ["font-sans", "font-sans-medium", "font-sans-semibold", "font-sans-bold"]) {
      expect(namesOwnFontFamily(`text-sm ${cls} text-ink`)).toBe(true);
    }
  });

  it("matches at either end of the string", () => {
    expect(namesOwnFontFamily("font-display")).toBe(true);
    expect(namesOwnFontFamily("text-xl font-display")).toBe(true);
    expect(namesOwnFontFamily("font-display text-xl")).toBe(true);
  });

  it("lets the default apply when no family is named", () => {
    expect(namesOwnFontFamily(undefined)).toBe(false);
    expect(namesOwnFontFamily("")).toBe(false);
    expect(namesOwnFontFamily("text-sm text-ink-muted")).toBe(false);
  });

  it("does not mistake a weight-only utility for a family", () => {
    // `font-bold` sets fontWeight, not fontFamily — the default must still apply.
    expect(namesOwnFontFamily("text-sm font-bold")).toBe(false);
    expect(namesOwnFontFamily("font-semibold")).toBe(false);
  });

  it("is not fooled by a partial word match", () => {
    expect(namesOwnFontFamily("font-sanserif-ish")).toBe(false);
    expect(namesOwnFontFamily("notfont-display")).toBe(false);
  });
});
