import type { ProductType } from "@/data/types";

/**
 * Routine-step tagging (#227): where a saved product belongs — not when to
 * use it. No morning/evening, no order, no reminders; that is a routine
 * builder, and `FOR_ME_MVP.md` keeps it out.
 */

/** The three steps a person can put a product in. */
export type RoutineStep = 1 | 2 | 3;

/**
 * Every shelf group. Two kinds of "no step" are kept apart on purpose, as
 * #227 asks:
 *
 * - `body` — typed correctly, just not part of a face routine: a hand cream,
 *   a shampoo. Nothing to sort, so nothing to invite.
 * - `unsorted` — we couldn't tell what the product is (`unknown`). That is a
 *   gap, and its group invites the person to pick a step.
 */
export type StepGroup = RoutineStep | "body" | "unsorted";

/**
 * The guess from a product's type. A `Record`, so adding a `ProductType`
 * fails the build until someone decides where it goes — no fallback branch
 * for a new type to fall silently into.
 */
export const TYPE_STEP: Record<ProductType, StepGroup> = {
  cleanser: 1,
  "micellar-water": 1,

  toner: 2,
  essence: 2,
  serum: 2,
  ampoule: 2,
  exfoliator: 2,
  "facial-mist": 2,
  "sheet-mask": 2,
  "face-mask": 2,
  "eye-patch": 2,
  "pimple-patch": 2,
  "eye-cream": 2,

  moisturizer: 3,
  "facial-oil": 3,
  "night-mask": 3,
  sunscreen: 3,
  "lip-balm": 3,

  "body-wash": "body",
  "body-lotion": "body",
  "body-butter": "body",
  "body-scrub": "body",
  "hand-cream": "body",
  "foot-cream": "body",
  deodorant: "body",
  perfume: "body",
  shampoo: "body",
  conditioner: "body",
  "hair-oil": "body",
  "hair-mask": "body",

  unknown: "unsorted",
};

export const STEP_LABEL: Record<StepGroup, string> = {
  1: "Cleanse",
  2: "Treat",
  3: "Moisturize & protect",
  body: "Body & hair",
  unsorted: "Not sorted",
};

/** The order the filter pills and the picker show the groups in. */
export const STEP_ORDER: readonly StepGroup[] = [1, 2, 3, "body", "unsorted"];

/**
 * Where a saved product sits: the person's own choice when they made one,
 * otherwise the guess from its type. Read live, so a product whose type is
 * corrected later moves with the correction — unless the person chose,
 * which a type change never overrides.
 */
export function stepOf(type: ProductType, chosen: RoutineStep | undefined): StepGroup {
  return chosen ?? TYPE_STEP[type];
}
