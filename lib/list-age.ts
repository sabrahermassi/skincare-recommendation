import type { ProductWithIngredients } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { safetyNoticeHits } from "@/lib/safety";

/**
 * How old a barcode result's ingredient list may be, and what the product
 * screen says about it (#446).
 *
 * A barcode scan shows Open Beauty Facts' copy of the list, which can be years
 * old; a label scan reads the bottle in the person's hand. `fetchedAt` cannot
 * tell the two apart, since it is only when we last read the row. The date
 * that follows the formula is when the list was photographed
 * (`ingredientsPhotographedAt`), so that is what this reads.
 *
 * Only ever an explanation: nothing here changes a score.
 *
 * No age alone is a warning (owner, 7 October 2026). Nobody publishes how often
 * a cosmetic formula changes: brands reformulate irregularly (regulation,
 * supply, customer demand), and many products never change. So a cutoff of two
 * or three years would put a warning on most barcode results with nothing to
 * back it. The date is shown plainly, and only a list holding an EU ban the
 * owner has verified is called out. A list with no photo date says nothing.
 */

export type ListAgeNotice =
  /** The list holds an ingredient the EU safety notice applies to: the bottle in hand may no longer have it. */
  | { kind: "banned"; ingredient: string }
  /** The year the list was photographed: information, not a warning. */
  | { kind: "dated"; year: number };

/** The words, audited by `__tests__/claims-policy.test.ts`. */
export const LIST_AGE_COPY = {
  dated: (year: number) => `Ingredient list from ${year}.`,
  banned: (ingredient: string) => `This list contains ${ingredient}, which the EU has banned. Your bottle may have a newer formula.`,
  action: "Scan the label",
  toCheck: " to check.",
  actionHint: "Opens the label scan",
} as const;

/** The banned notice as the three parts the screen renders: the lead, the tappable words, the ending. */
export function listAgeText(notice: Extract<ListAgeNotice, { kind: "banned" }>): { lead: string; action: string; ending: string } {
  return { lead: LIST_AGE_COPY.banned(notice.ingredient), action: LIST_AGE_COPY.action, ending: LIST_AGE_COPY.toCheck };
}

/** The whole sentence, for a screen reader and for the claims audit. */
export function listAgeSentence(notice: ListAgeNotice): string {
  if (notice.kind === "dated") return LIST_AGE_COPY.dated(notice.year);
  const { lead, action, ending } = listAgeText(notice);
  return `${lead} ${action}${ending}`;
}

/**
 * Whether the row is Open Beauty Facts' copy. A row from a `product-lookup`
 * deployed before #446 carries no `source`, and its id says the same thing
 * (`obf-<barcode>`), which is the rule the catalogue cache already uses.
 */
function fromOpenBeautyFacts(product: Pick<ProductWithIngredients, "id" | "source">): boolean {
  return (product.source ?? product.id.split("-")[0]) === "obf";
}

/**
 * The notice for this product, or null: a label-scan or sample product, a list
 * with no photo date, or a row read before the date existed.
 *
 * `safetyNoticeOn` is the regulatory-safety flag (`lib/features.ts`). The
 * "banned" wording is a claim about the regulation, so it is made only for an
 * ingredient on the owner-verified list (`SAFETY_NOTICE_ENTRIES`), and only
 * while that notice itself is switched on. A dictionary `avoid` alone is not
 * enough: some are not EU bans at all, and some citations have been wrong.
 */
export function listAgeNotice(
  product: Pick<ProductWithIngredients, "id" | "source" | "ingredientsPhotographedAt" | "ingredients">,
  now: number,
  safetyNoticeOn: boolean
): ListAgeNotice | null {
  if (!fromOpenBeautyFacts(product)) return null;
  const photographedAt = product.ingredientsPhotographedAt;
  if (photographedAt === undefined) return null;

  const [hit] = safetyNoticeHits(product.ingredients, safetyNoticeOn);
  if (hit) return { kind: "banned", ingredient: displayIngredientName(hit.ingredient.name) };

  const photographed = photographedAt === null ? null : new Date(photographedAt);
  if (photographed === null || Number.isNaN(photographed.getTime()) || photographed.getTime() > now) return null;
  return { kind: "dated", year: photographed.getUTCFullYear() };
}
