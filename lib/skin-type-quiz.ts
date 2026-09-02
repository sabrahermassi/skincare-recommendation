import type { BaseSkinType } from "@/data/types";

/**
 * The two-question fallback behind "Not sure" on the skin-type step.
 *
 * This is the ordinary bare-faced self-assessment every skincare guide runs —
 * how the barrier feels a few hours after cleansing, and where oil shows up by
 * evening — not a diagnosis, and the screen says so. It exists because "I
 * don't know my skin type" is the honest answer for most people, and the
 * alternative is a guessed `baseSkinType` silently steering every match score.
 *
 * The pair resolves through an explicit 4x4 table rather than a scoring
 * heuristic: sixteen outcomes is few enough to state, and stating them is what
 * makes them reviewable. `__tests__/skin-type-quiz.test.ts` pins all sixteen.
 */

/** How the skin feels a few hours after washing, with nothing applied. */
export type BarrierAnswer = "tight" | "comfortable" | "mixed" | "oily";

/** Where the face looks shiny by the end of the day. */
export type ShineAnswer = "none" | "slight" | "tzone" | "allover";

export type QuizAnswers = { barrier: BarrierAnswer; shine: ShineAnswer };

export const BARRIER_QUESTION = {
  prompt: "A few hours after washing, with nothing applied, how does your skin feel?",
  options: [
    { value: "tight", label: "Tight or flaky", hint: "All over, not just in patches" },
    { value: "comfortable", label: "Comfortable", hint: "No tightness, no shine yet" },
    { value: "mixed", label: "Tight on the cheeks only", hint: "Nose and forehead feel fine" },
    { value: "oily", label: "Shine is already back", hint: "Within two or three hours" },
  ] satisfies { value: BarrierAnswer; label: string; hint: string }[],
} as const;

export const SHINE_QUESTION = {
  prompt: "By the end of the day, where does your face look shiny?",
  options: [
    { value: "none", label: "Nowhere", hint: "Matte, or looking a little dull" },
    { value: "slight", label: "A faint sheen", hint: "Fairly even across the face" },
    { value: "tzone", label: "Nose and forehead", hint: "Cheeks stay matte" },
    { value: "allover", label: "Everywhere", hint: "Including the cheeks" },
  ] satisfies { value: ShineAnswer; label: string; hint: string }[],
} as const;

/**
 * Rows are the barrier answer, columns the shine answer.
 *
 * Two cells are worth explaining, because they are the ones that look wrong:
 *
 * - `tight` + `allover` is **combination**, not oily. Tight after cleansing and
 *   shiny by evening is dehydrated-but-oily skin; the barrier still needs
 *   support, and treating it as plainly oily is how people end up stripping it
 *   further. There is no "dehydrated" base type — that is a `Concern` — so
 *   combination is the closest honest answer.
 * - `oily` + `none` is the one genuinely self-contradicting pair (shine back
 *   within hours, yet nothing to see by evening). It resolves to **normal**,
 *   the answer that changes the fewest scores, rather than picking a side.
 */
const TABLE: Record<BarrierAnswer, Record<ShineAnswer, BaseSkinType>> = {
  tight: { none: "dry", slight: "dry", tzone: "combination", allover: "combination" },
  comfortable: { none: "dry", slight: "normal", tzone: "combination", allover: "oily" },
  mixed: { none: "dry", slight: "combination", tzone: "combination", allover: "oily" },
  oily: { none: "normal", slight: "normal", tzone: "combination", allover: "oily" },
};

export function deriveSkinType({ barrier, shine }: QuizAnswers): BaseSkinType {
  return TABLE[barrier][shine];
}
