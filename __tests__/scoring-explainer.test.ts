import { HAZARD_EXTRA_PENALTY, HAZARD_SCORE_CAP, MIN_IDENTIFIED, SCORE_BANDS } from "@/lib/matching";
import { scoreBandLines, scoringSections } from "@/lib/scoring-explainer";
import { VERDICT_LABEL } from "@/lib/tokens";

/**
 * #325: "How scoring works" says numbers the score uses. Built from the
 * constants, so these fail if the page and the maths ever disagree —
 * never a hardcoded 90/75/60 (CLAUDE.md).
 */
describe("How scoring works", () => {
  it("states each band from SCORE_BANDS, with the verdict it earns", () => {
    const { excellent, good, fair } = SCORE_BANDS;
    expect(scoreBandLines()).toEqual([
      { range: `${excellent} and up`, label: VERDICT_LABEL.excellent },
      { range: `${good} to ${excellent - 1}`, label: VERDICT_LABEL.good },
      { range: `${fair} to ${good - 1}`, label: VERDICT_LABEL.fair },
      { range: `Below ${fair}`, label: VERDICT_LABEL.poor },
    ]);
  });

  it("leaves no gap or overlap between the bands", () => {
    const [top, second, third, bottom] = scoreBandLines().map((line) => (line.range.match(/\d+/g) ?? []).map(Number));
    // "90 and up", "75 to 89", "60 to 74", "Below 60".
    expect(second[1]).toBe(top[0] - 1);
    expect(third[1]).toBe(second[0] - 1);
    expect(bottom[0]).toBe(third[0]);
  });

  it("says the hazard cap and the no-score threshold the score uses", () => {
    const text = scoringSections().map((s) => s.body).join(" ");
    expect(text).toContain(`caps the score at ${HAZARD_SCORE_CAP}`);
    expect(text).toContain(`each further one takes ${HAZARD_EXTRA_PENALTY} off`);
    expect(text).toContain(`fewer than ${MIN_IDENTIFIED} of its ingredients`);
    expect(text).toContain("under a quarter of them");
  });

  it("says the score is personal, and what we don't do", () => {
    const text = scoringSections().map((s) => s.body).join(" ");
    expect(text).toMatch(/score differently for someone else/);
    expect(text).toContain("No ads, no brand deals, no paid placements.");
    expect(text).toMatch(/none of this is medical advice/);
  });
});
