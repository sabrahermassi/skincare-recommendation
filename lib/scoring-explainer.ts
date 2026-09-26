import {
  HAZARD_EXTRA_PENALTY,
  HAZARD_SCORE_CAP,
  MIN_COVERAGE,
  MIN_IDENTIFIED,
  SCORE_BANDS,
} from "@/lib/matching";
import { VERDICT_LABEL } from "@/lib/tokens";

/**
 * The words on "How scoring works" (`app/scoring.tsx`, #325), built from the
 * constants the score itself uses — never restated by hand, so the page can't
 * drift from the maths (`__tests__/scoring-explainer.test.ts` holds it to
 * them). Plain English in the app's voice (`docs/voice.md`), and inside the
 * claims policy: nothing here promises a result.
 */

export type ScoreBandLine = { range: string; label: string };

/** "90 and up · Excellent match", down to "Below 60 · Poor match". */
export function scoreBandLines(): ScoreBandLine[] {
  const { excellent, good, fair } = SCORE_BANDS;
  return [
    { range: `${excellent} and up`, label: VERDICT_LABEL.excellent },
    { range: `${good} to ${excellent - 1}`, label: VERDICT_LABEL.good },
    { range: `${fair} to ${good - 1}`, label: VERDICT_LABEL.fair },
    { range: `Below ${fair}`, label: VERDICT_LABEL.poor },
  ];
}

export type ScoringSection = { title: string; body: string };

export function scoringSections(): ScoringSection[] {
  const quarter = MIN_COVERAGE === 0.25 ? "a quarter" : `${Math.round(MIN_COVERAGE * 100)}%`;
  return [
    {
      title: "Your score is personal",
      body: "It compares a product's ingredients with your skin profile, so the same product can score differently for someone else.",
    },
    {
      title: "What raises it",
      body: "Ingredients that help your concerns and your skin type. The higher one sits on the list, the more it counts.",
    },
    {
      title: "What lowers it",
      body: `Ingredients that commonly irritate, more so if you said your skin reacts. Pore-clogging ones, if you're acne-prone or care about pores. A hazard caps the score at ${HAZARD_SCORE_CAP}, and each further one takes ${HAZARD_EXTRA_PENALTY} off.`,
    },
    {
      title: "Pregnancy",
      body: "If you said you're pregnant or trying, cautions are shown on their own and never hidden. They don't change the score.",
    },
    {
      title: "When there's no score",
      body: `When we recognise fewer than ${MIN_IDENTIFIED} of its ingredients, or under ${quarter} of them, or when you haven't set up a skin profile yet. We still show what's in it.`,
    },
    {
      title: "What we don't do",
      body: "No ads, no brand deals, no paid placements. And none of this is medical advice: for a skin condition, see a dermatologist.",
    },
  ];
}
