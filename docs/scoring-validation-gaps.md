# Scoring validation gaps

The executable validation suite only contains properties the current model is
expected to satisfy. Known disagreements are documented here instead of hidden
behind `it.failing`, whose green result cannot distinguish the intended failure
from a new failure in the test setup.

These are model gaps, not universal product verdicts. A formula snapshot does
not establish clinical efficacy, concentration, exposure, or suitability for
every person.

## Audit 2026-09-24: the baseline #237 recalibrates against (#175)

Measured with `SCORE_BASELINE=1 npx jest score-baseline`, which is read-only
against staging and scores every product through `matchProduct` itself. On
2026-09-24 staging held 1,112 products with a formula, and 5 of them are
refused as unreadable for every profile. Re-run it before and after #237 so
any drift can be attributed.

### Score distribution, six fixed profiles

After this audit's one scoring change (see `docs/decisions.md`, "Why declared
antioxidant and UV-absorber functions earn nothing"):

| Profile | Scored | Mean | P25 | Median | P75 | Excellent | Good | Fair | Poor |
|---|---|---|---|---|---|---|---|---|---|
| oily · acne-prone · not sensitive | 1107 | 72.5 | 66 | 76 | 81 | 14 | 599 | 348 | 146 |
| dry · dehydrated · not sensitive | 1107 | 72.1 | 68 | 74 | 79 | 0 | 529 | 475 | 103 |
| combination · dullness + dark spots · somewhat | 1107 | 60.4 | 54 | 62 | 67 | 0 | 79 | 600 | 428 |
| normal · redness · very sensitive | 1107 | 49.1 | 38 | 50 | 62 | 0 | 47 | 308 | 752 |
| dry · fine lines + eczema-prone · somewhat | 1107 | 62.4 | 55 | 64 | 72 | 0 | 196 | 513 | 398 |
| combination · large pores · unset | 1107 | 66.1 | 58 | 68 | 77 | 1 | 372 | 417 | 317 |

Before that change, only two rows differed: dullness + dark spots had a mean
of 61.5 with 115 Good, 597 Fair and 395 Poor; fine lines + eczema-prone had a
mean of 63 with 220 Good, 502 Fair and 385 Poor. Every movement was downward:
507 and 483 scores fell, by 1 to 8 points, and 106 verdicts dropped a band.

### Open: the saturation constants no longer sit at the 75th percentile

`CONCERN_SATURATION` is documented as the 75th percentile of the evidence a
real formula offers each concern. It was measured on 6 September 2026, when
the catalogue held about 104-138 products. Re-measured the same way today:

| Concern | Constant | Products with positive evidence | 75th percentile | Median |
|---|---|---|---|---|
| dehydrated | 16.6 | 86% | 10.8 | 6.8 |
| atopic | 14.4 | 35% | 6.4 | 3.2 |
| hyperpigmentation | 7.4 | 48% | 12.8 | 8.9 |
| redness | 6.6 | 26% | 5.1 | 2.6 |
| large-pores | 6.5 | 41% | 3.7 | 2.0 |
| fine-lines | 4 | 68% | 12.0 | 3.7 |
| dullness | 4 | 67% | 2.8 | 1.8 |
| acne-prone | 4 | 16% | 3.8 | 2.2 |
| post-acne-marks | 7 (estimated) | 21% | 5.3 | 3.3 |

- **Method.** Evidence is each product's *net* concern evidence (benefits
  minus harms), recovered from the concern fit `matchProduct` reports,
  contact-weighted, over the products where it is positive. For
  acne-prone and large-pores, the pore-safety half is taken out first.
  `dehydrated` was reviewed in #161 as a 75th percentile of 16.6 and comes
  out at 10.8 here. The definition the original measurement used is not
  recorded — gross rather than net evidence, or before contact weights
  existed, would each read higher — which is itself a reason to fix one
  definition before recalibrating.
- **Not recalibrated in #175, on purpose.** #237 grows the rules from 61 to
  about 500, which changes every row of this table. Recalibrating now would
  move every score twice in a few weeks. #237 should settle the method
  above, recalibrate once, and list what moved.
- Fine lines and dark spots stay high because the evidence is heavy-tailed
  (medians of 3.7 and 8.9). The `smoothing` and `uv-filter` function
  signals reach many products, and the sunscreen share is high (29% of
  products).

### Open: rule claims that disagree with the evidence (for #237's review)

All 61 rules were read against published consensus. Most hold: the
humectants, ceramides, niacinamide, retinoids, AHAs, salicylic acid,
benzoyl peroxide, azelaic acid, the EU fragrance allergens, SLS and
denatured alcohol. These don't. Each is a harm or benefit weighing on a
table #237 rewrites, and should be decided there, with the list of products
it moves — except the first, which is done.

