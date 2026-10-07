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
 */

/** A list photographed longer ago than this gets the notice. Brands change a formula every year or two. */
export const LIST_OLD_AFTER_YEARS = 2;

export type ListAgeNotice =
  /** The list holds an ingredient the EU safety notice applies to: the bottle in hand may no longer have it. */
  | { kind: "banned"; ingredient: string }
  /** Photographed more than `LIST_OLD_AFTER_YEARS` ago. */
  | { kind: "old"; year: number }
  /** The source has no photo of the list, so nothing says how old it is. */
  | { kind: "unknown" };

/**
 * The words, audited by `__tests__/claims-policy.test.ts`. Each notice is its
 * lead, then "Scan the label" (which opens the label scan), then its ending.
 */
export const LIST_AGE_COPY = {
  old: (year: number) => `This ingredient list was photographed in ${year}. The brand may have changed the formula since.`,
  unknown: "We don't know how old this ingredient list is.",
  banned: (ingredient: string) => `This list contains ${ingredient}, which the EU has banned. Your bottle may have a newer formula.`,
  action: "Scan the label",
  toCheckBottle: " to check your bottle.",
  toCheck: " to check.",
  actionHint: "Opens the label scan",
} as const;

/** A notice as the three parts the screen renders: the lead, the tappable words, the ending. */
export function listAgeText(notice: ListAgeNotice): { lead: string; action: string; ending: string } {
  const { action } = LIST_AGE_COPY;
  if (notice.kind === "banned") return { lead: LIST_AGE_COPY.banned(notice.ingredient), action, ending: LIST_AGE_COPY.toCheck };
  if (notice.kind === "old") return { lead: LIST_AGE_COPY.old(notice.year), action, ending: LIST_AGE_COPY.toCheckBottle };
  return { lead: LIST_AGE_COPY.unknown, action, ending: LIST_AGE_COPY.toCheckBottle };
}

/** The whole sentence, for a screen reader and for the claims audit. */
export function listAgeSentence(notice: ListAgeNotice): string {
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
 * The notice for this product, or null: a recent list, a label-scan or sample
 * product, or a row read before the date existed (unset is "nobody asked",
 * which is not the same as "unknown").
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
  if (photographed === null || Number.isNaN(photographed.getTime())) return { kind: "unknown" };

  const oldFrom = new Date(photographed);
  oldFrom.setUTCFullYear(oldFrom.getUTCFullYear() + LIST_OLD_AFTER_YEARS);
  return now > oldFrom.getTime() ? { kind: "old", year: photographed.getUTCFullYear() } : null;
}
