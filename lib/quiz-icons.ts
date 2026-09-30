import type { BaseSkinType, Concern, Pregnancy, Sensitivity } from "@/data/types";

/**
 * The small watercolour icon for each skin-quiz answer
 * (`assets/illustrations/quiz/`), in one place: the quiz tiles and the Skin
 * profile rows (v7) show the same picture for the same answer.
 */
export const CONCERN_ICON = {
  dehydrated: require("@/assets/illustrations/quiz/concern-dehydrated.png"),
  dullness: require("@/assets/illustrations/quiz/concern-dullness.png"),
  "acne-prone": require("@/assets/illustrations/quiz/concern-acne.png"),
  hyperpigmentation: require("@/assets/illustrations/quiz/concern-dark-spots.png"),
  "large-pores": require("@/assets/illustrations/quiz/concern-large-pores.png"),
  "fine-lines": require("@/assets/illustrations/quiz/concern-fine-lines.png"),
  redness: require("@/assets/illustrations/quiz/concern-redness.png"),
  "post-acne-marks": require("@/assets/illustrations/quiz/concern-post-acne.png"),
} satisfies Partial<Record<Concern, number>>;

/** A concern's icon; none for one the quiz no longer offers (`atopic`). */
export function concernIcon(concern: Concern): number | undefined {
  return (CONCERN_ICON as Partial<Record<Concern, number>>)[concern];
}

export const SKIN_TYPE_ICON: Record<BaseSkinType, number> = {
  dry: require("@/assets/illustrations/quiz/skin-dry.png"),
  oily: require("@/assets/illustrations/quiz/skin-oily.png"),
  combination: require("@/assets/illustrations/quiz/skin-combination.png"),
  normal: require("@/assets/illustrations/quiz/skin-normal.png"),
};

export const SENSITIVITY_ICON: Record<Sensitivity, number> = {
  none: require("@/assets/illustrations/quiz/sensitivity-none.png"),
  some: require("@/assets/illustrations/quiz/sensitivity-some.png"),
  high: require("@/assets/illustrations/quiz/sensitivity-high.png"),
};

/** "No concerns", and "No" to pregnancy. */
export const NONE_ICON: number = require("@/assets/illustrations/quiz/concern-none.png");
/** "I don't know", and a question not answered yet. */
export const UNSURE_ICON: number = require("@/assets/illustrations/quiz/unsure.png");

export const PREGNANCY_ICON = {
  pregnant: require("@/assets/illustrations/quiz/pregnancy-pregnant.png"),
  breastfeeding: require("@/assets/illustrations/quiz/pregnancy-breastfeeding.png"),
  neither: NONE_ICON,
} satisfies Partial<Record<Pregnancy, number>>;
