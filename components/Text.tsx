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
 * How much text of this size is actually grown right here — the phone's text
 * size, under whichever ceiling applies — so an icon drawn beside it (a
 * reason's +/− dot, a chevron) can grow with it instead of shrinking beside
 * it. Never below 1: an icon keeps its drawn size at the smaller text sizes.
 */
export function useTextScale(fontSize: number): number {
  const reading = useContext(ReadingScope);
  const { fontScale } = useWindowDimensions();
  const ceiling = reading ? Math.max(FONT_SCALE.ui, readingCeiling(fontSize)) : FONT_SCALE.ui;
  return Math.max(1, Math.min(fontScale, ceiling));
}

/**
 * A thin pass-through over RN's `Text`.
 *
 * It used to merge a default `font-sans` into every className, back when body
 * text was a loaded Google font (Plus Jakarta Sans) that genuinely had to be
 * named on every element. The design now sets body text in the OS UI font,
 * and naming *that* is actively harmful: NativeWind emits the token as a CSS
 * class, which bypasses react-native-web's style compiler — so the browser
 * received the literal, unknown family `System` and fell back to its default
 * serif. Every screen rendered its body copy in Times New Roman.
 *
 * Saying nothing is what produces the system font on all three platforms:
 * iOS falls to San Francisco, Android to Roboto, and RNW's own Text base
 * style (`font: 14px System`) *does* go through the compiler, which expands
 * it to the real `-apple-system, BlinkMacSystemFont, "Segoe UI", …` stack.
 *
 * The wrapper stays because every screen imports it, and because it is the
 * one place to reach if a body face is ever loaded again.
 */
export function Text({ className, maxFontSizeMultiplier, ...props }: TextProps) {
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
  return (
    <RNText
      className={className}
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ??
        (reading ? readingFontScale(className, props.style) : defaultFontScale(className, props.style))
      }
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

/** The loaded display faces (`app/_layout.tsx`); body text is the system font. */
const DISPLAY_FAMILY = /^(PlayfairDisplay|CormorantGaramond)_/;
