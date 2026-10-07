import {
  HAZARD_EXTRA_PENALTY,
  HAZARD_SCORE_CAP,
  MIN_COVERAGE,
  MIN_IDENTIFIED,
  SCORE_BANDS,
} from "@/lib/matching";
import type { Verdict } from "@/lib/matching";
import { VERDICT_LABEL } from "@/lib/tokens";

/**
 * The words on "How scoring works" (`app/scoring.tsx`, #325), built from the
 * constants the score itself uses — never restated by hand, so the page can't
 * drift from the maths (`__tests__/scoring-explainer.test.ts` holds it to
 * them). Plain English in the app's voice (`docs/voice.md`), and inside the
 * claims policy: nothing here promises a result.
 */

export type ScoreBandLine = {
  verdict: Exclude<Verdict, "unknown">;
  /** Lowest and highest score in the band, both included. */
  from: number;
  to: number;
  range: string;
  label: string;
  meaning: string;
};

/** "90 to 100 · Excellent match", down to "0 to 59 · Poor match". */
export function scoreBandLines(): ScoreBandLine[] {
  const { excellent, good, fair } = SCORE_BANDS;
  const band = (verdict: ScoreBandLine["verdict"], from: number, to: number, meaning: string): ScoreBandLine => ({
    verdict,
    from,
    to,
    range: `${from} to ${to}`,
    label: VERDICT_LABEL[verdict],
    meaning,
  });
  return [
    band("excellent", excellent, 100, "One of the better matches for your skin"),
    band("good", good, excellent - 1, "Looks like a good fit for your skin"),
    band("fair", fair, good - 1, "Could work, with a caveat or two"),
    band("poor", 0, fair - 1, "Probably not the right pick for you"),
  ];
}

export type ScoreFactor = { sign: "+" | "−" | "?"; title: string; body: string };

/** "What goes into it": what raises the score, what lowers it, what doesn't count. */
export function scoreFactors(): ScoreFactor[] {
  return [
    { sign: "+", title: "Raises it", body: "Ingredients that help your concerns or suit your skin type." },
    {
      sign: "−",
      title: "Lowers it",
      body: `Ingredients that may irritate, more so if your skin reacts, or clog pores. A hazard caps the score at ${HAZARD_SCORE_CAP}, and each further one takes ${HAZARD_EXTRA_PENALTY} off.`,
    },
    { sign: "?", title: "Doesn't count", body: "Ingredients we don't know yet. We still show them." },
  ];
}

export const LABEL_ORDER = "Labels list ingredients from most to least, so the ones near the top count the most.";

export type ScoreNote = { kind: "pregnancy" | "no-score" | "personal"; title: string; body: string };

export function scoreNotes(): ScoreNote[] {
  const quarter = MIN_COVERAGE === 0.25 ? "a quarter" : `${Math.round(MIN_COVERAGE * 100)}%`;
  return [
    {
      kind: "pregnancy",
      title: "Pregnancy warnings",
      body: "If you said you're pregnant or breastfeeding, they're shown apart from the score and never hidden. They don't change it.",
    },
    {
      kind: "no-score",
      title: "Sometimes there is no score",
      body: `When we recognise fewer than ${MIN_IDENTIFIED} of its ingredients, or under ${quarter} of them, or you haven't set up a skin profile yet. We still show what's in it.`,
    },
    { kind: "personal", title: "It's about you", body: "The same product can score differently for someone else." },
  ];
}

/** The sheet's first line (v9, the hand-off's words). */
export const SCORING_INTRO = "Your score shows how well a product fits your skin profile.";

/** Where the ingredient facts come from (v9, the hand-off's words), said before the disclaimer. */
export const SCORING_SOURCES =
  "Every ingredient is checked against EU CosIng and published safety reviews. You'll find the sources on each ingredient's page.";

export const SCORING_DISCLAIMER =
  "No ads, no brand deals, no paid placements. Not medical advice: for a skin condition, see a dermatologist.";
