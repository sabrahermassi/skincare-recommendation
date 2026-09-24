/**
 * What a user-added product may carry into the shared catalogue (#200).
 *
 * `label-ocr` saves a named product for everyone, permanently, from an
 * unauthenticated request — so a junk name sticks to that barcode for good.
 * These checks run there, where the write happens; a client-side copy would
 * guard nothing, since the endpoint takes any caller's JSON.
 *
 * Mechanical on purpose. No content filter stops a determined person; this
 * one stops accidents and low-effort junk. Like `gate-ratio.ts`, it imports
 * nothing and touches no Deno global, so Jest runs the exact code Deno does.
 */

export type ProductTextProblem = "url" | "control" | "punctuation" | "repetition";

// A scheme or "www.", or a dotted name ending in a common top-level domain.
// The TLD list is deliberately short: brand names do contain dots
// ("Dr.Jart+", "No.7"), and the only point is to catch a pasted link.
const URL_PATTERN =
  /(?:https?:\/\/|www\.)\S|[\p{L}\p{N}-]\.(?:com|net|org|io|co|kr|jp|cn|ru|uk|de|fr|xyz|info|biz|me|app|shop|store|link|site|online|top|ly|gg)(?![\p{L}\p{N}])/iu;

// C0/C1 controls, zero-width characters and bidirectional overrides — the
// last two make a name display differently from what it contains.
const CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/u;

// Six of one character in a row, or one word four times running. A real
// name can repeat a word or a letter, just not this much.
const REPEATED_CHARACTER = /(\S)\1{5,}/u;
const REPEATED_WORD = /(?:^|\s)([\p{L}\p{N}]+)(?:\s+\1){3,}(?=\s|$)/iu;

/** Why a product name or brand can't be saved, or null when it can. */
export function productTextProblem(text: string): ProductTextProblem | null {
  if (CONTROL_PATTERN.test(text)) return "control";
  if (URL_PATTERN.test(text)) return "url";
  if (!/[\p{L}\p{N}]/u.test(text)) return "punctuation";
  if (REPEATED_CHARACTER.test(text) || REPEATED_WORD.test(text)) return "repetition";
  return null;
}

/** How much of a name and a brand a save stores. */
export const MAX_NAME_CHARS = 200;
export const MAX_BRAND_CHARS = 120;

/**
 * `productTextProblem` on the part a save would actually store. `label-ocr`
 * runs this before its rate limiter, so it must never scan an unbounded
 * string — a multi-megabyte name would otherwise buy several full regex
 * passes for free (#266 review).
 */
export function savedTextProblem(field: "name" | "brand", value: string): ProductTextProblem | null {
  return productTextProblem(value.slice(0, field === "name" ? MAX_NAME_CHARS : MAX_BRAND_CHARS));
}

/** Trimmed, with runs of whitespace collapsed to one space — the form a brand is stored and matched in. */
export function tidySpacing(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * The spelling most of the catalogue already uses for one brand, so a single
 * odd row can't set it for everyone. Ties go to the first in plain code-point
 * order, which makes the pick the same on every run. Null for no spellings.
 */
export function mostCommonSpelling(spellings: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const spelling of spellings) counts.set(spelling, (counts.get(spelling) ?? 0) + 1);
  let best: string | null = null;
  for (const [spelling, count] of counts) {
    const bestCount = best === null ? 0 : counts.get(best)!;
    if (count > bestCount || (count === bestCount && best !== null && spelling < best)) best = spelling;
  }
  return best;
}

/** A value for a SQL `ILIKE` that matches `text` exactly, ignoring case — its wildcards escaped. */
export function exactIlikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Every `ProductType` in `data/types.ts`. A copy, because Deno can't import
 * the app's types; `__tests__/product-text.test.ts` fails if the two drift.
 */
export const PRODUCT_TYPES: readonly string[] = [
  "cleanser",
  "micellar-water",
  "toner",
  "essence",
  "serum",
  "ampoule",
  "moisturizer",
  "sunscreen",
  "body-wash",
  "body-lotion",
  "hand-cream",
  "eye-cream",
  "facial-oil",
  "night-mask",
  "exfoliator",
  "lip-balm",
  "perfume",
  "facial-mist",
  "sheet-mask",
  "deodorant",
  "shampoo",
  "conditioner",
  "hair-oil",
  "hair-mask",
  "body-butter",
  "body-scrub",
  "foot-cream",
  "face-mask",
  "eye-patch",
  "pimple-patch",
  "unknown",
];

/**
 * The type a save may store: the one the person picked, when it's a real
 * type, and "unknown" otherwise — including when they skipped the question.
 */
export function acceptedProductType(value: unknown): string {
  return typeof value === "string" && PRODUCT_TYPES.includes(value) ? value : "unknown";
}

/**
 * How many brand-new `ingredients` rows one save may create. Every name the
 * dictionary doesn't hold becomes a permanent stub, so a photo of a newspaper
 * could otherwise add dozens of junk names in one go.
 *
 * Sized so a legitimate long list is never refused. A Korean panel runs to
 * 40–60 names, and until #201 lands none of its Hangul names resolve: the
 * coverage gate already lets up to 40 of those through (`MAX_EXEMPT_NON_LATIN`
 * in `gate-ratio.ts`), and 60 leaves room for a third of its Latin names being
 * new as well.
 */
export const MAX_NEW_STUBS_PER_SAVE = 60;
