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
keeps the input ratio intact: an ingredient at the 0.3 position floor costs
currently `0.3 / positionWeight(3)` of the same ingredient at position 3 (about 0.38; a test only enforces that it stays under 0.4), rather
than being inflated toward one half by a second saturation curve.

Scoring still reads concentration from INCI position only. A Drug Facts label
prints each active's strength, but no live source records it: the barcode
lookup (Open Beauty Facts) has no strength field, the label photo captures the
ingredient list rather than the Drug Facts box, and the DailyMed importer that
could read it is retired because DailyMed has no barcodes. Using a stated
strength needs a source that saves it first; see
[#174](https://github.com/sabrahermassi/skincare-recommendation/issues/174).

Across all 21 public product snapshots in the scoring-validation corpus and two
fixed profiles (highly sensitive/dullness and non-sensitive/dehydrated), 15 of
42 scores changed. Mean absolute movement was 1.45 points, the range was -9 to
+4, and 2 verdict bands changed. This is the reproducible catalogue snapshot
available in the repository; no live Supabase credentials are committed.

### Decision: the penalty is a model choice, and it is kept

The straight-line penalty has no published source. The research reviewed for
this step (retinol, benzoyl peroxide, salicylic acid, AHAs) shows irritation
rises with dose but gives no formula, so the constants that remain (the
34-point ceiling and the 0.5 / 1 / 1.6 sensitivity multipliers) are a product
choice, not a clinical figure. It is kept because it fixes the defect the old
curve had, and because its effect is the one wanted: a mild irritant costs
few points, and a strong one costs more the more reactive the user says they
are, so someone who is only lightly sensitive is not penalised as if they
reacted to everything. Reopen it if a labelled dataset or published
dose-response figure appears.

Measured on the live catalogue on 2026-09-22 (616 products from Open Beauty
Facts, label photos and the barcode database; 608 scoreable), old penalty
against new, across six fixed profiles (3,648 scores):

- 1,930 scores change; mean absolute movement over the changed scores is 3.9
  points (2.05 over all scores), range -11 to +15.
- 359 verdicts change band: 341 move up and 18 move down.
- Almost all of it is for sensitive profiles. A tolerant oily acne-prone
  profile changes 10 scores and no bands; a tolerant dry dehydrated profile
  changes 58 scores and 5 bands.
- Direction depends on how irritating the product is. A mild irritant costs
  fewer points (Torriden DIVE In Multi Pad, highly sensitive: 61 to 64). A
  strong one costs more on highly sensitive skin (Some By Mi Retinol Intense
  Serum: 60 to 57; the Walmart 10% benzoyl-peroxide fixture: 42 to 37). At
  "some" sensitivity the same two products move up (64 to 67, 45 to 47), which
  is the lightly sensitive user tolerating more.

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
the closest existing full-contact leave-on type. A benzoyl-peroxide *wash* is
never credited as a leave-on: it is a `cleanser` when the name says
"cleansing" or "cleanser", and stays `unknown` otherwise. For the real Walmart 10% fixture, tolerant oily
acne-prone skin moved 75 → 77 and dry, highly sensitive acne-prone skin moved
47 → 45, so full benefit is credited without hiding the reactive-skin cost.

## An alphabetical run can absorb leading actives

`positionWeights` protects position 0 only. An OTC drug label with several
actives lists them first and its inactives alphabetically, and when a second
active sorts ahead of the first inactive the detected run starts at index 1 and
flattens that active together with the inactives. In the 2026-09-19 snapshot,
22 of the 59 detected lists started their run at index 4 or earlier.

The boundary cannot be recovered from the ingredient list: it has to come from
the label's Drug Facts box, which no live source records (see the irritation
section above). Resolve it together with stated strength.
