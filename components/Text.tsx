import { createContext, useContext, type ReactNode } from "react";
import { StyleSheet, Text as RNText, useWindowDimensions, type TextProps } from "react-native";

import { FONT_SCALE, TYPE } from "@/lib/tokens";

/**
 * Matches our display-family utilities. Kept as a named export because it is
 * the predicate `Text` used to gate its default family on, and the reason the
 * display face renders at all is still worth pinning in a test.
 */
const FAMILY_CLASS = /(?:^|\s)font-display(?:-[a-z]+)?(?:\s|$)/;

export function namesOwnFontFamily(className: string | undefined): boolean {
  return className ? FAMILY_CLASS.test(className) : false;
}

/**
 * Whether the text below sits in the reading part of a screen (#334). See
 * `ReadingScale`.
 */
const ReadingScope = createContext(false);

/**
 * Wraps the part of a screen people actually read — the product page's
 * verdict and reasons, an ingredient's explanation, a label's result — so its
 * text can follow the phone's text size all the way up (`FONT_SCALE.reading`)
 * instead of stopping at 1.5×. Everywhere else keeps the #314 ceilings, and so
 * does a control inside the scope that passes its own `maxFontSizeMultiplier`
 * (a button label, the number in the score ring).
 */
export function ReadingScale({ children }: { children: ReactNode }) {
  return <ReadingScope.Provider value>{children}</ReadingScope.Provider>;
}

/**
 * True once the phone's text size has passed the ordinary ceiling — the point
 * where a `ReadingScale`'s side-by-side layouts (the score ring beside its
 * verdict, the two risk cards) stop fitting and stack instead.
 */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale > FONT_SCALE.ui;
}

/**
 * How far to grow an icon drawn beside text of this size (a reason's +/− dot,
 * a chevron, a tick): as far as the text itself is grown right here, up to
 * `FONT_SCALE.icon`, so it stays visible next to large words without taking
 * their width. Never below 1: an icon keeps its drawn size at the smaller
 * text sizes.
 */
export function useIconScale(fontSize: number): number {
  const reading = useContext(ReadingScope);
  const { fontScale } = useWindowDimensions();
  const ceiling = reading ? Math.max(FONT_SCALE.ui, readingCeiling(fontSize)) : FONT_SCALE.ui;
  return Math.max(1, Math.min(fontScale, ceiling, FONT_SCALE.icon));
}

/**
 * How far to grow the score ring (#334). It is drawn to fit text at the
 * ordinary ceiling, so it grows only once the phone's text size passes that —
 * in step with it, up to `FONT_SCALE.icon` — and the score stays the thing
 * that stands out on the verdict panel rather than the smallest thing on it.
 */
export function useRingScale(): number {
  const { fontScale } = useWindowDimensions();
  return Math.min(Math.max(1, fontScale / FONT_SCALE.ui), FONT_SCALE.icon);
}

/**
 * The body face (v9): DM Sans, loaded in `app/_layout.tsx` as one family per
 * weight. A custom font has no weights of its own on iOS — asking a family
 * for `fontWeight: "600"` fakes bold or does nothing — so the weight a style
 * asks for picks the file instead, and the weight itself is dropped.
 */
const BODY_FAMILY: Record<string, string> = {
  "300": "DMSans_300Light",
  "400": "DMSans_400Regular",
  "500": "DMSans_500Medium",
  "600": "DMSans_600SemiBold",
  "700": "DMSans_700Bold",
};
const WEIGHT_CLASS: Record<string, string> = { light: "300", normal: "400", medium: "500", semibold: "600", bold: "700" };

/** The DM Sans file for a weight, rounded to the nearest one loaded. */
export function bodyFamily(weight: string | number | undefined, italic = false): string {
  const w = weight === "bold" ? 700 : weight === "normal" || weight === undefined ? 400 : Number(weight);
  const nearest = String(Math.min(700, Math.max(300, Math.round((Number.isFinite(w) ? w : 400) / 100) * 100)));
  // Only the regular italic is loaded; nothing here sets a heavier one.
  return italic ? "DMSans_400Regular_Italic" : BODY_FAMILY[nearest];
}

