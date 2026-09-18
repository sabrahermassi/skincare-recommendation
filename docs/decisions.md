# Decisions

Why the rules in `CLAUDE.md` exist — incidents, history, and anything not yet
fully established. `CLAUDE.md` states the rule; this explains the evidence
behind it. Read this when you want the reasoning, not before every task.

## Routing

**Never navigate from a layout file.** This is not theoretical caution —
`router.replace()` in a root-layout `useEffect` has already thrown
`Attempted to navigate before mounting the Root Layout component` on a real
device once. The fix was a declarative `<Redirect>` rendered inside the
navigator instead (see the onboarding gate in `app/(tabs)/_layout.tsx`).

## State

**Persistence** (issue #2, closed) was added via Zustand's `persist`
middleware. `compareIds` and a compare tray used to be part of the store;
both were removed along with the whole comparison feature, which is why
neither appears in the current shape.

**`area` was removed from `SkinProfile` entirely** — it used to survive as a
field even after being dropped from onboarding (the browse list filtered on
it, the profile screen edited it), but that half-removed state didn't last;
it's gone now, not just hidden from the quiz.

**Gender and age were removed** from the profile: both were collected,
stored, and read by nothing. Classic dead data — nothing scored against
them, nothing displayed them.

**Open question: should the catalogue cache notify screens instead of being
re-read?** The catalogue lives in a module (`data/catalogue-cache.ts`) and
each screen keeps its own copy in component state, so nothing hears about a
change. When a scan or a label read replaces a product mid-session, an
already-mounted Browse kept showing the old list until a filter change or a
reload.

Two ways to solve that, and we took the smaller one: **Browse re-reads the
cache when the tab regains focus** (`useFocusEffect` + `peekProducts`). It
is synchronous, hits no network, and returns the same array instance when
nothing changed, so an ordinary tab switch renders nothing. Cheap, and
correct for the two screens that actually show a list.

The other option is the one the rest of this app already uses for profile
and saved items: **make the cache observable** — screens subscribe, the
cache emits on change, everything showing the list updates at once. That is
the more correct shape, and it is what React Query, SWR and Zustand do.

Worth revisiting if any of these become true: a third or fourth screen
starts holding its own catalogue copy; something needs to update while
visible rather than on return (a background refresh landing, a push); or
the focus re-read starts being wrong rather than merely late. Until then
the subscription is machinery for a problem one line of `useFocusEffect`
already answers.

## Scoring

**Why exposure is graded per product type rather than a rinse-off flag:**
product type touches the score in exactly one place — `contactWeight`, which
scales how much each ingredient counts. Everything else comes from the
formula. That weight used to be a boolean: 0.4 for a rinse-off list, 1 for
everything else. Two things were wrong with it. A scrub rinsed off in thirty
seconds and a hair mask worn for twenty minutes took the same number. And
`exfoliator` covers both a physical scrub and a leave-on acid liquid — the
catalogue holds "6% Mandelic Acid + 2% Lactic Acid Liquid Exfoliant", which
was having its acids *and its irritation* counted at 40% for exactly the
reactive skin that needed the warning.

Contact now has separate harm and benefit weights. Known quick rinse-off types
(`cleanser`, `body-wash`) use 0.25 in both directions, `body-scrub` uses 0.5,
and known leave-on types use 1. The safety side follows the conservative rule:
an ambiguous or unknown type keeps harm at 1 so a wrong type cannot quietly
under-count an irritant that was actually left on. The benefit side does not
make that same assumption: the four ambiguous types (`exfoliator`,
`conditioner`, `hair-mask`, `shampoo`) all receive the same 0.5 benefit
credit — each genuinely spans a short-contact and a long-contact variant with
nothing here to separate them, so there is no basis for discounting one
further than the others. `unknown` is discounted harder still, to 0.25: it
is not one of the four named types, it is roughly 28% of the imported
catalogue, and unlike the four it could be either extreme or something this
app has never classified at all, so there is even less basis for crediting
it at leave-on strength.

This split matters because one shared weight was not conservative in both
directions. Full weight protected the harm path, but it also gave a rinse-off
scrub with salicylic acid full acne-fighting credit as though it were left on.
`lib/matching.ts` now sends helpful rule effects and declared-function signals
through `benefit`, while hurt effects, sensitive-skin irritation, caution
ingredients, and pore-clogging load use `harm`.

The bands are intentionally broad scoring policy, not measured efficacy
retention percentages. SCCS exposure assessment supports distinguishing
product types and retention, but it does not establish one universal cosmetic
benefit multiplier across ingredients, concentrations, vehicles, and use
conditions. The benefit numbers therefore remain heuristic and should be
calibrated against expert-reviewed product/profile benchmarks.

**Deliberately not touched here:** which rule categories feed the irritation
accumulator. It was `fragrance`/`alcohol`/`irritants` before this PR and
still is — a draft of this PR also widened it to any `hurts: { sensitive:
true }` rule (catching salicylic acid, AHAs, retinoids, vitamin C, tea tree
oil, benzoyl peroxide), which is a real, evidenced gap — a plain leave-on
serum with salicylic acid moved from a **fair** to a **poor** verdict for a
highly sensitive profile when tested — but it is a catalogue-wide change
independent of contact weighting, unrelated to what this PR is about, and
was pulled out to be reviewed and merged on its own. See PR #127's review
and its follow-up.

Considered and rejected: dropping `contactWeight` entirely for pure
ingredient scoring. It would remove the type dependency altogether, but a
face wash and a night serum carrying the same actives would then score
identically, and the wash genuinely does less — in both directions.

Considered and rejected: moving `cleanser` to full weight because micellar
water — tagged and typed `cleanser` by both classifiers — is usually left on
rather than rinsed. Unlike the four ambiguous types above, `cleanser` is not
close to a 50/50 split: the large majority of what's typed `cleanser` (foam,
gel, oil, balm) genuinely is rinsed off within about a minute, exactly the
band this weight sits in. Discounting the whole type to fix the micellar
minority would cost the accuracy the type exists to provide for the
majority. The right fix was a dedicated no-rinse/micellar classifier rule,
tracked separately — **built in PR #130 (step 13, second half)**: a new
`micellar-water` `ProductType` sits above the generic cleanser pattern in
both `guessType` copies (`scripts/import-obf.mjs`,
`supabase/functions/product-lookup/index.ts`), and `contactWeight` gives it
full harm and benefit like any other leave-on type. No icon was drawn for
it — `lib/productIllustration.ts` falls back to the same untexted pump
bottle `unknown` uses, deliberately, rather than showing a `cleanser`-labeled
icon on a product that isn't one. The classifier rule requires "water"
alongside "micellar" rather than the bare word, so a genuinely rinse-off
"Micellar Foaming Cleanser" still lands as `cleanser` rather than getting
full leave-on contact weight for a product that isn't left on. That alone
wasn't enough — Codex's review of this PR found real rinse-off names that
carry both words without being adjacent ("Micellar Water Foaming Cleanser",
"Water Boost Micellar Facial Gel Wash"), so the rule also excludes any name
carrying an explicit rinse-off format word (cleanser, foam, wash, gel, and
the non-English cleanser synonyms already in the generic rule below it). A
name excluded this way that doesn't match the generic cleanser rule either
falls through to `unknown` rather than being forced into either type — the
safe outcome, since `unknown`'s conservative-benefit/full-harm policy is
this table's fail-safe everywhere else.

