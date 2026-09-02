import { Text as RNText, type TextProps } from "react-native";

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
export function Text(props: TextProps) {
  return <RNText {...props} />;
}
