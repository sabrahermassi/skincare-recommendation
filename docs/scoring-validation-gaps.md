# Scoring validation gaps

The executable validation suite only contains properties the current model is
expected to satisfy. Known disagreements are documented here instead of hidden
behind `it.failing`, whose green result cannot distinguish the intended failure
from a new failure in the test setup.

These are model gaps, not universal product verdicts. A formula snapshot does
not establish clinical efficacy, concentration, exposure, or suitability for
every person.

## Closed 2026-09-21: sparse hydration formulas

A formula whose only recognised dehydration signal is sodium hyaluronate remains
below a formula with several independent humectant signals. This is intentional:
the score describes evidence visible in the label, not reputation, and
`CONCERN_SATURATION.dehydrated = 16.6` is the catalogue's measured 75th
percentile rather than a brand-specific target. Lowering it would raise every
dehydration score without a labelled outcome dataset to justify that movement.

Closed as correct rather than special-casing COSRX. The regression test
`keeps sparse hydration evidence partial rather than special-casing one formula`
pins both sides of the decision: sodium hyaluronate alone must move concern fit
above neutral, while adding an independently evidenced humectant must move it
further. Reopen when there is either missing dictionary/function evidence for
the exact formula or a representative labelled hydration dataset.

## Closed 2026-09-21: irritation calibration

The unsupported `IRRITATION_SATURATION = 14` curve was removed. One point of
weighted harm evidence now removes one score point, multiplied by the user's
declared sensitivity and capped at the existing 34-point policy ceiling. This
keeps the input ratio intact: an ingredient at the 0.3 position floor now costs
exactly `0.3 / positionWeight(3)` of the same ingredient at position 3, rather
than being inflated toward one half by a second saturation curve.

Where a Drug Facts label states strength, scoring uses it instead of INCI
position. The database and domain model store ordered `declared_actives`, and
the DailyMed parser preserves the percentage required by
[21 CFR 201.66(c)(2)](https://www.ecfr.gov/current/title-21/section-201.66).
Strength is normalised only against an ingredient-specific sourced bound:
benzoyl peroxide 10% (the top arm covered by the comparative evidence reviewed
in [Benzoyl Peroxide: A History of Early Research and Researchers](https://pubmed.ncbi.nlm.nih.gov/36607767/)),
salicylic acid 2%, retinol 0.3% retinol equivalent, and glycolic/lactic acid
10%. A missing strength or missing per-active reference falls back to position;
the model never invents a concentration from order. FDA also notes that AHA
effect depends on concentration, pH and formulation, and cites the consumer
conditions of no more than 10% at pH 3.5 or above
([FDA AHA guidance](https://www.fda.gov/cosmetics/cosmetic-ingredients/alpha-hydroxy-acids)).

The linear normalisation below each bound is explicitly a transparent model
choice, not a clinical no-irritation formula. The research supports monotonic
dose response; it does not supply a universal curve.

Across all 21 public product snapshots in the scoring-validation corpus and two
fixed profiles (highly sensitive/dullness and non-sensitive/dehydrated), 15 of
42 scores changed. Mean absolute movement was 1.45 points, the range was -9 to
+4, and 2 verdict bands changed. This is the reproducible catalogue snapshot
available in the repository; no live Supabase credentials are committed.

### Gentle forms

L-ascorbic acid retains its sensitive-skin harm. Ascorbyl glucoside,
3-O-ethyl ascorbic acid and magnesium ascorbyl phosphate now have a separate,
lower-weight derivative rule and do not inherit an acidic-form irritation
claim. Retinyl palmitate likewise has its own lower-weight rule and no longer
inherits retinol's irritation charge. This is deliberately an absence of an
unsupported inherited harm, not a claim that no formulation can irritate.
The SCCS evaluates retinyl palmitate as a distinct vitamin-A form
([SCCS/1639/21](https://health.ec.europa.eu/publications/revision-scientific-opinion-sccs157616-vitamin-retinol-retinyl-acetate-retinyl-palmitate_en));
the published magnesium-ascorbyl-phosphate study establishes it as a topical
derivative rather than acidic L-ascorbic acid
([Kameyama et al.](https://pubmed.ncbi.nlm.nih.gov/8543691/)). The code keeps
the three vitamin-C derivatives together because the available evidence does
not justify different numeric irritation weights among them.

## Hyaluronic Acid 2% + B5 misclassified as unknown

The 2026-09-18 catalogue row `obf-0769915233506` has type `unknown`, though
[the manufacturer calls this a serum](https://theordinary.com/en-sc/hyaluronic-acid-2-b5-serum-with-ceramides-769915233506.html).
The app therefore gives positive ingredient evidence only the `unknown` type's
0.25 contact weight, rather than the full serum weight. The fixture keeps the
stored type so it represents what the app actually scores, but it does not make
a hydration-suitability claim while that classification is wrong.

Correct the catalogue classifier and the stored row, then refresh the fixture
and add a serum-specific hydration comparison. Relabelling only the fixture
would hide the user-facing data problem.

## Closed 2026-09-21: benzoyl peroxide fixture type

The classifier now maps an OTC benzoyl-peroxide/acne-treatment gel to `serum`,
the closest existing full-contact leave-on type, and the real Walmart 10%
fixture carries its declared strength. For tolerant oily acne-prone skin its
score moved 75 → 77; for dry, highly sensitive acne-prone skin it moved 47 →
45. The resulting direct comparison is 77 versus 45, so full benefit is
credited without hiding the strength-aware reactive-skin cost.


## Closed 2026-09-21: leading actives and alphabetical runs

`positionWeights` now accepts the declared leading-active count and will not
start an A-to-Z tail before that boundary. The count comes from the same ordered
`declared_actives` metadata as strength, so multi-active sunscreen and acne Drug
Facts labels no longer depend on whether an active happens to sort before the
first inactive. The original snapshot count was 22 of 59 detected runs starting
at position 4 or earlier; the regression test covers the previously failing
two-active shape.
