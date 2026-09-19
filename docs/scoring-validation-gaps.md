# Scoring validation gaps

The executable validation suite only contains properties the current model is
expected to satisfy. Known disagreements are documented here instead of hidden
behind `it.failing`, whose green result cannot distinguish the intended failure
from a new failure in the test setup.

These are model gaps, not universal product verdicts. A formula snapshot does
not establish clinical efficacy, concentration, exposure, or suitability for
every person.

## Benzoyl peroxide on dry, reactive skin

A leave-on benzoyl-peroxide treatment can still score `good` for a dry,
high-sensitivity, acne-prone profile. Pore safety supplies 65% of acne fit and
defaults to 100 when there is no known clogger, while benzoyl peroxide is in the
`actives` category rather than an irritation category. Its caution flag adds a
small sensitivity penalty but does not offset that pore-safety contribution.

Resolve this with a catalogue-wide model change and before/after distribution
evidence; do not encode a desired absolute verdict in the fixture suite.

## Sparse hydration formulas

A formula whose only recognised dehydration signal is sodium hyaluronate can
remain near the neutral anchor because the catalogue-derived saturation value
expects more cumulative evidence. This affects sparse formulas such as COSRX
Advanced Snail 96 Mucin Power Essence even when the unrecognised ingredients
may have real hydrating functions.

Resolve this by improving ingredient/function coverage or recalibrating with a
representative labelled dataset; do not special-case a brand or product.

## Alpha-hydroxy acids on reactive skin

The lactic-acid rule declares a downside for sensitive skin, but its `actives`
category does not enter the irritation accumulator. A sensitivity-only harm
match also does not reduce concern or skin-type fit. Consequently, the high-
sensitivity score for The Ordinary Lactic Acid 10% + HA falls because of its
separately flagged sodium hydroxide, not because of lactic acid. The executable
test checks lactic acid's brightening contribution with an otherwise identical
synthetic control; it does not claim the model currently charges its reactive-
skin downside.

Address the active-irritation path with catalogue-wide before/after evidence,
accounting for the limits of an ingredient list without concentration or
finished-formula pH data. Do not infer a universal risk from the product name.

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
