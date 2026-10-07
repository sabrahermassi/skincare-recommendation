# Decisions

Why the rules in `CLAUDE.md` exist — incidents, history, and anything not yet
fully established. `CLAUDE.md` states the rule; this explains the evidence
behind it. Read this when you want the reasoning, not before every task.

## Ingredient dictionary

**Do not promote unmatched ingredient stubs by frequency.** Seeing the same
text on several products establishes frequency, not identity. A repeated OCR
error or broad name such as `iron oxides` can still map to several different
INCI entries, and choosing one would attach the wrong safety record. `verified`
continues to mean matched to a checked source. The complete 21 September 2026
decision and per-name ledger are in `docs/ingredient-coverage.md` and
`docs/ingredient-stub-review.json`.

**An Annex II citation is not always a ban (5 October 2026, owner).** The dictionary
import read every Annex II citation as a flat prohibition, so 83 of 2,846 staging
products carried "flagged as best avoided" and a score capped at 45. Checked against
the regulation's text, four groups were wrong, and one needs the owner's call:

- **Entry 358 (natural essences).** It is the entry for furocoumarins, "except for
  normal content in natural essences used", and below 1 mg/kg in sun protection and
  bronzing products. The taxonomy cites it on 44 essences (citrus, rue, cumin). Now
  `safe`, with a note saying what the entry limits; cumin keeps its Annex III citation
  as a restriction. The entry also prohibits the furocoumarins themselves, so the
  correction applies only to a name with citrus, ruta or cuminum in it; any other
  name keeps the ban until it is reviewed.
