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
 * How many unresolved non-Latin names `gateRatio` will exclude from its
 * denominator before it stops trusting them.
 *
 * Real cosmetic ingredient panels — Korean, Japanese or otherwise — do not
 * run to more names than this; formulas with unusually long lists (a
 * multi-step routine product, a compound extract naming a dozen species)
 * still land well under it. A count past this cap does not read as "a
 * detailed formula", it reads as boilerplate that leaked into the parsed
 * block — directions, cautions or a distributor notice the `stop` regex
 * didn't recognise as such — which is exactly the case
 * `MIN_KNOWN_INGREDIENT_RATIO`'s own comment warns about: "left in, both
 * degrade to junk fragments that dilute the recognised-ingredient ratio."
 * Found in review on #247: a first version of this exemption had no cap at
 * all, which let an unbounded run of misparsed CJK boilerplate exclude
 * itself from the ratio entirely — never penalised for being unresolved,
 * and never rejected, so it rode straight into `product_ingredients` as
 * stub rows via `saveProduct`.
 */
const MAX_EXEMPT_NON_LATIN = 40;

/**
 * How many names must actually be recognised before any exemption is
 * granted at all — independent of `MAX_EXEMPT_NON_LATIN`, which only bounds
 * volume.
 *
 * Found in review on #247, round two: the volume cap alone still let a
 * *small* amount of junk through at full confidence — one resolved Latin
 * ingredient plus a few unresolved CJK fragments (misparsed boilerplate the
 * `stop` regex missed) is comfortably under the volume cap, so all of it got
 * exempted and the ratio came out as 1.0 on a single real ingredient. Half
 * of `MIN_INGREDIENTS` (the floor a read has to clear before this gate ever
 * runs at all): enough independently-verified evidence that the read itself
 * was good before any of it is extended to content the dictionary can't
 * verify. Below this floor, nothing is exempted and an unresolved non-Latin
 * name counts against the ratio exactly like an unresolved Latin one always
 * has — which is also the correct, honest behaviour for a Korean-only label
 * that hasn't resolved a single name (see `gateRatio`'s own comment).
 */
const MIN_RESOLVED_TO_EXEMPT = 2;

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
 * ratio, up to `MAX_EXEMPT_NON_LATIN` of them: it was never going to resolve
 * against a Latin-only dictionary, and judging read quality by a language
 * the dictionary cannot answer for isn't measuring what this gate exists to
 * measure. A *resolved* non-Latin name (once #201 lands) still counts
 * normally on both sides — `known` already only holds resolved names, so
 * nothing here has to special-case that. Past the cap, an unresolved
 * non-Latin name counts against the ratio exactly like an unresolved Latin
 * one always has — see `MAX_EXEMPT_NON_LATIN`'s own comment for why that
 * line has to exist at all.
 *
 * A label that is entirely non-Latin and entirely unresolved has nothing left
 * to judge (`judgeable.length === 0`) and correctly still fails the gate —
 * that is the honest, expected outcome for a Korean-only label before #201,
 * not a bug this function needs to paper over.
 */
export function gateRatio(parsed: readonly { inci_name: string }[], known: ReadonlySet<string>): number {
  const canExempt = known.size >= MIN_RESOLVED_TO_EXEMPT;
  let exempted = 0;
  let judgeable = 0;
  for (const p of parsed) {
    if (known.has(p.inci_name)) {
      judgeable++;
      continue;
    }
    if (canExempt && isNonLatinName(p.inci_name) && exempted < MAX_EXEMPT_NON_LATIN) {
      exempted++;
      continue;
    }
    judgeable++;
  }
  if (judgeable === 0) return 0;
  return known.size / judgeable;
}