**This is a classifier fix, not a data migration.** It only changes how a
product is typed on its next import or scan — any row already in the live
catalogue that was typed `cleanser` by the old, broader pattern (plausible:
`en:cleansers` is one of this importer's six pulled categories, exactly
where a micellar water would have landed) stays typed `cleanser`, and stays
scored at the rinse-off 0.25/0.25 weight, until it's re-read.
`scripts/reclassify-from-tags.mjs` already has `cleanser` in its
`CANDIDATE_TYPES` and already imports `guessType` from `import-obf.mjs`, so
running it picks up this fix retroactively — but **only with `--restart`**.
Codex also caught this: the script checkpoints settled rows in
`.reclassify-from-tags-progress.json`, and a `cleanser` row a prior pass
already read and found nothing to change was recorded as settled under the
*old* classifier — a plain re-run skips it as already-handled and reports
"nothing left to read" while the row stays mis-scored. `--restart` ignores
that checkpoint. Same precedent as steps 3, 4, 8 and 10 in the data-strategy
plan: code merged is not done, a confirmed live run is.

**Why `SCORE_BANDS` is the single source for band cutoffs:** the verdict
and the badge tone once read different cutoffs (75/55 vs 80/65) and
disagreed about the same product. That's the failure mode the shared
constant exists to prevent — don't let a second copy of a cutoff happen
again.

