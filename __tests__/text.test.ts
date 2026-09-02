import { namesOwnFontFamily } from "@/components/Text";

/**
 * Regression guard for a font bug that has now bitten twice, in opposite
 * directions.
 *
 * First: the Text wrapper merged its default `font-sans` into every
 * className. Tailwind emits `.font-display` before `.font-sans`, and for
 * equal specificity the later stylesheet rule wins no matter what order the
 * classes are written in — so every display title silently rendered in the
 * body face.
 *
 * Then: the body face became the OS system font, and the `sans: ["System"]`
 * token that expressed it emitted literal `font-family: System` into the web
 * stylesheet. That CSS class bypasses react-native-web's style compiler, so
 * the browser saw an unknown family and fell back to its default serif —
 * every screen's body copy in Times New Roman.
 *
 * The wrapper now names no family at all, and only the display face is ever
 * declared. This pins the predicate that recognises it.
 */
describe("namesOwnFontFamily", () => {
  it("detects the display family", () => {
    expect(namesOwnFontFamily("font-display text-2xl text-ink")).toBe(true);
    expect(namesOwnFontFamily("mt-1 font-display-medium leading-7")).toBe(true);
  });

  it("matches at either end of the string", () => {
    expect(namesOwnFontFamily("font-display")).toBe(true);
    expect(namesOwnFontFamily("text-xl font-display")).toBe(true);
    expect(namesOwnFontFamily("font-display text-xl")).toBe(true);
  });

  it("reports no family when none is named", () => {
    expect(namesOwnFontFamily(undefined)).toBe(false);
    expect(namesOwnFontFamily("")).toBe(false);
    expect(namesOwnFontFamily("text-sm text-ink-muted")).toBe(false);
  });

  it("does not mistake a weight-only utility for a family", () => {
    // `font-bold` sets fontWeight, not fontFamily.
    expect(namesOwnFontFamily("text-sm font-bold")).toBe(false);
    expect(namesOwnFontFamily("font-semibold")).toBe(false);
  });

  it("does not treat the body text as naming a family", () => {
    // `font-sans` is no longer a token this app defines or emits. If it ever
    // reappears in a className, that is the Times New Roman bug returning.
    expect(namesOwnFontFamily("text-sm font-sans")).toBe(false);
  });

  it("is not fooled by a partial word match", () => {
    expect(namesOwnFontFamily("notfont-display")).toBe(false);
    expect(namesOwnFontFamily("font-displayish")).toBe(false);
  });
});