- **Entry 764 (alkanes).** Prohibited only "if they contain > 3 % w/w DMSO extract". The
  three taxonomy names (C14-19, C15-19, C18-21 alkane) are written `safe`, with a note that
  names the DMSO condition (not petrolatum's refining history).
- **Entry 306 (cannabidiol only).** CBD as such is outside it; CBD from cannabis extract,
  tincture or resin is inside it. Neither banned nor cleared: `safe` (no charge), with
  the note "EU rules depend on how it's made." Nine other taxonomy entries cite 306
  (cannabis flower extract, seed cake, hydrolysed hemp seed extract) and were not
  reviewed: none is in the staging catalogue.
- **Entries 1339, 1375, 1380** (hydroquinone, isobutylparaben, HICC) are genuine and
  unchanged. HICC's note now says its dates plainly: not on the EU market since
  23 August 2019, not to be sold since 23 August 2021, older stock may still be around.
- **Acrylamide and acrylonitrile are not dictionary errors.** All four staging hits are a
  polymer name split by the label parser (`Acrylamide/Sodium Acryloyldimethyltaurate
  Copolymer`). That is a parser fix, tracked apart from this one.

`safetyFor` in `scripts/import-inci-dictionary.mjs` makes the exemptions, and
`supabase/migrations/0030_annex_ii_corrections.sql` fixes the rows already written;
keep their notes' wording the same (`__tests__/annex-ii-corrections.test.ts` checks it).
Evidence for 358, 764 and 306 came from the regulation as copied on legislation.gov.uk,
which stops at the end of 2020; the owner confirms 1339, 1375, 1380, 358, 764 and 875 on the
current consolidated EUR-Lex text before the safety notice is switched on.

**A citation can name an entry the regulation has since deleted (7 October 2026, owner).**
The taxonomy still cites Annex III entries that no longer exist, so the import wrote some
EU bans as "Restricted use". Checked against the consolidated Regulation (EC) No 1223/2009
(version 18.05.2026, Publications Office copy) and CosIng:

- **Now prohibited (Annex II):** butylphenyl methylpropional (Lilial) is 1666 (Regulation
  (EU) 2021/1902, from 1 March 2022; it was cited as III/83); boric acid is 1395 and diboron
  trioxide 1394 (Regulation (EU) 2019/831); every boric acid salt or ester is 1396
  (2019/831, replaced by 2019/1966), because that regulation deleted Annex III entries 1a and
  1b; dichloromethane is 1389 (it left Annex III/7 in 2019/831); sodium perborate is 1397
  (2019/831, which Regulation (EU) 2026/78 replaced from 1 May 2026, merging 1398 and 1399
  into it; Annex III/12, hydrogen peroxide, excludes it by name).
- **Matched by INCI name and class, never by CAS:** CosIng and the regulation give
  potassium borate different CAS numbers. Magnesium ascorbylborate has no citation in the
  taxonomy, so it is named on its own (`UNCITED_BORATE_SALTS`); CosIng lists it as II/1396.
  Phenyl mercuric borate is Annex V/17 (a preservative allowed in eye products only): the
  owner followed CosIng rather than reading 1396's class wording onto it, so it keeps its
  rating with the note "EU Annex V/17", like its phenylmercuric siblings. A borate that cites
  anything else is left as it was.
- **Renumbered, still restricted:** Regulation (EU) 2023/1545 deleted entries 125, 126, 158,
  160-163, 165, 167 and 168 and merged them into 124, 157 and 88; 19 is now 227; and the
  old Part I numbering ("Annex III/I/256 - Directive 2012/21/EU") is the current entry by
  ingredient name. Only the note's entry number changes.

`staleCitationFix` in `scripts/import-inci-dictionary.mjs` makes the corrections and
`supabase/migrations/0032_annex_stale_citations.sql` and `0033_annex_boron_followup.sql` fix the
rows already written; keep their notes the same (`__tests__/annex-stale-citations.test.ts`, and
`supabase/tests/annex_stale_citations.test.sql` and `annex_boron_followup.test.sql` against a
real Postgres). Entries 1389 and 1397 joined the safety-notice list on #434. The score impact is
in the #419 PR.

**How old an ingredient list is, is when it was photographed (7 October 2026, #446).** A
barcode result shows Open Beauty Facts' copy of the list. `fetched_at` is when we last read the
row, and OBF's `last_modified_t` moves whenever one of its bots touches a product, so neither
says how old the formula is. `products.ingredients_photographed_at` (migration 0034) is the
upload time of the photo OBF has selected as the ingredients picture, the newest across
languages, read by one shared function (`supabase/functions/_shared/ingredients-photo-date.mjs`)
in the import, the reconcile job and `product-lookup`. Null means OBF has no photo of the list.

- **A writer that did not look cannot wipe the date.** `replace_product_with_ingredients` keeps
  the stored value when `p_product` has no such key, and replaces it (null included) when it has.
- **The product screen's notice** (`lib/list-age.ts`) replaced the old one that fired six
  months after `fetched_at`. For an OBF row with a photo date it shows the year plainly
  ("Ingredient list from 2019."), never as a warning; with no photo date it says nothing. A
  label scan is the bottle in hand and never shows it.
- **No age alone is a warning (owner, 7 October 2026).** The first version warned past two
  years and on a missing date, which put it on nearly every barcode result (of the first 132
  backfilled, 58 had no photo and 66 of the other 74 were over two years old). Nobody
  publishes how often a cosmetic formula changes: an industry poll (Cosmetics & Toiletries)
  has 35% reformulating regularly, 52% occasionally, 13% rarely or never, and brands give
  regulation, supply and customer demand as the reasons, on no fixed schedule. So any cutoff
  would be a guess. The one change that is predictable is an EU ban, which is the only case
  that gets a warning.
- **"Which the EU has banned" is said only where the safety notice may say it:** an ingredient
  on the owner-verified list (`SAFETY_NOTICE_ENTRIES`), with the safety-notice flag on. The
  issue asked for it on any `avoid` ingredient; `avoid` also covers rows that are not EU bans
  and citations that have been wrong (0028 to 0032), so that wording waits for the same
  switch as the notice it repeats. Turning it on for everyone is the owner's call.
- **The nightly reconcile job is what keeps the date current**, and it has failed every night
  since 22 September 2026 (it needs `SUPABASE_ENV`, which its workflow does not set). Not fixed
  here: which project that job writes to is the operator's decision.

**An allergen the regulation spells differently from CosIng (7 October 2026, #439).** 37 of
the names in `lib/eu-allergens.ts` matched no dictionary row, for three different reasons,
and only one of them was a missing row:

- **Not in the dictionary (10 printed names, 11 CosIng rows):** added from CosIng through `import:cosing`, from
  `scripts/data/eu-allergen-names.csv`, which keeps each row's CosIng record number and
  link. The import writes the name, the CAS number and CosIng's functions, and no rating.
- **In the dictionary under CosIng's spelling (18 printed names, 19 CosIng names):** Annex III prints "p-Phenylenediamine
  Sulphate", "Acetyl Cedrene", "Dihydroxy indoline", "Rose ketone 4 (Damascenone)"; CosIng,
  and so the dictionary, says "Sulfate", "Acetylcedrene", "Dihydroxyindoline", "Rose
  Ketone-4". A synonym would not fix this: a synonym turns a label's text into the
  dictionary's name, and it is the dictionary's name the allergen list has to know.
  `COSING_SPELLINGS` lists each one with its CosIng record number, added only where that
  record's CAS number is the one the entry prints.
- **In the dictionary, but the lookup could not see it (4):** the dictionary writes brackets
  as spaces, and the lookup did not.

CosIng's "Damascenone" is deliberately not one of them: its record also covers a CAS number
entry 157 does not print. Left out (5), four because CosIng has no record under that INCI name: cis- and trans-Rose ketone 1
(CosIng files both under Alpha-Damascone, already listed), 2,6-Dimethoxy-3,5-pyridinediamine
(only the HCl has a record) and 5-Amino-6-Chloro-o-Cresol HCl (only the base has one). And
3-Propylidenephthalide (175), which the dictionary holds as "propylidene phthalide", an Open
Beauty Facts name CosIng does not use: recognising that is the owner's call. The effect on
scores is in the #439 PR.

**How each ingredient name was matched (7 October 2026, #458).** A regulatory notice must not rest
on a name the parser guessed, so each stored ingredient now says how its name was reached:
`product_ingredients.match_confidence` (migration 0036), one of `exact` (the dictionary's own
name), `alias` (a known synonym or common name), `corrected` (one letter fixed), `rebuilt` (the
parser decided where the name starts or ends), or null for "not known". `isHighConfidenceMatch`
in `lib/safety.ts` is the one place that says which are high: `exact` and `alias`. Nothing on
screen changes yet (step 7), and existing rows stay null until step 6 reads them again.

- **`rebuilt` means the parser chose a boundary,** not only the no-delimiter path the issue named.
  That covers a list with no delimiters, two names run together, a name salvaged from a heading
  fragment ("preservatives: panthenol") and a name the comma-mender joined. In each the letters
  are right but the claim that the label lists this name rests on the parser's cut. The importers'
  copy of the parser has no fuzzy reconstruction of a list with no delimiters, so it never
  returns `rebuilt` from that path; the shared fixture marks that one case for the other two copies only.
- **A spacing repair that had to choose between several dictionary spellings is `corrected`;**
  with one candidate, or through a synonym, common name, fixed spelling variant, slash or
  `&` join, it is `alias`.
- **A name printed twice keeps its first position and the weaker of its matches,** so a corrected
  copy cannot hide behind an exact one.
- **A read with no dictionary (the first read in `label-ocr` and `product-lookup`) repairs
  nothing, so a printed name is `exact`** — "not changed", not "known". A name the dictionary does not
  hold at all is null. `isHighConfidenceMatch` only says how a name was reached; whether it
  is a real dictionary entry is `isVerified`, and a notice needs both.
- **It is carried on the product (`Product.ingredientMatches`, line for line with `ingredientIds`),
  not on `Ingredient`.** `Ingredient` objects are shared by every product holding the name, so one
  label's typo-fix would read as every other product's. An unset field and a null entry both read as low.
- **The writers send it by passing the parser's own objects** (`{ inci_name, position, match }`) to
  `replace_product_with_ingredients`, which reads the `match` key and ignores it in an older
  version of the function, so the code can deploy before the migration without breaking a write.
  The reads that ask for the column (`product-lookup`, the app) need the migration first.
- **Not done here:** the scripts that rename stored names in place (`clean-ingredient-stubs.mjs`,
  `fix-duplicate-ingredients.mjs`) leave the stored match next to a name that has changed.

**The official Annex II and III text, parsed (7 October 2026, #455, step 2 of 9).** The safety
notice rests on nine entries checked by hand and on entry numbers Open Beauty Facts cites, which have
been wrong several times (#419, #434). `scripts/lib/eu-annex-parse.mjs` reads both annexes from the
Publications Office's copy of the consolidated Regulation (EC) No 1223/2009 (EUR-Lex itself answers a
script with an empty HTTP 202), and `npm run import:eu-annexes` fetches the newest text, parses it and
writes `.eu-annexes.json` with `--apply`. It writes no database row: step 3 adds the tables.

- **Counts, 18 May 2026 text (02009R1223-20260518):** Annex II is 1,945 table rows: 3 header,
  47 marker, 1 footnote, 1,762 entries (25 "Moved or deleted") and 132 continuation rows. Annex III is 740:
  3 header, 136 marker, 379 entries (3 moved or deleted, 4 printed as a number with nothing beside it)
  and 222 continuation rows. Every row is one of those, and the run stops if any is not. The other
  578 `<tr>` of the file's 3,263 belong to Annexes I and IV to X.
- **Numbers the text does not print:** Annex II 382, 1398, 1399, 1427 and 1669; Annex III 1, 7, 13, 79,
  83, 101, 125, 126, 158, 160-163, 165, 167, 168 and 311. There is nothing to keep for them. A source
  that cites one of them is citing a number that is not in the text.
- **An entry can span several rows.** A class entry (borates, 1396) lists its salts in rows of their
  own; they are kept as `members`. An Annex III entry written over several rows keeps one set of
  conditions per row. Some `rowspan`s in the file run past the
  entry they belong to (Annex III entry 73's glossary name covers entry 74's row too), which shifts that
  entry one column to the right: read naively, 108 Annex III rows came out wider than the table's nine
  columns. A new entry never inherits cells from the one above, and none comes out irregular now.
- **The amendment mark** comes from a row of its own (`▼M32`, `▼B` for the original text, `▼C6` for a
  corrigendum) that holds until the next one, or from the reference cell (`►M4 22`). The act it names is
  read from the list at the top of the file. For the nine entries on `SAFETY_NOTICE_ENTRIES`, the parser's
  entry, substance and amending act agree with what the owner verified by hand (`__tests__/eu-annex-parse.test.ts`).
- **What the regulation prints oddly is kept, not repaired:** a CAS number with a stray space
  ("72623- 86-0") is read as 72623-86-0; an index number printed in the EC column (15 Annex II rows,
  such as 613-062-00-4) is not an EC number, so it is kept as `unparsed.ec` and listed in `warnings`;
  a qualifier such as "HCl" or "Na" in a CAS cell is kept the same way, without a warning.
- **Credit line assumed for the text, until the owner confirms the reuse terms:** "Source: EUR-Lex,
  consolidated text of Regulation (EC) No 1223/2009 on cosmetic products (CELEX 02009R1223-20260518),
  © European Union, https://eur-lex.europa.eu/, 1998-2026. A documentation tool with no legal effect: only
  the Official Journal text is authentic." It is written into the output file and nowhere in the app yet.

**The official text, stored (7 October 2026, #456, step 3 of 9).** Migration 0038 adds
`regulatory_entries` (one row per Annex II or III entry, with the text's version, SHA-256 and
consolidation date on every row) and `ingredient_regulatory` (which dictionary ingredient an entry is
about; filled in step 4). Public read, service-role write, their own `updated_at` bumped by their own
trigger, and nothing written to either touches `ingredients`, so the dictionary's watermark does not move.

- **`import:eu-annexes --apply` writes the database** (through `connect({ write })`, so it needs
  `SUPABASE_ENV`, and `--prod` for production), after the JSON file. It upserts only rows that differ, so a
  second run of the same text writes nothing, and an entry a newer text no longer lists is marked `deleted`, never
  removed. A moved, deleted or blank number is stored as `deleted`.
- **`last_verified` is the date of the consolidated text, not the day of the run,** so the same text gives the
  same row. `effective_date` stays null: the consolidated text does not print it per entry.
- **Columns beyond the issue's list:** `inci_name` (Annex III's glossary name, which step 4 matches on), `members`
  (the substances under a class entry such as the borates) and `mark` (the amendment mark), so the parsed text
  is kept whole.
- **The app has its own freshness mark for these tables** (an exact count and the newest `updated_at` of each),
  apart from the catalogue's watermark and the dictionary's, so importing the regulation never makes a device
  refetch the catalogue. `loadRegulatory` in `data/api.ts` reads the mark, then the rows, and
  `data/catalogue-cache.ts` keeps them as one value (about a megabyte). Nothing on a screen reads them yet.
  `SCHEMA_VERSION` went to 6, which sweeps the v5 blobs and makes every device read the catalogue once more.

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

**The skin profile lives in the Keychain on a phone (#189, 26 September
2026).** Pregnancy status may be special-category health data (#14), and
AsyncStorage is a plain-text file that backups copy. The profile moved; the
rest of the store (history, shelf, flags) stayed, since it is too large for
a Keychain item and the ticket scoped it out. `formeStorageFor` splits the
profile out at the storage layer, so there is still one store and one
hydration. Web keeps it in the file: no Keychain, not a release target.

*Consequence, accepted:* the Keychain item is this-device-only, so **a
profile does not come across to a new phone through a backup or transfer**.
The person answers the four quiz questions again. The shelf still comes back
with the account; the history, as before, does not leave the phone.

*Same ticket:* scan history is also capped at 90 days since last seen, on top
of the 50-entry limit.

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

*Update, 26 September 2026 (#317):* Browse no longer holds a catalogue list
at all. It became a search-first tab, with results only once you type, read
from the cache on each keystroke. So the focus re-read went with it, and
the reason to revisit this got weaker, not stronger.

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

**Which rule categories feed the irritation accumulator** was deliberately
left out of the contact-weight PR (#127), and has since landed on its own.
Today `fragrance`, `alcohol` and `irritants` rules feed it as before, and so
does **any rule with `hurts: { sensitive: true }`**, whatever its category
(`hurtsReactiveSkin` in `lib/matching.ts`). That widening catches salicylic
acid, AHAs, retinoids, vitamin C, tea tree oil and benzoyl peroxide, and it
charges each only once. A plain leave-on salicylic serum moving from fair to
poor for a highly sensitive profile was the measured gap it closed. Since
#183, "sensitive" on the harm side also covers a scored profile with
sensitivity unset. (This paragraph used to say the widening had not
happened; #175 corrected it.)

**How much `unknown` matters has changed.** The paragraph above reasons from
`unknown` being roughly 28% of the imported catalogue. On staging on
2026-09-24 it was about 2% of products with a formula (#175), after the
classifier work. The 0.25 benefit discount is kept, but it now affects a
small minority of scores rather than a quarter of them.

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

**Why declared antioxidant and UV-absorber functions earn nothing (#175):**
the fallback layer that scores CosIng's declared functions credited
`antioxidant` to fine lines, dullness and dark spots, and `uv-absorber` to
dark spots and fine lines. Both functions describe the *product*: the EU
ingredient inventory defines an antioxidant as something that "inhibits
reactions promoted by oxygen, thus avoiding oxidation and rancidity", and a
UV absorber as something that protects the cosmetic product from light. The
skin-protecting counterpart is `uv-filter`, which stays. So BHT and sodium
metabisulfite were being scored like vitamin C, and shown under "Why this
score" as "an active with a relevant effect". The antioxidants with real skin
evidence each have a named rule, and a named rule always wins over a declared
function, so removing the two signals only stops crediting preservation
chemistry. Measured on 1,107 scoreable staging products:
- dullness + dark spots (somewhat sensitive): 507 scores fell by 1-8 points,
  and the mean went from 61.5 to 60.4;
- fine lines + eczema-prone (somewhat sensitive): 483 fell by 1-6, and the
  mean went from 63 to 62.4;
- 106 verdicts dropped a band in total. The four other fixed profiles did not
  move.

The same definition made the sun nudge wrong in the unsafe direction. An
ingredient tagged only `uv-absorber` (a stabiliser in an AHA serum) counted
as sun protection, and silenced "pair this with a daytime SPF". Only
`uv-filter` counts now.

**Why `hazard` and `irritant` are different tiers, not one:** an earlier
version capped the score on both. That put 40% of the catalogue at "Poor"
for anyone who'd ticked "somewhat sensitive," because 97 of 100 warnings
were the `irritant` kind (an EU-restricted ingredient on skin that reacts) —
a real risk, but not the same severity as `hazard`. A sensitive user could
never receive good news under that scheme. `irritant` now goes through the
graduated irritation penalty instead of a hard cap.

**Why the comedogenic threshold is a named constant, not an inline number:**
`comedogenic >= 3` used to be written directly in three different screens,
and it drifted between them. `COMEDOGENIC_FLAG_THRESHOLD` in `lib/safety.ts`
exists so there's exactly one place that number can be wrong. (A second,
`COMEDOGENIC_SEVERE_THRESHOLD`, went with the hazard that used it — see
"The comedogenic hazard is gone", 6 October 2026.)

### The comedogenic hazard is gone (6 October 2026, #406)

`contraindications` once raised a `hazard` for acne-prone skin when an
ingredient's 0-5 comedogenic rating was 4 or more ("Pore-clogging (N/5) and you
flagged acne-prone skin"). The rating is deliberately empty for every
catalogue row (`ComedogenicRating` in `data/types.ts`: the scales descend from
1970s-80s rabbit-ear assays, they are contested, and no openly licensed
dataset exists), so the branch could only fire on the 8 sample products.
Owner decision: remove it, with its tests and `COMEDOGENIC_SEVERE_THRESHOLD`.
Pore-clogging is warned about only from `lib/pore-clogging.ts` (hand-written
families with a confidence tier); an oily skin without a pore-led concern gets
a plain sentence on Skin match for the same cloggers the score charges it for.
`verdictHeadline` and `scoreExplanation` went in the same ticket: no screen
called either.

### The EU safety notice is flag-gated and list-gated (6 October 2026, #404)

The notice ("not permitted in EU cosmetics. Please check the label.") speaks
for an Annex II entry only when two things hold: the persisted flag
`safetyNoticeEnabled` is on (default off, so every screen is unchanged), and the
entry is in `SAFETY_NOTICE_ENTRIES` (`lib/safety.ts`) **with a verified date**.
HICC (1380) and isobutylparaben (1375) were verified by the owner on 5 October
2026; hydroquinone (1339) was listed with no date, and so did not fire, until the owner verified it on 7 October 2026 (Regulation (EU) No 344/2013; the entry excepts Annex III entry 14, professional artificial nail systems, which the app does not mention: the owner left it out, 7 October 2026). Entries
358 and 764 (exemptions, #401) and 875 (unexplained) are not prohibitions and
are not on the list; acrylamide (681) and acrylonitrile (682) join only after
#402's fix and the owner's check. Nothing is added from memory. One function,
`safetyNoticeHits`, decides it for every screen, so the lists and the share text
(#405) cannot disagree with Skin match. With the flag on, "Avoid" on the
Ingredients tab names its reason (Check label, May clog pores, Best avoided
while pregnant) and keeps "Avoid" only for an Annex II row or hazard the owner
has not verified.

The shield beside a score (ScorePill, list rows, the scanner's found card,
routine picks, Saved and History) and the share line "{brand} {name}, checked on
for.me" (#405) ask the same function. History does not store the shield: it is
worked out from the product as it is loaded now (the same single batch Saved
uses), so a correction to the data (#401, #402) changes old entries, and a
product that cannot be loaded shows none.

### Skin needs is a path of its own (2 October 2026)

Skin needs stands apart from the skin profile, by the owner's decision. What
someone wants to work on this week (a breakout before a period, a dry spell in
winter) is not what their skin is like all year, so the journey asks fresh
every visit, reads nothing from the profile and writes nothing to it: one
thing to work on, and two optional answers (sensitive skin, pregnant or
breastfeeding).

**Amended 7 October 2026 (owner):** asking twice was the problem. Sensitivity and
pregnancy now start from the skin profile when it holds them, still tappable
and with a "From your profile" tag until changed; nothing is written back. The
goal and the actives in use are still asked fresh every visit. Of thirteen
goals, six show and the rest sit behind "+ 7 more" (open at once when the
picked goal is one of them).

A scan opened from there does not get the skin match. The first build reused
it, scored for the pick, and called a dark-spot serum "80, good match" for
pimples: the score answers "does this suit my skin", and for acne most of it
is "nothing in it clogs pores". So that path has its own check
(`needVerdict`, `lib/journey.ts`) and **the skin match is not to be touched
for it**: every other way into the scanner keeps the profile's score.

- The answer is one of three sentences, with no 0-100 score: "Works on",
  "Helps a little with", "Not made for". The owner chose that wording; it is
  a stronger claim than a compatibility score, and it is audited with the rest
  (`__tests__/claims-policy.test.ts`).
- Only actives count. Hydration, barrier and calming ingredients count where
  the pick is one of those (dry skin, the barrier, eczema-prone skin,
  redness) and are otherwise named once as support.
- The check reads names off the label and cannot know concentrations. It uses
  the one thing the label says: an active in the trace stretch of the list
  helps a little at most. Where pores are the point (pimples, pores, oil) a
  strong pore-clogger caps the answer there too.
- "Eczema-prone" is not a quiz option (see the quiz's concerns step) but is a
  Skin needs pick, worded "Care for eczema-prone skin": the pick is a thing
  to shop for, not a statement about the person's skin.
- "Smooth rough texture" has no rule tagged for it; its actives are picked by
  hand. Tagging the rules would change every product's score.
- History keeps the skin profile's score for a product scanned this way: the
  log is the person's own, and one number per product.

### Skin needs becomes an ingredient story (3 October 2026)

The flip-card deck was replaced by the "october 3d" hand-off
(`BHA-STORY-README.md`): four question cards, a carousel of up to three
actives for the goal, and a six-card story per active that ends in "Add to my
routine". Not both: the deck is gone.

- **One list of actives** (`lib/skin-needs-data.ts`), owner's choice: every
  story is filled from it, and the scan-from-Skin-needs check and the routine
  builder read their actives from it too (`JOURNEY_CARDS` is now derived from
  the records with a `result`). Their behaviour was kept: the same names, the
  same order, the same rules. The scoring is untouched.
- **All advice copy is placeholder** and needs a scientific check before
  launch: strengths, frequencies, pairings, pregnancy notes and the goal →
  families table. Two lines of the hand-off were reworded for the claims
  policy ("Seals moisture in and repairs" → "supports your barrier"; "Your
  evening treatment step" → "active step").
- **The claims that matter most are checked against sources** (owner, 3
  October 2026): each active's `sources` holds a PubMed/PMC paper or a
  dermatology body's page for its pregnancy flag, its start and what it
  avoids, marked as backing the claim, partly, or not. Where a source says
  otherwise, the owner kept the claim as it is:
  - BHA and arbutin stay hidden in pregnancy, though the AAD and Putra et
    al. 2022 call them safe: the AAD only for limited use of BHA, and arbutin
    is close kin to hydroquinone, which is prescription-only here.
  - Azelaic acid starts at three nights a week, though trials use it twice
    daily: above 10% it is not that gentle.
  - Retinoids start at two nights a week, though the AAD says every other
    night: they can be strong.
  - Benzoyl peroxide and retinoids are still not layered, though adapalene
    gels hold both: benzoyl peroxide breaks down tretinoin (Feneran et al. 2011).

  Peptides, PHA, zinc, ceramides, centella, oat, ferulic acid, copper
  peptides and tranexamic acid have no pregnancy source yet, and most gentle
  actives have none for their start.
- **Skipped answers**: sensitivity counts as somewhat sensitive; pregnancy,
  skipped or "Prefer not to say", counts as yes (safe options only, with
  "Not pregnant? Change"). When that leaves a gap, one safe option from a
  nearby family is added (owner): azelaic acid for pimples, pores, oil and
  dark marks, vitamin C for lines.
- **Over-the-counter only.** A product scanned from Skin needs that holds
  tretinoin, tazarotene, trifarotene, hydroquinone, or adapalene outside the
  US gets "Talk to a doctor first", with the over-the-counter option unless
  pregnancy is anything but no. Adapalene's country is the phone's region
  setting (`lib/region.ts`), not its location: no permission, works with
  Location Services off; unknown counts as prescription (owner).
- **"No routine yet"** means no routine built and nothing added from a story
  (owner; first "no skin profile", changed on 3 October 2026: a skin profile
  alone is not a routine). The first routine is built only when the person
  opens "Your skincare routine" with a skin profile (`routineBuilt`), or
  starts one from a story; filling in the skin profile after a scan leaves
  Home on "Start your routine". "Let's start your routine" then starts one with the basics and the
  step limit chosen (3, 4 or 5, default 4); the steps show with no products
  picked until there is a profile. The limit counts every step in one
  routine; cleanse, moisturise and SPF (first cleanse, cleanse and moisturise
  at night) are basics and never swapped.
- **The routine by day.** An added active has a time (morning or evening)
  and days, set from its start plan and the sensitivity; clashing actives
  are put on different nights. On an active's night the step names the
  catalogue's best product that holds it (owner); other nights say "Rest
  night" and when the next one is. Kept on the phone only (`routineActives`,
  `routineStepLimit`, `routineStarted`), like `routinePicks`.
- **SPF comes first for lines and dark spots** (owner, 3 October 2026, after
  research): the AAD's wrinkle advice and its dark-spot advice both start
  with daily broad-spectrum SPF 30+, and a 4.5-year randomised trial (Hughes
  et al. 2013) found 24% less skin ageing with daily use. SPF is the best
  first pick for Lines and wrinkles, Fade dark marks and Even skin tone, and
  second for Fade red marks and Brighten dull skin. Sunscreen is already a
  basic step of every routine, so its story ends in "Already in your
  routine" rather than an Add button.
- **A story for every active, chosen per person** (owner, 3 October 2026:
  "each person requires a different active"). A goal lists families, each
  with its actives in the goal's order; a person gets the first that is safe
  for their pregnancy answer and that they don't already use, or the
  family's gentlest when very sensitive (BHA → PHA, a retinoid → bakuchiol,
  vitamin C → tranexamic acid). Retinoids stay one story, as the hand-off
  says. Arbutin and bakuchiol are left out while pregnant until checked.
  Whether a product holds an active is read off the active's own label names
  (`match`), not the scoring rules, which group several actives in one.
- **A scan from a story is judged against what that person was shown**
  (owner, 3 October 2026): "Check a product" compares the label with the
  carousel's actives for those answers, so a product holding one works on the
  goal, and "We looked for" names them. Only scans started from Skin needs;
  every other scan keeps the skin match.
- **"Start easy" is "How often do I use it?"** (owner).
- **The story slides up from the bottom** when a card is tapped, rather than
  the card growing into it as drawn: the owner saw both and kept the slide
  (3 October 2026).
- **The toast sits under the story's header**, not over it as drawn: over
  it, its Undo was where the close button is, and a tap meant to close undid
  the add (found in the simulator).

### The routine builder picks from the catalogue (2 October 2026)

The Skincare routine screen names products for each step, by the owner's
decision (`lib/routine-builder.ts`). A basic step (cleanse, moisturise,
sunscreen) takes the best skin matches of that type. The morning serum and the
evening treatment must hold an active for the profile's concerns, by the same
check a Skin needs scan uses, and always say which actives to look for.

- **Why the active steps so often name nothing, and what changed.** Open
  Beauty Facts is the only product source we may keep (INCIDecoder,
  Skincarisma and EWG Skin Deep forbid reuse; INCIDB is OBF resold; DailyMed
  has no barcodes). The API sweep pages six categories, which held 28 serums
  of 1,114 products, and adding six more categories found nothing new. But the
  six categories are a small corner of the source: its nightly export holds
  about 21,000 complete products, a third of them with no category tag, which
  no category sweep can reach. `import-obf.mjs --dump` reads the whole export
  (2 October 2026): 2,831 usable face products, about 1,750 of them new, about
  140 new serums among them. What keeps the shampoo and hand soap out is
  `scripts/lib/face-skincare.mjs`: a row must be typed as face care by its
  name or tags, never by its ingredients alone, and nothing in its name, brand
  or tags may say it is something else. The first run kept 25 more: German
  writes the kind of product as the end of one long word ("Cremedusche",
  "Enthaarungscreme", "Spezialzahncreme"), which a whole-word match never
  saw, so a hair-removal cream showed in the app as a fair-match moisturiser.
  Those words are matched inside longer ones now. A row in one of the six
  categories is still kept on OBF's word, whatever its name says.
- **Nothing is recommended that the skin match warns against**: a hazard, a
  pregnancy caution, a match under "fair", or a label too little of which was
  read.
- **Types are guesses, so names can veto.** A nail polish remover and a
  pimple patch are typed as cleansers and an exfoliating lotion as a
  moisturiser. The builder keeps a product out of a step when its name says
  it is something else. That is a patch over the catalogue's typing, not a
  fix for it.
- **A product opened from the routine is the normal product screen**, scored
  with the skin profile like any scan.
- **The serum and treatment steps lead with the active, not the product**
  ("Vitamin C" in the heading font). The owner's reasoning: the catalogue
  often has no product to name, and the active is the advice either way.
- **"Add to my routine" keeps a product of one's own in a step**, offered on
  a result for a good skin match, or from Skin needs for a product that works
  on the pick. The app chooses the step (`routinePlacesFor`): a strong active
  goes to the evening treatment, any other serum to the morning. One product
  per step. It is kept in the store's `routinePicks`, **on the device only**:
  syncing it to the account needs a table and RLS, which is the owner's call
  and was not taken. It is not part of the shelf, so sign-out leaves it and
  "erase everything" clears it. A label-photo result has no product to keep,
  so it has no button.
  **Removed on 3 October 2026 (owner):** too many places to add from. A
  result no longer offers "Add to my routine"; adding belongs to the routine
  itself (a step's scan) and to Skin needs. Picks already kept stay, with
  their Remove on the routine screen.

### Home: the routine card and the skincare tip (3 October 2026)

Built from `handoff_home_and_tip` (nothing else in the app changes). Owner
decisions:

- **One top card.** "Start your routine" until there is a routine, then
  today's routine (butter before 3 pm, light blue after) with the active and
  its steps as pills, folding to "+N" past three. The wide Scan card and the
  Skincare Routine tile are gone; Explore is Scan Any Product and Find Your
  Actives.
- **A routine is one the person made**: built by opening "Your skincare
  routine" with a skin profile (`routineBuilt`), or started from a Skin needs
  story. A skin profile alone, say filled in after a scan, is not one. Home
  builds the card from the same routine the routine screen shows
  (`lib/routine-rows.ts`, built in the background by `prepareRoutine`), so the
  two agree; it holds the card and tip back until that is ready. Installs from
  before this had no flag: the v10 migration keeps the routine of anyone who
  already had products or actives in it.
- **Greeting in bold Kalam** (the Allura font is gone). No delete-routine
  button: with no routine Home simply shows "Start your routine".
- **The tip**: the SPF in the morning, tonight's active in the evening (the
  next of two or more each night), the rest night, or a general tip without a
  routine. "Tip read ✓" and "Next tip: …" are kept on the phone (`tipRead`).
  Reduce Motion shows the note at once.
- **All tip text is in `lib/skin-tips.ts`**: the owner's 31 general tips, each
  with a reason added; the morning, evening and rest-night tips are
  placeholder copy for the owner to review.
- **A product is added from a routine step only** (owner: too many places to
  add from). The step's "Scan one to check" carries the step to the scanner,
  and the result of a scanned catalogue product shows "Add to <step>" when
  the product belongs in that step and nothing in it is a hard warning
  (`components/AddToStep.tsx`). From anywhere else, and for a label photo
  (no product to keep), there is no Add button; the old one on every result
  is gone. Actives are added from Skin needs stories.

### Two bans shown as allowed, and the safrole entry (#468, 7 October 2026)

The credibility audit compared every dictionary row with the consolidated
Regulation (EC) No 1223/2009 (version 18.05.2026) by CAS number. Fixed in
migration 0035 and in the import, each also listed that way in CosIng:

- **4-methylbenzylidene camphor** is Annex II/1730 (Regulation (EU) 2024/996;
  not placed on the market from 1 May 2025, not sold from 1 May 2026). The
  dictionary still cited its deleted UV-filter entry, Annex VI/18.
- **Cyclotetrasiloxane** (D4) is Annex II/1388. It had no citation.
  Cyclomethicone, a mixture that may hold D4, is left alone.
- **Annex II/360 limits safrole**, it does not ban the camphor-tree and
  sassafras essences that cite it. Same treatment as the furocoumarin entry
  (358): `safe`, with a note that says what the entry limits, all three
  conditions: 100 ppm, 50 ppm in dental and oral hygiene products, and none
  in toothpaste made for children. Migration 0037 adds the third to rows
  0035 had already written on staging.

**Left alone, on purpose.** Benzophenone (II/1703), pentasodium pentetate
(II/1721) and styrene (II/1575) are on the owner's to-verify list in
`lib/safety.ts` but unchanged in the dictionary until their dates and one
label are checked. And three rows the audit first called wrong are not:
CosIng itself puts dimethicone/PEG-3/PPG-15 crosspolymer under II/182,
polyurethane-84 under II/201 and myroxylon balsamum balsam oil under II/1136,
though the regulation's wording for those entries names another substance.
That is a disagreement between the two official sources, for Phase 2's review
list (#457), not something to settle by hand here.

### Skin needs is hidden until an expert has checked it (#467, 7 October 2026)

The credibility audit of 7 October 2026 found Skin needs telling pregnant
people which actives were "safe" ("Safe while pregnant or breastfeeding",
"safe options", "pregnancy-safe options"), in a file whose own header says all
of its copy is placeholder. Two things followed, both the owner's decision:

- **No "safe" anywhere in it.** The filter is described by what it does
  ("We leave out ingredients commonly advised against in pregnancy"), the
  options are "worth knowing", and the lines that speak to someone pregnant
  end by sending them to their doctor or midwife. The field is
  `shownInPregnancy`, not `pregnancySafe`: it says what the screen does, not
  what is true of the ingredient.
- **The section is off** behind `skinNeedsEnabled` (`lib/features.ts`), read
  as `__DEV__ && saved` like the safety-notice flag, with a dev-only Profile
  row. Off, Home has one Explore tile and `/journey` and `/journey-story`
  redirect to Home, so a scan "from Skin needs" cannot start either. Actives
  someone already added to their routine stay in it. Turn it on for everyone
  only after a dermatologist has checked `lib/skin-needs-data.ts`.

### EU "restricted" (Annex III) never adds an irritation charge by itself (#407)

Moved here from `CLAUDE.md`, which keeps the one-line rule. It means *allowed
with conditions* (a maximum amount, a product type, a label warning) and
applies to everyone; the regulation has no skin-type rule. For reactive and
unset sensitivity (same scaling as every other irritant, including the "very
sensitive" fragrance floor, #363), an Annex III ingredient is charged only
when it is **(a)** an EU fragrance allergen — an entry whose wording requires
it on the ingredient list above 0.001% leave-on or 0.01% rinse-off (entries
45 and 67-92, a dozen more, and the 45 added by Regulation (EU) 2023/1545) —
or **(b)** an entry whose required warning mentions an allergic reaction or
sensitisation (almost all hair dye). Every other restricted ingredient is
charged nothing for being restricted; a named rule in `lib/rules.ts` still
charges it by its own weight.

- Both lists live in one code constant, `lib/eu-allergens.ts` (INCI name,
  Annex III entry, regulation, source URL, verified date), each name read from
  the consolidated text and never added from memory or from a dictionary note.
- Where Annex III prints a spelling CosIng does not ("Sulphate", "Acetyl
  Cedrene"), `COSING_SPELLINGS` in the same file holds CosIng's INCI name with
  its record number, because the dictionary is keyed on CosIng's names. The
  names the dictionary lacked are in `scripts/data/eu-allergen-names.csv`, for
  `import:cosing` (#439).
- **Benzyl alcohol (entry 45) is in the constant but exempt**: the entry covers
  it only when it is not a preservative, which a label cannot show.
- An ingredient that is both an allergen and a `category: "fragrance"` rule is
  charged **once, at the higher of the two** (`ALLERGEN_CHARGE` against the
  rule's weight).
- One predicate, `euAllergenFor` in `lib/safety.ts`, drives the charge, the
  warning, the list label and the risk count, so they cannot drift.
- Wording: "{Name} is a known fragrance allergen. The EU requires it on labels
  so sensitive people can avoid it." and "{Name} can cause allergic reactions;
  the EU requires a warning on the label." (`EU_ALLERGEN_COPY`); "Common
  irritant for sensitive skin" is never used for a restricted-only ingredient.
  The ingredient sheet says "Allowed with limits" (with the label duty or the
  Annex III entry number), never "Restricted".
- Irritant rules came with it: hydrogen peroxide and benzalkonium chloride
  (`irritants`), and pine, fir and cypress oils (the essential-oil rule).
  Stearalkonium and steartrimonium chloride were left out: no source supports
  them.

## SDK and platform history

**iOS is the only release target for this MVP, decided 19 September 2026.**
The decision itself was made and recorded in the two hosted scope artifacts
(MVP Scope, Launch Checklist) before it reached this repo — `CLAUDE.md`,
`README.md` and `docs/repository-audit.md` were updated after the fact to
carry it, and this is the entry that gives it an in-repo trail so a reader
doesn't have to take CLAUDE.md's word for when or why. Nothing built for
Android or web is deleted or blocked from running; neither gets further
development or device testing while iOS is the sole target, and revisiting
that needs a real reason, not just that the code still runs elsewhere.

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

Issue #11 ("Web barcode scanning is QR-only on SDK 54") was closed on
13 September 2026, on the strength of the dependency reading above rather
than a webcam test — so the format support is confirmed and the end-to-end
path still is not. That gap no longer needs chasing: web is parked for this
MVP (iOS-only, 19 September 2026), so it stays a documented unknown rather
than open work. Reopen it if web ever becomes a target again.

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

## Larger text (#314, #334)

**Text grows with the phone's text size, up to a ceiling: 1.3× for the
display headings, 1.5× for everything else. Decided 26 September 2026, as the
default in #314's queue comment; the owner can overrule it.** At iOS's
accessibility sizes (Settings › Accessibility › Larger Text, up to about 3×)
nothing in this app survived: profile chips cut to "Com", product titles
broken mid-word, a search result filling the screen, and the sign-in sheet's
"Not now" pushed out of reach even at full height.

Three options were weighed: reflow everything to 3×, cap everything, or a mix.
The mix was the call — cap the text, and make the layouts that still break at
the cap wrap and grow. The ceilings live in `FONT_SCALE` (`lib/tokens.ts`) and
are applied once, in `components/Text.tsx`, so no screen has to remember them;
a component that needs something else passes its own `maxFontSizeMultiplier`
(the onboarding shell and the Home greeting already did).

**One ceiling for reading text and labels, not a higher one for paragraphs.**
Letting "Why this score" reasons grow to 2× was tried: the reasons came out
larger than their own headings, and the expanding panel clipped them to one
line. A paragraph outgrowing its heading reads as a bug, so both stop at 1.5×.

**What changed besides the cap:** Home's profile chips take a whole row each
past 1.2× and grow with their label, and a risk card's title may take three
lines. Checked at `accessibility-extra-extra-extra-large` on the iPhone 18 Pro
simulator: Home, Search, the product page, the scanner, the label result and
the sign-in sheet keep every control reachable.

**Reading screens grow all the way (#334, 26 September 2026 — this replaces
"one ceiling" above for three screens).** The product page, the ingredient page
and the label result are the screens people read, so the reading part of each
(its scroll content, wrapped in `ReadingScale` from `components/Text.tsx`)
follows the phone's text size to the top of iOS's range. Everywhere else, and
the controls on those screens (buttons, the score ring, the ingredients sheet,
the header), keep the 1.3× / 1.5× ceilings.

The 2× attempt failed on two things, and both are answered rather than
avoided:
- *A paragraph outgrowing its heading.* Inside a `ReadingScale` every piece of
  text may grow until it reaches the size body text reaches at the top of the
  range (`TYPE.body × FONT_SCALE.reading`), and no further — the way iOS's own
  text styles converge at the accessibility sizes. Headings therefore end level
  with their paragraphs, never below them, and a 34pt name doesn't grow to
  120pt. Two exceptions, both from looking at the product page at the largest
  size: the product's header (brand, name, size and count) keeps its ordinary
  ceilings, because grown with body text the name filled the first screen and
  put the verdict two scrolls down, and a capped name under a full-size brand
  read smaller than it;
  and the verdict title ("Great match", "Can't tell yet") follows the phone as
  far as body text does, so it stays a step above the sentence under it. Its
  words are short enough not to break mid-word at that size.
- *"Why this score" clipping.* It doesn't: the reasons' container never had a
  fixed height, and at the larger sizes each reason's explanation now takes the
  full width under its label instead of a narrow column beside the +/− dot.

Past 1.5× (`useLargeText`) the layouts that can't hold two things side by side
stack: the score ring goes above its verdict (with the "open your profile"
arrow level with it, not alone under the words), the two risk cards stack, a
reason's +/− moves from its dot into the start of its label (in the verdict
ink, 4.5:1 or better on every panel tint, 4.93:1 at the lowest) so it can't end up on a line of its
own, and the ingredient page drops its decorative picture so the name has the
width. The ingredient's function line stops where label text stops, below the
name. Icons beside reading text grow with it up to `FONT_SCALE.icon` (2×,
`useIconScale`), enough to stay visible without taking the words' width; the
score ring grows the same way once text passes 1.5× (`useRingScale`), so the
score stays the thing that stands out on the verdict panel. Opening "Why this
score" at those sizes scrolls to the reasons rather than the top of the panel,
which the score and verdict fill on their own. At the very largest size the
words "Why this score" are wider than the panel and take two lines whatever the
chevron's size. Checked at `accessibility-extra-extra-extra-large` on the iPhone
18 Pro Max simulator; nothing changes at the default size, by construction
(every rule above only acts past a multiplier of 1).

## Accounts

**Sign-in is Sign in with Apple and Sign in with Google, both native (#217,
decided 23 September 2026; the rest settled by the owner on 24 September
2026).** No email, password or magic link. Both hand an identity token to
`supabase.auth.signInWithIdToken`; nothing goes through a browser redirect.

**One person, two providers: linked by verified email.** Supabase links
identities that share a *verified* email into one user automatically — it is
not a setting, and it refuses to link on an unverified address, which is what
stops someone pre-registering a victim's email. Apple and Google both return
verified addresses, so "signed in with Google, later with Apple, same email"
is one account and one shelf. **Hide My Email breaks this on purpose:** Apple
returns a relay address that matches nothing, so that person gets a second,
empty account. The sign-in screen (#220) says so in one line rather than
letting it surprise anyone. Merging accounts by hand is not offered.

**Google uses the native module, not the browser flow.** Sign in with Apple
already needs a development build carrying this app's bundle ID, so the
browser flow's one advantage — working in Expo Go — buys nothing. Two
consequences worth knowing:

- The free `@react-native-google-signin/google-signin` cannot pass a nonce,
  and the iOS Google SDK puts one in the token anyway, so the Supabase Google
  provider needs **"Skip nonce check"** turned on or every Google sign-in is
  refused. That is Supabase's documented setting for this library, not a
  workaround invented here.
- The config plugin is added by `app.config.js` only when
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set. Listed bare in `app.json`, it
  switches to Firebase mode and adds Android Google Services build steps this
  app does not use.

**This is where Expo Go stopped being enough.** A plain App Store Expo Go
still runs the app and still offers Sign in with Apple, but the Apple
account it creates is tied to Expo Go's bundle ID, not this app's — the same
person signing in from a real build arrives as a different user with an
empty shelf. Google does not work in Expo Go at all. Test accounts, #222's
shelf migration and #223's sync need a development build.

**No name is requested from Apple.** Nothing in the app shows one, and a
field never collected is one that never needs deleting (#224). Google can't
be narrowed the same way: its sign-in always carries the basic profile (name,
picture), which Supabase stores with the account. The Privacy screen says so
rather than claiming no name is kept (#277 review).

**The shelf syncs by queue, not by comparing copies (#223).** The device
never pushes its cache, only the changes it queued — so a phone that still
has an item cached cannot put back something removed on another phone.
Two phones editing offline resolve by one rule: saves union, the earliest
save time wins per item (it is when the person decided they liked it, and
the formula version they saw then goes with it), and a removal beats any
save made before it. A save after a removal is a new save with its own
time. Rules: `lib/shelf.ts`; tested against staging by
`__tests__/shelf-staging.test.ts` (`SHELF_STAGING_E2E=1`).

**A guest's shelf is carried into the account at every sign-in (#300)**,
through that same rule — so it merges into an account that already has a
shelf, and an account row already there keeps its own date, note and step.
This replaced #222's "carry the pre-accounts shelf once per device", with its
flag set on the first sign-in, when #300 (26 September 2026) let signed-out
people save. Carrying every time is safe because sign-out clears the shelf:
anything on a shelf no account owns was saved signed out, so a removal made
while signed in can't come back. The one gap, accepted: a product saved as a
guest and removed from the account on another phone comes back at sign-in;
closing it needs a server-side record of removals. Store v8 dropped the old
flag and cleared any shelf left on a phone that had signed in and out.
Notes and routine steps stay signed-in only, so a guest's note can never
replace the account's. Sign-out clears the shelf and leaves the profile and
history (docs/device-storage-policy.md). Changes that never
reached the server are parked for that account rather than lost — #274's
review found an offline sign-out silently dropping them — and are never
carried into a different account.

## Staging infrastructure

**Staging had never once worked, and nothing said so.** Discovered
23 September 2026, while the first `/work-next` chain was running.

`staging-migrate.yml` had existed for some time and had never completed a
single successful run. `STAGING_DB_URL` held the **direct** database
connection string, whose host (`db.<ref>.supabase.co`) resolves IPv6-only
unless the project pays for the IPv4 add-on — and GitHub Actions runners are
IPv4-only. Every run died with `Network is unreachable` before touching
anything.

The consequence was larger than a broken workflow: **the staging database
was completely empty — zero tables.** Every migration from `0001` onward had
only ever run against the throwaway Postgres in `ci.yml`. Nothing had ever
verified that a migration applies to a real Supabase project, which is the
one thing the workflow exists to prove.

Fixed by pointing `STAGING_DB_URL` at the Supavisor **pooler** string on
port 5432 — session mode, because transaction mode (6543) cannot run DDL —
which is IPv4-reachable. Two details cost time and are worth writing down:
the pooler username is `postgres.<project-ref>`, not `postgres` (using the
latter fails as *password authentication failed*, which reads like a wrong
password), and a password containing `@`, `:`, `/` or `#` must be
percent-encoded or it truncates the string and mangles the parsed user.

All 24 migrations were then applied by hand and
`supabase_migrations.schema_migrations` caught up, so the workflow's
bookkeeping is consistent from here.

**Edge Functions had no staging deploy path at all.** `scan_log` (0024)
could be created and stay permanently empty, because nothing deployed the
functions that write to it anywhere except production.
`staging-deploy-functions.yml` now auto-deploys `label-ocr` and
`product-lookup` (and `delete-account`, #224). It does not discover new
functions, and neither does `ci.yml`. If you add a fourth Edge Function,
update both by hand in the same PR that adds it:

- `.github/workflows/ci.yml` — the "Typecheck the Deno Edge Functions" step's
  file list
- `.github/workflows/staging-deploy-functions.yml` — both the trigger paths
  and the `supabase functions deploy` lines

Forgetting this ships a function that is never type-checked and never reaches
staging. That gap has already existed once.

`deno check` needs `--node-modules-dir=none` from the repo root: the root
`package.json` makes Deno auto-detect npm resolution and break on
`supabase-js`'s npm sub-dependencies. `ci.yml` already sets it; don't remove it.

In `label-ocr`, the `GOOGLE_VISION_API_KEY` check must stay after logging is
in scope. A missing key used to return 503 before any `scan_log` row was
written, so a real production misconfiguration would show as *zero failures*
in the weekly metric rather than the truth. The reason is also in a comment
in `handler.ts`, and a test pins it.

**`SUPABASE_ACCESS_TOKEN` is account-wide, and that is accepted.** Supabase
personal access tokens cannot be scoped to a project, so the token in GitHub
secrets can also reach production. This was weighed and taken: the
alternative is no automated function deploys at all. `staging-migrate.yml`'s
header rejects the same token for *migrations* precisely because a
connection string can be scoped to one project and a token cannot — that
reasoning still stands for migrations. **Do not re-flag this as a finding.**

### iPhone only, no iPad build (7 October 2026)

`ios.supportsTablet` is false. iPhone is the only release target (19 September
2026) and nothing in the app adapts to an iPad: no size classes, one 292pt
carousel card, a portrait lock. With it true the app would ship to iPad as a
stretched phone UI. An iPad runs it as a phone-sized window. Turn it on again
only with a real iPad layout, and re-check the multitasking and orientation
rules at the same time.

## Plans

**The catalogue plan lives in `docs/feeding-the-catalogue.md` (7 October 2026).**
It started as a claude.ai artifact ("Feeding the Catalogue") and went through 64
versions there, none of them in git. It is now a file here so every later change
has a commit and a diff. Edit the file, not the artifact; the artifact is only a
view of it. The earlier history is the dated notes at the top and bottom of the
file itself.