**Why acne fit is scored on pore-clogging, not on actives:** an earlier
version scored `acne-prone` fit on "does the formula contain salicylic
acid," which made an ordinary gentle moisturiser look mediocre to exactly
the person it suits — the median real formula carries no acne active at
all. Not causing breakouts *is* the win for that concern; a formula with no
pore-clogging ingredients is a good match.

**Why per-concern saturation constants exist:** without them, a concern
that's easy to provide evidence for (e.g. "dehydrated" — humectants show up
in 84% of products) is graded on the same curve as a concern that's
genuinely hard to serve (e.g. "fine lines"), and the easy concern's users
see inflated 80s while everyone else sees deflated 60s for formulas that
actually serve them equally well.

**Why `hazard` and `irritant` are different tiers, not one:** an earlier
version capped the score on both. That put 40% of the catalogue at "Poor"
for anyone who'd ticked "somewhat sensitive," because 97 of 100 warnings
were the `irritant` kind (an EU-restricted ingredient on skin that reacts) —
a real risk, but not the same severity as `hazard`. A sensitive user could
never receive good news under that scheme. `irritant` now goes through the
graduated irritation penalty instead of a hard cap.

**Why the comedogenic threshold is a named constant, not an inline number:**
`comedogenic >= 3` used to be written directly in three different screens,
and it drifted between them. `COMEDOGENIC_FLAG_THRESHOLD` /
`COMEDOGENIC_SEVERE_THRESHOLD` in `lib/safety.ts` exist so there's exactly
one place that number can be wrong.

## SDK and platform history

**The SDK 54 pin.** The project was pinned to SDK 54 for a stretch because
that was the last version Expo Go shipped on the Apple App Store at the
time — letting it install on a physical iPhone without weekly re-signing via
sign.expo.dev. It has since moved to SDK 57. That convenience does not
carry forward automatically: Expo Go's App Store build tracks one SDK
version at a time, so an SDK upgrade can put physical-device testing a step
ahead of whatever Expo Go currently ships on the App Store.

**The NativeWind prop-interop question is not fully closed.** The SDK 54
pin was also credited with avoiding a NativeWind prop-interop bug on React
Native 0.86. What's established: `nativewind@4.2.6` runs on
`react-native@0.86.3`, its runtime `react-native-css-interop@0.2.6` declares
`react-native: "*"` (no declared upper bound), and the codebase contains no
function-valued `style` on `Pressable` — so the workaround is being
observed, not merely documented. What's *not* established: whether the
rendering bug itself would actually occur if that convention were broken.
Nobody has put eyes on a running app to test it since the SDK 57 upgrade.
Treat this as "no evidence of a problem," not "confirmed fine."

**Web barcode scanning changed shape at SDK 57.** At SDK 54, `expo-camera`
used jsQR in the browser, which only decoded QR codes — so EAN-13/UPC-A
scanned on native only, and the scanner used to narrow `barcodeTypes` by
platform, and default to Search mode on web (since a barcode viewfinder was
a dead end there). `expo-camera@57.0.4` now uses the browser's own
`BarcodeDetector` (via the `barcode-detector` polyfill where needed), which
covers `ean_13`, `ean_8`, `upc_a`, `upc_e`, `code_128` and more — confirmed
by reading `node_modules/expo-camera/build/web/WebBarcodeScanner.js`
directly, not by testing in a browser. Nobody has yet held a physical
product up to a laptop webcam and watched it decode; the format support is
verified from source, the end-to-end experience is not.

Issue #11 ("Web barcode scanning is QR-only on SDK 54") is still open on
GitHub as of this writing, even though the underlying fix appears to be
shipped in the dependency itself. Worth closing once someone actually
confirms the webcam path works, or reopening/renaming if a different gap
turns up.

**On-device OCR trust boundary staleness.** `docs/threat-model.md`'s
on-device-OCR section was once tracked down and corrected after drifting
from reality — that's the incident issue #16 (still open) originally
captured. Check that section against current code before trusting it
blindly; documentation about trust boundaries is exactly the kind of thing
that goes stale silently.

**Android's Play Store version can be *newer* than the project, not
older.** Unlike Apple's queue-based lag, Android's Play Store Expo Go build
has refused this project for the opposite reason at times — it shipped
ahead of the project's SDK. `npx expo-go download android <sdk>` sidesteps
this in either direction.