/**
 * The style that sets text in DM Sans, or nothing when the text names its own
 * family (a display heading, the handwritten note) — those stay as they are.
 */
function bodyStyle(className: string | undefined, style: TextProps["style"]) {
  if (namesOwnFontFamily(className)) return undefined;
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return undefined;
  const fromClass = className?.match(/(?:^|\s)font-(light|normal|medium|semibold|bold)(?:\s|$)/)?.[1];
  const weight = flat.fontWeight ?? (fromClass ? WEIGHT_CLASS[fromClass] : undefined);
  return { fontFamily: bodyFamily(weight, flat.fontStyle === "italic"), fontWeight: "normal" as const, fontStyle: "normal" as const };
}

/**
 * A thin pass-through over RN's `Text` that sets body text in DM Sans (v9).
 *
 * The face is named on the element's `style`, never as a NativeWind class:
 * a family token emitted as a CSS class bypasses react-native-web's style
 * compiler, which once left every word of body copy in the browser's default
 * serif. Text that names its own family keeps it.
 */
export function Text({ className, maxFontSizeMultiplier, style, ...props }: TextProps) {
  const reading = useContext(ReadingScope);
  // `className` is named as a literal JSX attribute rather than left inside a
  // spread. NativeWind's transform reads it off the call site, and passing it
  // through `{...props}` is the shape it is least able to see — every style on
  // every piece of text in the app hangs off this one line, so it stays
  // explicit.
  //
  // The one thing the wrapper adds: a ceiling on how far the phone's text
  // size may grow this text (#314, `FONT_SCALE`), raised inside a
  // `ReadingScale` (#334). A caller that passes its own
  // `maxFontSizeMultiplier` keeps it.
  const body = bodyStyle(className, style);
  return (
    <RNText
      className={className}
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ??
        (reading ? readingFontScale(className, style) : defaultFontScale(className, style))
      }
      style={body ? [style, body] : style}
      {...props}
    />
  );
}

/** Display headings grow least; everything else gets the UI ceiling. */
export function defaultFontScale(className: string | undefined, style: TextProps["style"]): number {
  if (namesOwnFontFamily(className)) return FONT_SCALE.display;
  const family = StyleSheet.flatten(style)?.fontFamily;
  return typeof family === "string" && DISPLAY_FAMILY.test(family) ? FONT_SCALE.display : FONT_SCALE.ui;
}

/**
 * Inside a `ReadingScale`: every piece of text may grow until it reaches the
 * size body text reaches at the top of the range, and no further — so small
 * and body text follow the phone all the way, while a heading stops level
 * with them rather than growing to three times their size. Never below the
 * ordinary ceiling, so nothing here is smaller than it is elsewhere.
 */
export function readingFontScale(className: string | undefined, style: TextProps["style"]): number {
  return Math.max(defaultFontScale(className, style), readingCeiling(fontSizeOf(className, style)));
}

/** The multiple that brings text of this size to where body text stops. */
function readingCeiling(fontSize: number): number {
  return (TYPE.body * FONT_SCALE.reading) / fontSize;
}

/**
 * The size a piece of text is set in, from its style or its className —
 * most text here is styled inline, the rest with `text-[Npx]` or a type
 * token. Unknown reads as body text, the common case.
 */
function fontSizeOf(className: string | undefined, style: TextProps["style"]): number {
  const fromStyle = StyleSheet.flatten(style)?.fontSize;
  if (typeof fromStyle === "number") return fromStyle;
  const arbitrary = className?.match(/(?:^|\s)text-\[(\d+(?:\.\d+)?)px\]/);
  if (arbitrary) return Number(arbitrary[1]);
  const token = className?.match(/(?:^|\s)text-(caption|label|body|title|heading|display)(?:\s|$)/);
  if (token) return TYPE[token[1] as keyof typeof TYPE];
  return TYPE.body;
}

/** The loaded display face (`app/_layout.tsx`); body text is DM Sans. */
const DISPLAY_FAMILY = /^InstrumentSerif_/;
