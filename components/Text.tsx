import { Text as RNText, type TextProps } from "react-native";

/** Matches any of our fontFamily utilities: font-display[-bold], font-sans[-medium|-semibold|-bold]. */
const FAMILY_CLASS = /(?:^|\s)font-(?:display|sans)(?:-[a-z]+)?(?:\s|$)/;

/** Exported for test — this predicate is the whole reason the display face renders at all. */
export function namesOwnFontFamily(className: string | undefined): boolean {
  return className ? FAMILY_CLASS.test(className) : false;
}

/**
 * RN's Text has no browser-style cascading default font — every element needs
 * its own fontFamily. Routing every screen's `Text` import through here
 * applies the app's sans typeface by default, so only the four hero/logotype
 * spots have to opt into `font-display`.
 *
 * The default is applied *only* when the caller hasn't named a family of its
 * own. Merging both into one string does not work: Tailwind emits
 * `.font-display` before `.font-sans`, and for equal specificity the later
 * stylesheet rule wins regardless of the order the classes are written in —
 * so a blanket `font-sans` here silently overrode every display title.
 */
export function Text({ className, ...props }: TextProps) {
  return (
    <RNText
      className={namesOwnFontFamily(className) ? className : `font-sans ${className ?? ""}`}
      {...props}
    />
  );
}