- **Done: `sodium hydroxide` as a reactive-skin irritant** (in 27% of
  products), dropped from the rule. It neutralises carbomer and fatty acids
  during manufacture, so its presence says nothing about the finished
  product's pH. The CIR finds it safe as a pH adjuster. The rule's sentence
  ("can push a formula away from skin's natural pH") describes the formula,
  and the ingredient list can't support that. `sodium bicarbonate` is
  different: products use it *for* its alkalinity, and stays. Once the
  Ingredient check (#345) showed every rule in the `irritants` category as
  "to watch" for everyone, this one put a watch on 28% of products, so it
  couldn't wait for #237.
- **`dimethicone` (17%) and the fatty alcohols (`cetearyl alcohol` 23%,
  `cetyl alcohol` 11%) charged against acne-prone skin.** Both are generally
  regarded as non-comedogenic. The ratings behind "fatty alcohols clog" come
  from the rabbit-ear assay, which dermatology no longer relies on.
  `lib/pore-clogging.ts` gives contested cloggers zero weight. These rules
  charge the acne-prone concern directly anyway, because their category is
  `barrier`, not `pore-clogging`, so they bypass that policy. Recommend
  moving any genuine concern into `lib/pore-clogging.ts` with a confidence
  tier, or dropping the harm.
- **The essential-oil patterns overmatch.** `/mentha/`, `/eucalyptus/` and
  `/lavandula/` also catch leaf extracts and floral waters. Those are charged
  with the "volatile essential oil" sentence and weight when they are not
  oils. Recommend anchoring the patterns to `oil`.
- **`silica` sits in the clay rule,** and its sentence calls it "an absorbent
  clay". It is an absorbent powder in 7% of products, often a sunscreen
  texturiser. Recommend a sentence of its own, or dropping it.
- **Thin evidence behind a benefit:** topical `glutathione` (whose sentence
  also says Korean tone-care "is built on" it), `panax ginseng` (whose
  sentence says "circulation-boosting" — review under the claims policy's
  closing rule), and `sarcosine` / `sodium cocoyl alaninate` for pores.
  Recommend lower weights or removal at #237's review.
- **Weak function signals:** `smoothing` (fine lines, dullness) describes a
  surface feel, and `tonic` (redness) is CosIng's "feeling of well-being".
  Neither is wrong by definition, the way `antioxidant` was. Both are thin.

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

## Closed 2026-09-26: "very sensitive" barely moved a trailing fragrance (#301, #363)

Reported from the simulator: switching "somewhat" to "very sensitive" moved a
fragranced cream from 55 to 54. Confirmed, and pinned in
`__tests__/sensitivity-fragrance.test.ts`.

- **The cause.** Parfum's rule weighs 9, but `positionWeight` cuts it by its
  place in the list before `SENSITIVITY_MULTIPLIER` sees it. Last on a
  20-ingredient list it is `9 × 0.369 = 3.32` of irritation, so "somewhat"
  (×1) charges 3.3 and "very" (×1.6) 5.3: two points apart. Applying the
  multiplier before the position discount would change nothing (it is a
  product), so that suggestion is not an option.
- **It is not the general case.** A real fragranced cream with other
  irritants (Nivea Rose Care: alcohol denat plus four EU fragrance allergens)
  goes 45 → 36, until the 34-point irritation cap stops it. And the big step
  is "not sensitive" → "somewhat" (65 → 45), because below "somewhat" the
  fragrance rules don't apply at all.
- **Options, measured on the 21 fixture products plus the plain cream, across
  the six baseline profiles and "dry, dehydrated, very sensitive"** (154
  scores; every scoring-validation invariant still passes under each):
  - **A. Fragrance floor, "very sensitive" only:** a fragrance rule's
    irritation charge uses `max(position, 0.7)`. 8 scores move, all
    fragranced products for very-sensitive profiles, 3–5 points each (plain
    cream 79 → 74). Nothing else moves.
  - **B. The same floor for everyone judged reactive** ("somewhat", "very"
    and unset): 26 move, up to 10 points (Nivea Rose Care for "somewhat" 42
    → 32). Widens the gap from "not sensitive", not the one reported.
  - **C. "Very" multiplier 1.6 → 2.5:** 24 move, every irritant for
    very-sensitive profiles, up to 11 points (The Ordinary Lactic Acid 46 →
    35, COSRX BHA 60 → 49) — larger than the fragrance change it was meant
    for (plain cream 79 → 76).
- **Recommended: A.** It fixes the reported case and nothing else, and
  changes nothing for non-sensitive or "somewhat" users. The cap is a
  separate question: once a product is at 34, no option separates "very"
  from "somewhat" further.

**Decision: A, built in #363** (`FRAGRANCE_POSITION_FLOOR_HIGH = 0.7` in
`lib/matching.ts`). Measured with the real code, the fixture moved exactly as
predicted: the same 8 scores, 3–5 points each, and 0 of the 110 scores for
the other five profiles. The plain cream now reads 81 at "somewhat" and 74 at
"very". The cap question above stays open.
