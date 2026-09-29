import { HAZARD_EXTRA_PENALTY, HAZARD_SCORE_CAP, MIN_IDENTIFIED, SCORE_BANDS } from "@/lib/matching";
import { SCORING_DISCLAIMER, scoreBandLines, scoreFactors, scoreNotes } from "@/lib/scoring-explainer";
import { VERDICT_LABEL } from "@/lib/tokens";

/**
 * #325: "How scoring works" says numbers the score uses. Built from the
 * constants, so these fail if the page and the maths ever disagree —
 * never a hardcoded 90/75/60 (CLAUDE.md).
 */
describe("How scoring works", () => {
  it("states each band from SCORE_BANDS, with the verdict it earns", () => {
    const { excellent, good, fair } = SCORE_BANDS;
    expect(scoreBandLines().map(({ range, label }) => ({ range, label }))).toEqual([
      { range: `${excellent} to 100`, label: VERDICT_LABEL.excellent },
      { range: `${good} to ${excellent - 1}`, label: VERDICT_LABEL.good },
      { range: `${fair} to ${good - 1}`, label: VERDICT_LABEL.fair },
      { range: `0 to ${fair - 1}`, label: VERDICT_LABEL.poor },
    ]);
  });

  it("covers 0 to 100 with no gap or overlap between the bands", () => {
    const bands = scoreBandLines();
    expect(bands[0].to).toBe(100);
    expect(bands[bands.length - 1].from).toBe(0);
    for (let i = 1; i < bands.length; i++) expect(bands[i].to).toBe(bands[i - 1].from - 1);
  });

  it("says the hazard cap and the no-score threshold the score uses", () => {
    const text = [...scoreFactors(), ...scoreNotes()].map((row) => row.body).join(" ");
    expect(text).toContain(`caps the score at ${HAZARD_SCORE_CAP}`);
    expect(text).toContain(`each further one takes ${HAZARD_EXTRA_PENALTY} off`);
    expect(text).toContain(`fewer than ${MIN_IDENTIFIED} of its ingredients`);
    expect(text).toContain("under a quarter of them");
  });

  it("says the score is personal, and what we don't do", () => {
    const text = scoreNotes().map((row) => row.body).join(" ");
    expect(text).toMatch(/score differently for someone else/);
    expect(SCORING_DISCLAIMER).toContain("No ads, no brand deals, no paid placements.");
    expect(SCORING_DISCLAIMER).toMatch(/Not medical advice/);
  });
});
