// The dictionary-coverage gate's denominator, made fair to a label the
// dictionary cannot yet speak the language of (#185; full Korean coverage is
// #201, which has not run anywhere as of this ticket).
//
// Split out of `label-ocr/index.ts` for the same reason `read-token.ts` is
// its own file: it imports nothing and touches no Deno global, so Jest can
// exercise the exact logic Deno runs, rather than a hand-copy of it.

/**
 * Whether `name` (already `normalise`d, so lowercase) contains a CJK
 * character — Hangul, Hiragana, Katakana or Han. Used only to decide what
 * the dictionary-coverage gate can fairly judge; it is not a language
 * detector and does not need to be one.
 */
export function isNonLatinName(name: string): boolean {
  return /\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/u.test(name);
}

/**
 * `MIN_KNOWN_INGREDIENT_RATIO`'s denominator.
 *
 * The dictionary is Latin-only today. Widening the parser to keep Hangul/kana
 * names (see `normalise` and `parseIngredientBlock`'s delimited-path filter
 * in `lib/inci.ts` / `label-ocr/index.ts`) grows the parsed count without
 * growing the resolved count — so a straight `known / parsed` would turn "we
 * widened the parser" into "a label that passed this gate yesterday fails it
 * today", which is a regression on the primary scan path, not an improvement
 * to it.
 *
 * So an unresolved non-Latin name is excluded from *both* sides of the
 * ratio: it was never going to resolve against a Latin-only dictionary, and
 * judging read quality by a language the dictionary cannot answer for isn't
 * measuring what this gate exists to measure. A *resolved* non-Latin name
 * (once #201 lands) still counts normally on both sides — `known` already
 * only holds resolved names, so nothing here has to special-case that.
 *
 * A label that is entirely non-Latin and entirely unresolved has nothing left
 * to judge (`judgeable.length === 0`) and correctly still fails the gate —
 * that is the honest, expected outcome for a Korean-only label before #201,
 * not a bug this function needs to paper over.
 */
export function gateRatio(parsed: readonly { inci_name: string }[], known: ReadonlySet<string>): number {
  const judgeable = parsed.filter((p) => known.has(p.inci_name) || !isNonLatinName(p.inci_name));
  if (judgeable.length === 0) return 0;
  return known.size / judgeable.length;
}
