# Scoring validation gaps

The executable validation suite only contains properties the current model is
expected to satisfy. Known disagreements are documented here instead of hidden
behind `it.failing`, whose green result cannot distinguish the intended failure
from a new failure in the test setup.

These are model gaps, not universal product verdicts. A formula snapshot does
not establish clinical efficacy, concentration, exposure, or suitability for
every person.

## Sparse hydration formulas

A formula whose only recognised dehydration signal is sodium hyaluronate can
remain near the neutral anchor because the catalogue-derived saturation value
expects more cumulative evidence. This affects sparse formulas such as COSRX
Advanced Snail 96 Mucin Power Essence even when the unrecognised ingredients
may have real hydrating functions.

Resolve this by improving ingredient/function coverage or recalibrating with a
representative labelled dataset; do not special-case a brand or product.

## Trace actives still cost about half a main active

A rule's declared sensitive-skin harm is charged as irritation whatever its
benefit category. `positionWeight` scales it by INCI position down to a 0.3
floor, but the irritation penalty saturates, so the final points fall far less
than the weight does: at the floor a trace active still costs roughly half of
what the same active costs near the top of the list. The setup: a `serum` of 43
ingredients (`water`, `glycerin`, `propanediol` and 40 unmatched fillers) with
one active inserted at position 3 or at 33 or later, for a highly sensitive
`dullness` profile. The ratio between the two is asserted by "a trace active
still costs roughly half of a top-of-list one" in
`__tests__/scoring-validation.test.ts`, so a retune that changes it fails a test.
The absolute figures were measured once on 2026-09-19 and can drift with the
weights: irritation penalty at position 3 against the floor was salicylic acid
16.1 against 8.7, ascorbic acid 14.2 against 7.3, retinol 16.9 against 9.3.

Alphabetical lists are handled: `positionWeights` in `lib/rules.ts` detects an
A-to-Z tail (21 CFR 201.66(c)(8) requires it of OTC drugs that are not also
cosmetics) and gives it one flat weight, the average of the curve over that
stretch. That derived weight is not a published figure; nothing published gives
one. It does not remove the charge — in the 2026-09-19 catalogue snapshot, Kiss
My Face Purely Mineral's ascorbic acid still costs 9.5 irritation points for a
highly sensitive, dry, acne-prone profile at a flat weight of 0.42 (a live row,
so the figure can change).

Whether that charge is too large is a calibration question about
`IRRITATION_SATURATION` and the harm weights, not about list order. Resolve it
with concentration evidence (DailyMed states each active's strength; the
importer discards it) or a labelled dataset, measured against the catalogue.

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

## Benzoyl peroxide gel classified as unknown

The Walmart 10% benzoyl-peroxide acne gel (DailyMed `950edb4e-fbba-41e3-9ec5-973806e555e7`,
snapshot 2026-09-19) gets type `unknown` from the classifier, though it is a
leave-on gel. `unknown` discounts benefit to 0.25 while keeping harm at full
weight, so the fixture shows its irritation cost but understates its acne
benefit. The fixture keeps the stored type so it represents what the app
actually scores. Its inactives are printed alphabetically, so their positions
carry no concentration information.

Correct the classifier for OTC acne-treatment labels, then refresh the fixture.

