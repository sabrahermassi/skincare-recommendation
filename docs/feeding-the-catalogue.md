<!--
Moved here from the claude.ai artifact on 7 October 2026 so its history lives in git:
https://claude.ai/artifact/35abnwiaqnKhpBWnWJTJkV
This file is the source of truth from now on. Edit it here; the artifact is only a view of it.
Edits before 7 October (64 artifact versions) are not in git, but the dated notes below record them.
-->

*Skintel · Data strategy*

# Feeding the Catalogue

Why Browse was slow, where product data should come from, and the order to build
it in — nineteen steps, numbered in the order to do them. The two that fix the
latency are first and both have now shipped; the order below is execution
order, not a wish list.

**8 September 2026.** Figures marked **measured** were read from the live
Supabase catalogue, not estimated.

**Reordered 14 September 2026** into build order, after a second reading of
the data layer, the migrations and the import script. Every step carries a
done / not-done flag. **Step 1 shipped 14 September;** the figures above were
re-measured against the live catalogue the same day. A read-only audit of what
step 1 actually built added step 6, and split the old widening step into a capped
half (4) and an uncapped one (7) either side of it.

**Step 1 re-verified 14 September** against the committed code rather than
against this page. Two claims here were wrong and are corrected below — the test
count (11, actually 30) and the number of fetchers reading through the cache
(four, actually three) — and one shipped behaviour was missing entirely. Landed
as **PR #89**, alongside two changes outside this plan: a type scale, and an
inline profile prompt on the result screen.

**Step 11 added 14 September** after two external reviews of the whole tree —
one of PR #89 itself, one of the repository. Between them: thirteen findings on
the branch and four larger ones on the backend. Three of the four already had a
home here (steps 4, 5 and 8, noted in place); the fourth had none, because it is
about what the metered endpoints *cost* rather than about what the
catalogue holds. It is now step 11. Step 1's notes below are corrected where that
review changed what shipped.

**Step 3 shipped 15 September** and was run for real against the live catalogue
the same day, not merely deployed — `sync_bookmarks` holds one row,
written by a live `import:obf` run, confirmed by reading it back rather
than trusting the script's own exit code.

**Step 2 shipped 15 September** and the figures above were re-measured
against the live catalogue the same day, by requesting both payload shapes
directly rather than inferring the saving from the diff. That measurement also
corrected two numbers this page had carried since the first draft: the
duplication factor (3.6, actually 4.3) and the size of a full load (946 KB,
actually 740 by the time step 2 began — step 1's read-boundary filter had
already taken some of it).

**Step 6b re-scoped 17 September 2026** against the merged code rather than
against this page, after four of its pieces shipped the same day as
**PR #110**, **#111**, **#112** and **#113**. Three claims here were
wrong. The LRU this step was built around was never built — measurement said the
mirror fits, and eviction turned out to contradict Browse's global ranking, so
the work went into a platform-aware disk budget instead; it is struck below and
reopened as a question at the foot of the page. The pagination piece is half
done, and the missing half is the half the windowing depends on. And the
windowing itself is not step 6 work at all — it is an architecture decision about
where scoring runs, now **step 12**. Step 7's premise was corrected in the same
pass: it claimed "the risk was retired in step 6," and 6b-4 moved the Android
budget in the opposite direction.

**Step 13 added 18 September 2026**, out of a second Codex review round on
**PR #119** (graded exposure weighting). Two findings there had no home on this
page, the same situation step 11 was in: neither is about what the catalogue
*holds*, and this time neither is about what it *costs* either —
both are about `contactWeight` not being granular enough for what a
type actually contains. One was accepted and fixed on that PR (moving
`shampoo` to full weight); these two were deliberately deferred
instead, because both need
real design work rather than a table edit. It is numbered last for the same
reason step 11 was: blocked on nothing, blocking nothing, urgent only once someone
is actually harmed by the gap rather than merely eligible to be.

**Step 6 verified 18 September 2026**, closing **issue #115**. Every piece of
6a/6b had been merged for a day; the one thing missing was ever running it on real
Android hardware rather than the AsyncStorage test double. Run: open Browse, force-close
the app from Android's recent-apps view, relaunch — no `skipped` or
`failed` write warning in either direction, at today's ~600-product
catalogue. Step 6 moves from amber to done; the caveat that it is unverified at the
higher volume step 7 will eventually push toward stays open as its own question at the
foot of the page, not as part of this step.

**Step 14 added 18 September 2026**, when step 11 closed. Step 11's own
issue (**#116**) was always wider than the code: it tracked the durable
limiter alongside a set of caps that live in Google's and inciapi.com's
consoles. Those shipped at different times, and folding the console half into a
step now marked done would have hidden it — so it is its own step, flagged not
done, listed last for the same reason steps 11 and 13 are.

**Step 10 run for real, also 18 September 2026.** The code had been merged since
16 September (PR #108) but never actually run — dry run then real run matched each
other exactly (200 usable of 400 seen), and the write was confirmed by reading
`sync_bookmarks` and `products` back rather than trusting the
script's own summary line. 200 DailyMed sunscreens are now live.

**Step 13 half-closed 18 September 2026.** **PR #127** split
`contactWeight` into `{ harm, benefit }`, closing the
benefit/harm half of the step's two-part done-when after two rounds of Codex
review found real display bugs in the first cut (an uncounted sensitive-only harm
showing as a negative reason; then a pore-clogging exclusion copied in from the
wrong loop that over-corrected and hid real ones). Merged, 564/564. The micellar
cleanser-type split is untouched and stays open — flag moved from not-done to
part-done rather than done, since the step's own done-when is an AND of both.

**Step 8 shipped and run, 18 September 2026.** Six review rounds across
**PR #122** — twelve findings, eleven fixed, one disagreed with in writing
(a per-row failure should abort the run, not be caught and skipped, matching
`import-obf.mjs`'s own precedent for the same situation). The
migrations reached production, the secrets reached the repo (the first attempt
at the service-role key landed empty — caught because the workflow failed loudly
instead of recording success), and a hand-triggered run confirmed the whole
mechanism against the live catalogue: 269 unchanged, 30 changed, 1 gone from OBF.
The schedule itself has not fired unattended yet — that's the clock, not a risk.

**Step 15 added 18 September 2026**, out of a conversation about whether the
scoring model is getting more sophisticated faster than anyone is checking it is
getting more *correct*. Step 13 split `contactWeight` into harm
and benefit; PR #119 graded exposure by product type; both moved real numbers for
real recommendations in the same week, and nothing on this page or in the test
suite checks the result against a product whose real-world reputation is already
known. Not a new feature — a permanent check on the one this page already built.

**Step 16 added 18 September 2026**, straight out of building step 15's
fixture. The cross-check surfaced two real scoring gaps rather than confirming
the model was already right: a single-active hydration formula under-scoring
against `CONCERN_SATURATION.dehydrated`, and — the one worth actually
fixing — benzoyl peroxide still reading "good" for a dry, highly sensitive
acne-prone profile, because `concernFit` for pore-led concerns is 65%
`poreSafety`-weighted (which only checks for listed pore-cloggers) and
the irritation accumulator never sees an `"actives"`-category rule at
all. Same shape as steps 11 and 13: a review finding with nowhere else to go,
numbered last because it blocks on nothing and blocks nothing, not because it is
unimportant.

**Step 14 closed 18 September 2026.** All six console items resolved, though
two turned out not to be actionable and were closed as such rather than done:
Google's console has no self-service quota decrease for this API (every row read
"Ajustable: Non"), and the Gemini API was never enabled on the fresh project
there was nothing to disable. The Vision key itself was rotated rather than
audited in place — the original key's project could no longer be located under
the account that created it, and a key nobody can account for is worse than not
having one. New key, new dedicated project, restricted to Vision only, budget
alert configured, confirmed working against the live app (a real label photograph
returned real ingredients) before the old key was deleted. inciapi.com's own docs
confirmed a fail-closed default (429, not automatic billing) and the account
behind this app's key has both the opt-in overage toggle off and a $0.00 prepaid
balance. `cron.job` holds exactly the two expected rows. Issue #116
closed alongside it.

**Step 13 closed 18 September 2026.** **PR #130** — titled, in the PR
author's own words, "step 13's second half" — shipped the cleanser split this
step's done-when was still waiting on: a new `micellar-water`
`ProductType` sits above the generic cleanser rule in both
`guessType` copies, with its own `contactWeight` entry at
full harm and benefit rather than the rinse-off discount the rest of
`cleanser` correctly keeps. This page had still been carrying that
half as open; corrected 19 September 2026 against the merged code rather than
against this page, the same way step 6b and step 10 were.

**Step 7 corrected 19 September 2026**, out of a direct question about whether
Android's ceiling could be raised without paying step 6b's Expo Go/dev-build cost.
It can: `expo-sqlite` replaces AsyncStorage as Android's cache storage
with no such ceiling at all, ships inside Expo Go for SDK 57 (confirmed against
the official changelog, not assumed), and needs no config plugin or prebuild —
unlike `expo-build-properties`, which forces the whole project off
Expo Go the moment it's added, not just Android. Still not done; still Android-only
work; the concrete plan for `data/catalogue-cache.ts` is being drafted
before any of it is written.

**iOS-only MVP decided 19 September 2026.** Android and web stay in the tree —
nothing built for them is deleted, and step 6's platform-aware cache keeps working
for both exactly as shipped — but neither gets further development or device
testing while iOS is the sole release target. **Step 7 rewritten the same day:**
Android's disk ceiling was its entire blocker, and Android no longer has to clear
it for this step to count as done — the `expo-sqlite` route from
earlier that day stays documented for if Android returns as a target, rather than
being required now. Every remaining not-done step was checked for an Android/web
dependency: **step 12** had one — its "the trigger is a number" reasoning was
built on Android's old 1,200–1,500-product wall, corrected in place to point at
the much larger memory ceiling that still applies on iOS. **Steps 9 and 16**
have none; flagged in place rather than left silent.

**Step 15 closed 19 September 2026**, verified against the merged suite rather
than against this page's own bullets, the same discipline every other closure on
this page follows. It is done, but not the way it was written: the bullets above
asked for absolute `SCORE_BANDS` assertions, and what shipped instead
is 20 sourced, dated product snapshots checked with directional and
signal-isolation invariants — a stronger, band-immune design, reasoned out and
corrected in place rather than left to silently diverge from the page. Two known
model disagreements moved to `docs/scoring-validation-gaps.md` instead
of an `it.failing` that could not tell its intended failure from a new
one; one of them is step 16's own origin.

**Step 16 built 19 September 2026**, open as PR #142 and awaiting merge, so
the flag is amber and the count above stays at 12. All four done-when items are
met, verified against the code and the live catalogue rather than this page.
Measuring it exposed an unrelated data problem — DailyMed drug labels list
inactive ingredients alphabetically, which `positionWeight` was reading
as concentration — fixed in the same change. What it does not fix moved to step 17
the same day: a low-weight active still costs about half of a top-of-list one,
and calibrating that needs concentration evidence, so it is a separate research
task rather than a tweak; review also found that the vitamin C and retinoid rules
charge their gentle forms (ascorbyl glucoside, retinyl palmitate) like the strong
ones, a per-ingredient rule split that goes to Codex the same way.

**Step 17 added 19 September 2026**, by moving out of step 16 everything it did
not implement: the size of the
irritation charge, the gentle forms charged like strong ones, the A-to-Z run
absorbing leading actives, and the benzoyl-peroxide fixture’s classifier type.
Step 16 keeps only what it built, so its flag can turn done on the merge without
carrying open work behind it, the same reason steps 11 and 14 were split.

**Step 18 split from step 17 the same day.** It holds gap 1, the sparse-hydration
formula, alone: it has nothing to do with irritation and needs its own evidence.

**Step 19 added 19 September 2026**, out of finishing issue #101 (ingredient
coverage and normalisation). Everything parsing could fix shipped there; step 19
holds what it could not, the last 3.6% of ingredient names that no public list
carries, so that #101 can close and this can be picked up separately.

**Steps 16 to 19 closed 22 September 2026**, checked against the code rather than this page.
Step 16 (PR #142) and step 19 (PR #159, with `docs/ingredient-coverage.md` recording the
no-promotion decision) had merged; steps 17 and 18 close with **PR #161**, which holds the
straight-line irritation penalty, the gentle-forms split and the sparse-hydration write-up.
The count is 16 of 19.

**Noted 21 September 2026:** both steps 17 and 19 now have an open PR — **PR
#161** ("Calibrate irritation scoring and close validation gaps") against step
17, and **PR #159** ("close remaining ingredient coverage gaps") against step
19. Neither has merged, so both flags stay not-done; linked here only so the two
are traceable from this page.

**Checked 7 October 2026 against `main` (`b7b1e56`), not against this page.**
Four flags moved. **Step 7** is built — the 500 cap is gone (#180, closed 24 September) and
`import:obf --dump` (2 October) reads OBF's whole export — but its own done-when still
asks for a real-iPhone cold start at the larger size, so it is amber, not done. **Step 9** is
closed as not possible (#181, 26 September): none of MFDS's product datasets carries a barcode,
and a product cannot exist without one; its Korean ingredient-name half shipped as #201.
**Step 10** is retired: DailyMed labels have no barcode either, so migration 0022 refused them,
the 200 rows were pruned and `import:dailymed` now refuses to run. **Step 12** is
parked: Browse and search were removed on 1 October, so nothing ranks the whole catalogue on screen
any more; the mirror itself is still there (the routine builder reads it), and #182 holds the
question. The count is now 15 done, 1 waiting on an iPhone check, 3 closed without being built.

| Figure | What it is |
| --- | --- |
| **851** | products live (153 on 8 Sep); 2,840 on staging, 7 Oct |
| **369 KB** | a full catalogue load at 153 products, down from 740 KB (15 Sep) |
| **51 B** | the freshness check that replaced it |
| **888** | ingredient definitions, sent once each — was 3,819 |

## The database is fast. Nothing remembers, and the payload repeats itself.

*The diagnosis*

Browse feels slow, and it is worth being precise about why — because the obvious
suspect is innocent.

**The query is not slow.** Measured against the live database, the
exact request Browse makes returns in `0.39s`, consistently, filtered
or not. There is already an index on `(area, type)`. Postgres is not
the problem.

**Nothing was cached. Anywhere.** No query cache, nothing held in
the store, nothing on disk — confirmed by searching the whole data layer, not
assumed. Open Browse, switch to Saved, come back: that was three full round
trips, three JSON parses, and the scoring engine run three times over the same
products. This was the main cause of what you were feeling, and
**step 1 has now fixed it.**

**And the payload repeats itself.** Browse fetches every product's
complete formula, because scoring runs on the device — that is the right call
and the whole premise of the app. But the query inlines all six ingredient
columns *per product*, with no deduplication. `Aqua` is sent
with its full note and function list once for every product that contains it.
Measured: **3,819 ingredient rows for 888 distinct ingredients**
— every definition sent 4.3 times over. **Step 2 has now fixed
this**, and the measurement below is what it was worth.

The information is doing real work; the encoding is not. Keeping on-device
scoring does not require sending the same ingredient definition dozens of
times — which is why deduplication is step 2 here and not an afterthought.
Caching alone would leave it in place, because caching only ever helps the
*second* load.

**The fix, in one line**

Stop fetching repeatedly, and make "has anything changed?" cost 51 bytes
instead of 946 KB — **both done, step 1**. Then stop sending the
same ingredient 4.3 times — **done, step 2: 740 KB to 369 KB,
measured**. Everything after that is about making the catalogue
bigger, not faster.

## What blocks what

*Before the list*

The numbering below is a build order, and it is also close to a dependency
order — with one useful exception worth knowing before you start. **The
two steps you feel as a user depend on nothing at all.** They are pure
app code: no migration, no import job, no new data source. They can ship this
week, in either order, while everything else is still being thought about.

**1 · 2 — App-side**

Blocked on nothing and on each other not at all. Together they were the
whole user-facing latency fix, and both have shipped: a full load is
**369 KB**, down from 740.

**3 — Foundation**

The sync bookmark. Small, dull, and shipped — a real row now sits in
`sync_bookmarks`. It is still the gate for everything after it, since
nothing yet reads it back: no import can be incremental without somewhere to
record where it got to, and now there is one.

**4 · 5 — First growth**

Need step 3 first, and ship together in one pass — a widened import without
the gates is a worse catalogue, not a bigger one. Capped at ~500 on purpose.

**6 → 7 — The cap comes off**

Step 6 pays step 1's bill, using the volume step 4 just produced — though not
in the currency this page first budgeted in: no eviction, no LRU. Step 7 is
the rest of step 4, and it is *not* safe to run on 6 alone. 6b-4
halved the Android budget to make room for an atomic replace, so the phone
now holds fewer products than step 7 aims to import. **Step 7 needs the
ceiling raised first.**

**8 – 10 — More sources**

All need step 3's bookmark, and are independent of each other. Deliberately
after the cap comes off, so a regression has one suspect.

**11 · 14 — Outside the sequence**

Blocks on nothing and blocks nothing. Not catalogue steps at all — they
become urgent with *users*, not with rows, so they are numbered last
without being scheduled last. 11's code half is done; 14 is the console half
it could not reach.

## Nineteen steps, in build order

*The plan*

Start at the top and work down. Latency first, because it is the only part a
user notices today and the only part that needs no backend work at all; then
the foundation; then the catalogue growth that is the actual long-term point
of the app.

**15 of 19 done** (checked 7 October 2026): step 7 is built and waiting on an iPhone check, steps 9 and 10 cannot be built because their sources have no barcodes, and step 12 is parked since Browse was removed. Each step carries a status line. Step 6 was the amber one until 18 September: all of its code was
merged and green, but the Android ceiling it was built around had never been
observed on a real device (**issue #115**); a real-device run that day closed
it. Step 1 landed on 14 September. The
catalogue grows in two moves rather than one — step 4 takes it to ~500, step 6
makes the cache survive that, and only then does step 7 take the cap off.
**Step 12 was added 17 September**, when re-scoping 6b showed that
windowing the catalogue is not cache work but an architecture decision about
where scoring runs — and that it was quietly blocking itself inside a step
marked as nearly done. **Step 13 was added 18 September**, for the
same reason step 11 was: a review finding with nowhere else to go.

### Step 1 — Stop refetching what we already have

**Status: Done · 14 Sep 2026**

*Tags: App-side · blocks on nothing*

Three layers plus a cheap freshness check. Purely app-side; touches no
schema and no import job. Every caller goes through the same seam —
`fetchProducts`, `fetchProduct`,
`fetchProductsByIds` and `searchProducts` in
`data/api.ts` — so there is one place to put this.

- **In memory, no expiry while the app is open** — switching
  tabs and coming back must never refetch. *Superseded:* review found
  that this and the 24h ceiling could not both be true on a phone, which
  backgrounds an app rather than closing it. The memory layer now carries the
  same 24h window, enforced inside `readCatalogue` so no caller can
  forget it, plus a re-check when the app returns to the foreground. Tabbing
  away and back still refetches nothing — that part was never in tension.
- **24h on disk** — a cold open shows the list with no
  spinner while a background check looks for updates.
- **1h for a freshly scanned product** — someone holding the
  physical bottle wants today's answer, not yesterday's cache.
- **The freshness check drops from a full load to 51 bytes**
  (946 KB at the time; 369 KB since step 2) —
  ask only for the product count and the newest `fetched_at`, which
  is already a column and already in the select. Refetch in full only when
  that answer differs from what's cached.
- **One trap, found in the code:**
  `app/(tabs)/browse.tsx` memoizes scoring on the *array
  identity* of its results. A cache that returns a freshly built array on
  every hit would still re-score all 153 products on every tab return —
  removing the network cost and keeping the CPU cost. The cache must return a
  stable reference.

**How this is normally done**

Nothing above is exotic. Showing cached data instantly while checking for
updates in the background is a named, standard pattern —
**stale-while-revalidate** — and the memory layer plus the
disk layer usually come from one library rather than being built by hand.

The convention worth borrowing is the *separation*, not the
library. Apps keep two kinds of state apart:

- **Client state** — the profile, the saved shelf, the
  onboarding flag. The user owns it, it never goes stale, it belongs in the
  store. That is exactly what `useAppStore` holds today, and it
  is already right.
- **Server state** — the catalogue. We do not own it, it
  goes stale, it needs refetching and retries. The usual advice is to keep
  this *out* of the store, because a store that also caches server
  data ends up reimplementing invalidation and retries by hand, and
  unrelated updates re-render screens that never touched the data.

So the catalogue cache wants to be its own layer sitting behind
`data/api.ts` — not a seventh key in the persisted store.
Whether that layer is a library or fifty lines of our own is a smaller
question than where it lives.

**Settled · 14 September 2026**

The convention above collided with a rule this codebase enforces:
`store/useAppStore.ts` was the only file allowed to import
AsyncStorage, **enforced by lint** rather than merely
documented, and `docs/device-storage-policy.md` had no row for
cached catalogue data at all. That rule exists for a good reason — one
file writing to the device means one place to audit — but it was written
when the only thing stored was personal data.

**Resolved, and the groundwork is in:** the policy document
gained a row for cached catalogue data and a section stating the boundary
— public product rows, the ingredient dictionary and freshness
watermarks, and nothing derived from the user. *If a cache key would
differ between two installs with the same catalogue, it does not belong
in that file.*

The lint config now admits exactly one new file,
`data/catalogue-cache.ts`, and admits it *only* for
AsyncStorage: a second rule block keeps `expo-secure-store`
and `localStorage` barred there, so the exemption is the size
of its reason and not a blanket hole. Verified by linting a throwaway
file at that path — the AsyncStorage import passed, the other two
errored.

**Shipped as** `data/catalogue-cache.ts`, read
through `fetchProducts`, `fetchProduct` and
`fetchProductsByIds` — no screen learns that a cache exists.
*Three* of the four fetchers, not four: `searchProducts`
stays uncached on purpose, for the reason given under the limits below, and
an earlier draft of this line claimed otherwise. Type filtering moved onto
the device (one request instead of one per chip), the detail screen and the
saved shelf resolve from the same cached rows, and the filter bar's own query
is gone. **30 tests** cover it — 15 in
`catalogue-cache.test.ts`, 15 in `api-cache.test.ts` —
the load-bearing one being that a cache hit returns the *identical array
instance*. **Now 52** — 23 and 29 — after review found sixteen
defects in the same code across two rounds; they are listed two notes
below.

**One behaviour the plan did not anticipate.** The
barcodes looked up this session live in the cache's memory layer — outside
the store, never on disk — but they are a record of what this person pointed
a camera at, so "erase everything" has to reach them.
`resetApp` now calls `forgetScannedBarcodes`, and it
lives in the store rather than in the screen offering the button so that
erasing cannot drift out of sync with a second caller later. The cached
*catalogue* is deliberately left alone — public, and identical on
every install. The distinction is the storage policy's own line, applied to
memory rather than disk.

**And one thing left behind.** Removing the filter
bar's own query orphaned `fetchProductTypes`: no callers remain in
`app/` or `components/`, only tests, while it is still
exported and still carries its own Supabase round trip. Flagged rather than
deleted — "the types come from the cached rows now" and "nothing should ever
ask the database for them" are different decisions, and the second one had
not been made. It has since been removed.

**Since revised three times by use.** Freshness was
first checked on every cache hit, which meant a request per type-filter tap;
then behind a five-minute throttle, which worked but rested on an interval no
one could justify. It settled at *once per launch* — the only moment a
check can still change what the first screen renders — with the 24h TTL as
the hard ceiling behind it. The one-hour window on a scanned barcode was
similarly re-labelled: it de-duplicates a lookup within a session, and never
made any answer fresher.


**And once more, because "launch" was the wrong unit.** A phone
backgrounds an app rather than closing it, so once per launch can mean once a
week — and the 24h ceiling only applies to a copy read back from *disk*,
while the memory layer has no expiry at all. A process alive for days kept
serving the list it read on the first morning, and nothing would ever have
caught it. The check now also runs when the app returns to the foreground.
The five-minute interval is back, but it now bounds a *re-entry* rather
than a tap, which is an interval anyone can justify.

**Measured**, on an iPhone against the live catalogue:
the freshness check returns **51 bytes** where the full load is
**946 KB** as it stood that day, and the disk cache reads in
**120ms**
and parses in **11ms**. Confirmed on device: tabbing away and
back keeps the list, and a cold start paints it on the first frame.

**One correction found by testing.** The first build
still flashed a skeleton on cold start: Browse asked for the cache only
after mounting, so the first frame had nothing to draw, however fast the
read was. Fixed by warming the cache in `app/_layout.tsx`'s
existing splash gate — the launch already waits there for fonts and the
stored profile, so the read costs nothing visible. Worth remembering for
step 2: "it is cached" and "it is on screen in the first frame" are
different claims, and only the second is what anyone notices.

**Five defects, found by review after it shipped.**
Four of them in paths that only open when something goes wrong — which is
exactly when a cache is the only thing between the user and a blank screen.
A disk read that never settled poisoned every later one, because the promise
is cleared in a `finally` that a hung read never reaches: the
splash moved on and Browse then awaited that same promise forever. Both
persisted blobs were cast rather than parsed, so a malformed
`storedAt` served the copy *forever* and a malformed
products blob first failed inside render. A re-scan of a product already held
discarded the fresh row, so a bottle re-photographed *because* it had
been reformulated kept scoring against the old list. A label read did not
clear the barcode miss that sent the user to it. And two saves could
interleave, leaving metadata on disk describing a blob it did not come
from — which matters because `watermark.count` is the one value
the freshness check trusts.

**And `fetched_at` did not mean what this page
assumed.** The freshness key is the row count plus the newest
`fetched_at` — but nothing ever wrote that column after insert, not
the Edge Functions and not the importers, so a rewritten formula moved neither
term. The watermark matched, `touchCatalogue` renewed the window,
and a device opened regularly could serve an obsolete formula indefinitely.
The same column is what the six-month notice reads, so re-photographing a
bottle did not reset that clock either. **Migration 0009** bumps
it on the update path. Also: the full-catalogue read had no
`range`, so past PostgREST's response cap the rows would be
truncated while the count stayed exact — a catalogue settled at one page that
every later check would agree was current.

**And a second review round found the first fix
incomplete.** Migration 0009 bumped `fetched_at` inside the
RPC — the path both Edge Functions use, and not the only one there is.
`scripts/import-obf.mjs` upserts products directly and rewrites
their ingredient joins itself, never calling that function, so an OBF
re-import that changed an existing formula still moved neither term of the
key. **Migration 0010** moves the guarantee to a statement-level
trigger on `product_ingredients`, where no writer can miss it —
the argument being this column's history: three separate writers each
independently not writing it. The same round caught that a disk read the
splash had abandoned could still land and overwrite the fresher catalogue the
network had since written, which a read-generation counter now prevents.
*Both migrations are applied.*

*Effort: Small · no schema change · the entire user-facing latency fix*

**Step 1's limits — and the wall at ~1,000 products**

What shipped is not a cache in the classical sense. It is a
**complete mirror of the products table**: no maximum size,
no eviction policy, no LRU. *The one item since removed from this
list* is the memory layer's lack of expiry — it now carries the same
24h window as disk, enforced inside `readCatalogue` rather
than at one call site, with a foreground re-check behind it.
`peekCatalogue` stays exempt on purpose, so the splash can
paint a list on the first frame. The rest of this paragraph stands:
a complete mirror is the right shape at 153 products —
the dataset *is* the working set, and Browse scores every product
anyway, so there is no cold subset worth excluding. It does not stay
right.

**The hard limit arrives on Android, not iOS.**
AsyncStorage there is backed by a SQLite database with a
**6MB default ceiling**. At roughly 6KB of JSON per product
that is breached somewhere around **900–1,000 products** —
and `persist()` swallows its write errors, so the failure is
silent: the catalogue simply stops surviving a cold start, on Android
only, while every iPhone in the room looks fine.
**Step 4 aims squarely at that number.**

| Products | Heap | Parse | Android disk |
| --- | --- | --- | --- |
| 153 | 1.6 MB | 11 ms | 0.9 MB — fine |
| 1,000 | ~10 MB | ~70 ms | ~6 MB — fails |
| 5,000 | ~52 MB | ~400 ms | impossible |
| 74,000 | ~780 MB | ~6 s | impossible |

Heap measured in V8 against an equivalent object graph; the rest scales
linearly from the figures measured on device. Note that the ingredient
duplication step 2 targets is *resident*, not just in transit:
`rowToProduct` builds a fresh object per join row, so memory
held **3,819 ingredient objects for 888 distinct
ingredients**. Step 2 has since closed that: every product now
points at one shared object per ingredient, on the wire, in the heap
and on disk, so the figures in the table above have real headroom
against them.

**Also deliberately uncached today:** search results
(long tail, poor hit rate — correctly skipped), OCR and ingredient-name
resolution, and *scoring results*, which are recomputed at eight
call sites and memoised per component only.

**And the freshness these TTLs promise is relative to rows that
never expire.** The 24h catalogue window and the one-hour window
on a scanned barcode both measure how old the *copy* is. Neither
says anything about the row underneath it: a product written back by a
scan in September is byte-identical in November, because nothing
refreshes existing rows — not the importers, not the Edge Functions,
nothing. Re-scanning a bottle "for today's answer" re-reads the same
two-month-old formula and presents it with no more doubt than a fresh
one.

That matters more than anything else on this page, because it is the one
failure a user cannot detect: a slow list is obvious, a
*reformulated* product scored against its old ingredient list is
not. The ingredient screen has always carried one line about it
(`app/product/[id].tsx`, via `lib/list-age.ts`, renders "Label read 2 months
ago"). **The product screen now carries one too, since PR #89**
— past six months it says the verdict above may be judging an old list.
Six months because brands reformulate roughly once every year or two and
the source finds out later still; below that threshold it stays hidden,
so it reads as a signal rather than furniture. Browse still shows nothing,
and a notice is not a fix: the row underneath is still never refreshed.
**Step 8 still owns that.**

**And one thing the cache surfaced that has nothing to do with
caching.** Filtering the catalogue on the device meant reading
every row in it, which is how it became obvious what some of those rows
are. A label photographed *without* a barcode is still written to
the shared catalogue — `supabase/functions/label-ocr` mints
`ocr-<uuid>` and stores it with the placeholders
"Unknown" and "Scanned product". It answers the person holding the
bottle perfectly, and it is unreachable to everyone else forever.

| What a scan yields | Answers them | Others can find it | Belongs in Browse |
| --- | --- | --- | --- |
| Barcode only, unknown | no — offers the label scan | — | — |
| Ingredients only | yes, in full | never — no key | no |
| Ingredients + barcode | yes | yes — next scanner hits it | not until named |
| + a name | yes | yes | yes |

The barcode is what makes a row findable; the name is what makes it
browsable; **neither is needed to answer the person scanning.**
Which is why the read boundary now drops barcode-less OCR rows from
Browse and search while still resolving them by id — the scanner has to
be able to open the result it just created, and a saved one has to keep
opening. Written as a read-time filter rather than a write-time one for
the same reason `SHOW_SOURCE_PHOTOS` is: the rows already in
the table do not fix themselves.

Two pieces of this are *not* done and are not cache work.
Not writing the unreachable row in the first place is an Edge Function
change, and `label-ocr` already accepts `name` and
`brand` with careful "only fill a blank row" logic that the
client never exercises — `scan-label.tsx` sends the barcode
and nothing else. **Step 5 is the right home for both**: it
owns quality gates, and today it only gates *imported* rows, not
the ones our own OCR writes.

**None of this is a defect to fix today** — at 153 products
the mirror is the correct design, and building eviction for a dataset
that fits in 1.6MB would be inventing work. It is a dated cheque.
**Step 6 is where the caching half comes due;** step 8 is
where the staleness half does.

### Step 2 — Stop sending the same ingredient twice

**Status: Done · 15 Sep 2026**

*Tags: App-side · blocks on nothing*

The other half of the latency story, and the half caching could not fix:
step 1 made the second load free, but the first load of the day still moved
the whole payload — and that number grows with the catalogue, which steps 4
to 10 exist to make bigger. So this was worth doing *before* the
catalogue grew, not after.

- The shape to change is the `SELECT` constant in
  `data/api.ts`, which inlines all six ingredient columns inside
  the `product_ingredients` join, once per product.
- Return the ingredient dictionary once per response and have products
  reference it by INCI name instead. Measured today: **3,819 rows sent
  for 1,049 distinct ingredients**, so every definition travels 3.6
  times on average.
- On-device scoring is unaffected — it needs the same information, just
  not the same bytes repeated. `rowToProduct` already rebuilds
  each product's ingredient array, so the reassembly has a home.
- Do it now rather than later: it gets harder to retrofit once several
  sources write to the same rows, and the payload only grows from here.
- **And align the Edge Functions to the same contract while you
  are in there.** Scoped in from the repository review: the client
  select asks for `ingredients.functions` and both Edge Function
  selects do not, while the client casts their narrower result to the same
  type. So a product scored straight off a scan is missing its CosIng
  functional evidence, and the same product fetched a second later through
  the ordinary path scores differently — with nothing on screen explaining
  why. This step is where the response shape is decided, so it is where one
  shared select belongs rather than three that drift.

**Measured**, against the live catalogue on 15
September, by requesting both shapes directly rather than trusting the
diff: the old single fat request returns **740 KB**; the new
pair returns **369 KB** — 201 KB of products plus 168 KB of
dictionary. **A 50% cut, and under the 400 KB target.**


The target was written against 946 KB and the old shape now measures 740,
which is not a bad earlier reading: step 1 began filtering barcode-less OCR
rows at the read boundary, and that removed about 29 products from the
response. Part of the drop this page attributes to step 2 had already
happened in step 1. The catalogue as measured is 125 identifiable products,
888 distinct ingredient definitions and 3,819 join rows — so each definition
was travelling **4.3 times**, not the 3.6 estimated in
September.

**Shipped as** a lean catalogue select
(`product_ingredients ( position, inci_name )` — the join table's
own foreign key, so no join to `ingredients` at all) plus one
paginated read of a new `catalogue_ingredients` view. Reads of a
*single* product keep the inlined select: there is nothing to
deduplicate in one row, and that left the by-id path, the saved shelf and
both Edge Functions alone.

**The heap was the half the wire could not buy.**
Every product containing `Aqua` now holds the *same*
object rather than a copy, and the persisted blob is normalised the same way
and rebuilt on read — so a cold start restores the deduplicated heap instead
of re-inflating it through `JSON.parse`. `SCHEMA_VERSION`
goes to 2, and the v1 blob is deleted rather than merely ignored: bumping the
version hides an old blob, it does not remove one, and what would have been
stranded is a full-size copy of the catalogue against Android's 6MB
ceiling.

**And the trap this step carried.** Once the
definitions are fetched and cached separately, the freshness key stops
covering them: a CosIng re-import rewrites twenty thousand notes, adds no
products, and moves neither term. `CatalogueWatermark` gained the
dictionary's own count and newest `updated_at`.
`ingredients.updated_at` looked like the answer and was not —
nothing wrote it, the third time that exact shape has appeared in this schema
— so migration 0011 carries a trigger rather than a convention, firing only
when a row actually changed. *Applied.*

**One thing deliberately not done.** Both Edge
Function selects were aligned to the client's (they omitted
`ingredients.functions`, so a product scored straight off a scan
differed from the same product fetched a second later) — but the functions
are deployed separately from the app, and that redeploy has not happened.
The fix is inert until it does.

*Effort: Medium · client + query shape · biggest remaining win after step 1*

### Step 3 — Add the sync bookmark table

**Status: Done · 15 Sep 2026**

*Tags: Pipeline · blocks on nothing · gates 4 – 10*

One small table recording, per source, the watermark reached last time and
when it last ran. Unused until step 8 schedules anything — but every
incremental import below is impossible without it, and it is what makes a
silently-stalled job detectable.

**Shipped as** `sync_bookmarks (source, watermark,
last_run_at)` — `watermark` deliberately `text`
rather than a timestamp or integer, since the sources this will eventually cover
disagree on what "how far we got" means: OBF exposes a Unix epoch, MFDS publishes
dated file releases with nothing to page through, DailyMed offers update packages.
Service-role only — the first table in this schema with no
"catalogue is publicly readable" policy.

**Review found the table could lie about its own point.**
None of this importer's writes checked their result — a database-level
failure resolves as `{ error }` rather than throwing, so a silently
partial catalogue write would still have reached the bookmark and recorded
success. Every write is now checked and throws on failure, so the bookmark is
only reachable once everything above it genuinely succeeded. Deliberately not a
wider fix: making the delete-then-insert pair atomic and gating what a widened
import may write are step 4/5's job.

**Measured, not inferred.** Run for real against the live
catalogue on 15 September:
`Wrote 118 products and 3000 ingredient links.` — that line only
prints once every write above it has succeeded. Confirmed directly in the table
afterward: `obf | 1789472780 | 2026-09-15
13:47:21+00`. **Done when** the table exists, is service-role
only, and the OBF import writes a row to it — all three now true, not just
built.

*Effort: Small · one migration*

### Step 4 — Widen the Open Beauty Facts import — capped at 500

**Status: Done**

*Tags: Pipeline · needs step 3 · capped on purpose*

The most important finding in the review: we are not limited by what Open
Beauty Facts holds, only by how little of it we ask for.

**Stop at ~500 products, deliberately.** The obvious version of
this step — page everything OBF has — walks straight into the ceiling
described in step 1's limits: the cache stops fitting in Android's 6MB
AsyncStorage budget somewhere near 1,000 products, silently, while every
iPhone in the room looks healthy. A cap is one constant in the importer, and
it buys three things at once: real catalogue growth now, enough volume to
build step 6 against, and no breakage in between. Step 7 removes it.

- `scripts/import-obf.mjs` requests **one page of 50
  results** for each of **34 hand-typed brand names**,
  once — the URL carries `page_size=50` and no page parameter at
  all. OBF holds on the order of **74,000 products**. We are
  sampling a corner of the room and concluding the room is small.
- Page through the full result set, or take the daily dump and filter it
  locally. No new source, no new API key, no new legal question.
- The importer's own header comment documents the original decision to
  sweep by brand rather than page. This step reverses it deliberately — update
  that comment rather than leaving it arguing with the code.
- **Check the writes before multiplying them.** Scoped in
  from an external review: `scripts/import-obf.mjs` awaits its
  Supabase calls but never inspects the `error` on any of them, and
  it replaces each formula as a separate DELETE and INSERT with no transaction
  around the pair — then prints success unconditionally. A delete that commits
  before a failing insert leaves the product with a partial formula or none at
  all, reported as a clean run. That is survivable at 34 brands and one page
  each; it is not survivable at the volume this step exists to produce, and it
  fails in the direction that looks like success. Either check every response
  and stop on the first error, or move the replacement behind the same
  transactional RPC the Edge Functions already use
  (`replace_product_with_ingredients`) — the second is strictly
  better, and the function already exists.

**Done when** a dry run reports usable rows in the
mid hundreds, up from 153, and the importer pages rather than sweeping 34
hand-typed brands.

**Shipped and run — 16 Sep 2026.**
Merged as **PR #100**. The importer pages a category at a time instead of
sweeping 34 hand-typed brands. The real import (no `--dry-run`) was
run by hand and read back from the live database: **611 products from OBF**,
up from 122, exactly 500 written in this run (the cap held, 11 rows overlapped
products already present). **Zero** products in the catalogue hold no
ingredients — the issue-#40 check the RPC exists to guarantee.


Step 3’s precedent held: this is marked done only now that a real run has
been confirmed by reading the table back, not when the code merged.

**Four things the step gained that were not planned.**
Dropping the 34 brands removed a constraint nobody had written down —
every one of those brands sold skincare, so the sweep could not return
anything else. Replacing it with a completeness filter alone produced a
500-row catalogue of deodorant, shampoo and toothpaste: measured, 352 of 549
passing rows were products this app cannot score. Fixed by intersecting the
state filter with a category, server-side.


Review then found three more. The plausibility gate was reading the
*unverified* dictionary — including the stubs this importer
writes itself — so junk from one run would have counted as a recognised
ingredient in the next, the same feedback loop `label-ocr`'s own
comment calls load-bearing. The zero-row guard sat where `--dry-run`
skipped it, so a preflight could report an empty import and exit 0. And the
request interval was four times over Open Beauty Facts' documented limit of
ten searches a minute — runs had not tripped it only because they finish
in about seven requests, under the cap by count rather than by rate.

**One category-filter gap found after the real run.**
Zero deodorant, zero shampoo, zero hair products landed — the fix held.
But **66 lip products** (balms, sticks) got through, mostly because they are
not in English: `Dudak Bakım Kremi`, `Rossetto`. OBF tags
them `en:creams` or `en:moisturizers`, categories this
importer also wants. `scripts/import-dailymed.mjs` already rejects
lip products with a `NOT_SKINCARE` regex for exactly this reason;
this importer has no equivalent, so the same product category is scored here
and rejected there. 173 of 611 rows (28%) also landed typed `unknown`
— mostly these lip products and masks, the same root cause as #105 but
wider than that issue describes. Neither blocks this step’s done-when;
both are worth their own pass.

*Effort: Medium · biggest catalogue gain available for the effort*

### Step 5 — Tighten the quality gates — in the same pass as step 4

**Status: Done · 17 Sep 2026**

*Tags: Pipeline · ships with step 4*

Volume scales junk at exactly the same rate. This is not a follow-up; a
widened import without it is a worse catalogue, not a bigger one. The
catalogue has already collected a bag of tortilla chips, branded "N/A", filed
as a serum.

**Split into two, 16 September 2026.** Everything reachable
from app code alone shipped in **PR #106**, tested, and reviewed clean.
Everything that needs a change to `supabase/functions/label-ocr`
— and a redeploy — has not been written yet, not merely undeployed. One
"Not done" flag was hiding that the two halves were in completely
different states.

### 5aClient-side dead ends — shipped

- **Ingredient plausibility — required now.** If a row's
  parsed names mostly fail to match the 36,229-name dictionary, the list is
  OCR garbage, not rare ingredients. There is a live row reading
  *"Ulmus Davidiana Root raria Lobata Root"* — two ingredients fused
  with fragments dropped. Shipped in **PR #100** (step 4). This step's own
  done-when now has direct test coverage too —
  `__tests__/import-obf-gates.test.ts`, 10 cases exercising
  `toRow` and `parseInci` as plain functions, instead
  of needing a service-role key and a live dry run to check it.
- **A recognised product with no formula is a dead end — fixed.**
  UPCitemdb deliberately creates products with no ingredients, that counts as
  a successful lookup, and the result screen used to open on them with
  nothing to judge and no way to add anything. It now offers "Photograph the
  label", carrying the existing barcode so the formula lands on the row that
  already exists rather than minting a second one — guarded by
  `canPhotographLabelFor` in `data/api.ts`, which
  encodes exactly what `label-ocr` accepts as a barcode.

**Done when** (met, live) a deliberately mangled
ingredient list is rejected by the dry run. Re-verified 16 September against
the real dictionary and a real OBF pull, not just the unit test: a full
`--dry-run` run (500/500 products, 7 pages) rejected
**41 rows for "formula not recognised by the dictionary,"** with
printed samples showing genuine garbled/bilingual-smashed ingredient text
getting caught. The unit test (`import-obf-gates.test.ts`) still
covers the logic in isolation; this is the live end-to-end path actually
being watched reject junk, closing the gap between "the gate exists in code"
and "the gate works against the real 35,805-name dictionary."

**One piece shipped, then reverted.**
`scan-label.tsx` briefly read the name typed after a missed
barcode from `productSuggestions` and sent it as
`label-ocr`'s `name`. Codex flagged it P1 on review:
once a row has a name, `existing?.name` wins on every later write
through this path, so an unverified, user-typed guess becomes permanent and
uncorrectable for that barcode — worse than the honest "Scanned product"
placeholder it was meant to replace. Reverted the same day. Passing
`name` or `brand` from the client stays blocked until
5b gives a wrong one a way to be corrected.

### 5bGate what label-ocr writes — shipped, then half of it reversed

**Reversed 20 September 2026 — read the row-accrual bullets below as history**

**The decision this step recorded as "decided and shipped: Option 2"
was undone four days later.** Commit `5df2173` ("a product
exists only with a name, a barcode and an ingredient list") settled the
question the other way: **a scan without a barcode now leaves
nothing behind at all.** Migration `0022` makes
`replace_product_with_ingredients` refuse a row missing any of
the three, and `scripts/prune-incomplete-products.mjs` removed
the rows that already existed.

So four things this section describes as live are gone from the tree —
verified by reading it, not by trusting this page: the
`resolve-scan` Edge Function (`supabase/functions/`
now holds only `label-ocr`, `product-lookup` and
`_shared`), the screen `app/attach-barcode.tsx`,
the `BarcodeOfferPrompt` component, and the 24-hour
`expires_at` grace window on a barcode-less row. A new screen,
`app/add-product.tsx`, collects the barcode and the name
instead, and `label-ocr` became two calls: read a photo (stores
nothing, hands back the list) and save (barcode + name + list, re-validated
server-side). `scan_tokens` was dropped; the single-use
`readToken` in `used_read_tokens`
(migration `0023`) is what guards a save now — see
`docs/threat-model.md`, which is current.

The gate this step is actually named for — the plausibility ratio
running before the write rather than after — survived all of it and is
still live. That half is not affected.

**Split again, 16 September 2026,** once the work actually
started: one piece needed an Edge Function change and turned out smaller
than the three-options framing below expected; one piece is a product
decision, not an engineering one, and stays open under this step; one piece
has moved to step 9, because it turned out to be the same problem step 9
already owns.

- **Gate what our own OCR writes, not only what we import — shipped.**
  `label-ocr` now runs the same plausibility ratio the import
  scripts use (`MIN_KNOWN_INGREDIENT_RATIO = 0.6`) before the RPC
  write, not after. A photo that mostly misses the dictionary is refused with
  no row created, the same way a bad import row is refused. Shipped as
  **PR #109**, alongside the review-findings pass it travelled with.
- **The publish happens before the check that rejects it — fixed by
  the same change.** Moving the gate before the write closes the
  ordering bug directly: nothing is committed until after the ratio check
  passes, so there is no window where a bad photo becomes a permanent row.
- **The obvious fix does not work as-is — turned out to be wrong,
  in a good way.** The three options below assumed "stop writing the
  row" breaks the scan flow, because `app/result/[id].tsx` loads
  by id from the database. That assumption was stale by the time this was
  built: step 1's catalogue cache already resolves a just-scanned product
  from memory (`fetchProduct` checks the cache before the network,
  and `analyseLabel` populates it before navigating), so the DB row
  was never actually load-bearing for rendering the result screen. No staging
  table, no expiry migration — reject before writing, same as the importers
  already do, and the result screen never even notices.
  - **Hand the product back in memory** — this is
    effectively what already existed via the cache, once it was checked;
    no new plumbing needed.
  - **Write it with an expiry and let it self-evict.** Not
    needed — nothing is written for a rejected scan at all.
  - **Keep writing, keep hiding.** Not taken.
- **What a scan without a barcode should leave behind — decided
  and shipped: Option 2.** Show the verdict like normal, then ask
  afterward — "scan the barcode too, so the next person gets this instantly."
  Accept it and the row becomes permanent and findable; decline, or just walk
  away without answering either, and it's discarded. The "walk away" case is
  not a client-side unmount handler (unreliable — never fires on a force-close
  or a crash): `label-ocr` now writes a barcode-less row with a 24h
  `expires_at`, and the existing hourly
  `evict-expired-products` job — already source-agnostic, already
  running — cleans it up on its own if nobody ever answers. Migration 0014
  widened the check constraint that previously forbade any non-`inci_api`
  row from carrying a deadline at all. New Edge Function
  `resolve-scan` owns the two explicit outcomes (attach-barcode
  clears the deadline back to permanent; discard deletes outright, cascading to
  `product_ingredients`), scoped to
  `source='ocr' and barcode is null` on every operation — not a
  convenience filter, the entire security boundary on an unauthenticated
  endpoint. New screen `app/attach-barcode.tsx` is the "yes" path's
  camera.
- **Cross-source identity and conflict precedence — deferred to
  step 9, as planned.** Deciding that OBF's and MFDS's COSRX cleanser
  are one product only has meaning once a second product source exists.
- **Moved: the client-supplied name/brand correction path is now
  step 9's, not this step's.** Originally listed here as "the
  prerequisite for 5a's reverted piece" — but a correction mechanism (some
  way to fix a wrong name later) is the same shape of problem as cross-source
  precedence above: both are "what happens when what's stored disagrees with
  what's true," and step 9 already owns the precedence rule that would
  govern it (government register beats crowdsourced, a fresh user OCR of the
  physical box beats both). Building the correction path here, before a
  second source exists, would mean designing that rule against a
  hypothetical and likely redoing it once step 9 lands. See step 9.

**Done when** (met) an `ocr-<uuid>` row
cannot be created without passing the same plausibility gate the importer
uses. The other two original criteria are no longer this step's: the
staging-row question resolved itself (see above, nothing to promote), and the
name/brand correction criterion moved to step 9's done-when.

**Status — live, 17 September 2026.** **PR #109**
merged, then two more review rounds landed on the same branch before
it went in: a P1 (missing ownership check on
`resolve-scan` — anyone could hijack or discard someone
else's pending scan; fixed with the `scan_tokens`
capability token) and six smaller CodeRabbit findings (a
false-negative retry state, a scanner accepting barcode formats
the server would reject, a cancel-during-request race, a stale
lockfile entry, and an idempotency gap in the attach flow — all
fixed the same day). Migration `0009`'s own dictionary
lookup gap (below) was fixed earlier, in the same pass.

**Deploying it surfaced a bigger gap than this
step's own two migrations.** `supabase migration list`
showed `0008` through `0015` had never
actually reached production — not just 5b's `0014`/
`0015`. That includes `0008`, the
transactional RPC `label-ocr` and
`product-lookup`'s *already-deployed* code was
calling, and `0009`/`0010`, the
`fetched_at` fixes step 1's own notes above call
"applied" — they weren't. All eight are applied now.
`0012` needed a `migration repair` rather
than a plain push: `sync_bookmarks` already existed
live from step 3's earlier deploy, just never recorded in the
migration history table. `label-ocr` is redeployed
(v16) and `resolve-scan` is live for the first time
(v1); both sanity-checked against the running project, not just
against a local test run.

*Effort: 5a: shipped, small. 5b gate: shipped, small. Row-accrual decision: shipped, medium (new Edge Function + migration + a new screen). Name/brand correction: moved to step 9. All of it live as of 17 September 2026.*

### Step 6 — Turn the mirror into a real cache

**Status: Done · verified 18 Sep 2026**

*Tags: App-side · fixes step 1's limits · before the cap comes off · verified · issue #115 closed*

Step 1 shipped a complete mirror of the products table — no size cap and
no eviction. (The third item here used to be the memory layer's lack of
expiry; review closed that one, so it is no longer step 6's to inherit.)
Correct at 153 products; broken somewhere near 1,000, silently and on
Android first. This is the work that
converts it into something that holds, and it sits here because step 4 has
just produced enough volume to build it against while step 7 waits on it.

Step 2 buys time by shrinking every row; it does not remove the ceiling.
Doing this at ~500 products rather than at the breaking point leaves
headroom to land the change calmly.

**Verified 18 September 2026.** Every piece of this step was
written, merged and green well before that — the one claim it all rested on
was the Android `CursorWindow` ceiling, read off the installed
package rather than measured on a handset, with an AsyncStorage test double
that has no size limit so all 456 tests would have passed just as happily
against a wrong number. Run on a real Android phone: opened Browse, force-closed
the app from the recent-apps view, relaunched. No `skipped` or
`failed` write warning either way — the write and the cold-start
read both held, at today's live catalogue size. **Issue #115 closed** on the
strength of that run. It confirms the mechanism, not the exact number at higher
volume — see the open question at the foot of the page for what step 7's cap
lift still needs of its own.

**Split into two, 17 September 2026**, then **6b
re-scoped the same day** once four of its pieces had shipped and the
page was read back against the merged code. **6a** was the
cheap, urgent slice. **6b** was described here as "five pieces,
none begun" and actually listed six — of which four are now done, one was
never built because the measurement contradicted it, and one turned out not
to be cache work at all.

### 6aStop three failures from hiding — shipped and merged

- **A write that failed said nothing.**
  `persist()` swallowed its own errors, so an over-quota Android
  device just stopped caching and nothing recorded it. Fixed:
  `lastCacheWrite()` now reports exactly what happened —
  saved, skipped as too large, or failed, with the reason.
- **Measured before writing, not discovered by failing.**
  The serialised size is checked against a budget and the write is skipped
  rather than attempted and half-completed. The budget itself needed a
  second pass — it was first set from the wrong Android limit (the 6MB
  whole-database ceiling) and briefly stood at 4MB; corrected to
  **1.5MB**, sized against the real per-value read limit
  (`CursorWindow`, ~2MB) instead. Measured against the live
  catalogue this session: **1.06MB for 647 products**, so real
  headroom is roughly 900 products, not the ~2,000 first estimated.
- **Both slow network calls now time out.**
  `functions.invoke` had no deadline, so the barcode cascade and
  the OCR read could hang until the platform gave up, with no message and
  no way to retry. Bounded now — 12s for the barcode lookup, 45s for a
  label photo (longer on purpose: it waits on image analysis, and cutting
  it short would throw away a photo the user already took).

**Done when** (met) every write records its outcome,
an oversized payload is skipped rather than half-written, and both
`functions.invoke` calls abort with a retryable error instead of
hanging — each pinned by a test.

**Status.** Shipped as **PR #107**, plus one
follow-up commit from self-review (a stale capacity estimate in the budget
comment corrected against the real 647-product measurement, and test
coverage added for the two timeouts and the barcode-lookup path — it had
none). Four review passes clean: self-review, two code-review passes
(a full-diff high-effort pass found one candidate defect, traced by hand
and refuted — a guard clause the reviewer missed), and security-review.
368/368 tests, typecheck and lint clean. **Merged** — it is on
`main` (`f60a2c3`, `a3ed1d9`), and 6b-4 has
since rewritten the budget it introduced: the 1.5MB figure above survives only
as Android's *per-value* limit, and the total it is checked against is
now platform-specific.

### 6bBound, window, and cache the scoring — four of six shipped

Everything step 6 originally asked for, minus the slice 6a covers. The
sub-numbers are the order they were built in.

| Piece | State | What it turned into |
| --- | --- | --- |
| 6b-1 | Shipped · PR #110 | An outage is its own state, not "not found." `data/api.ts` returns a discriminated result rather than throwing, and an outage-caused miss is never written to history. |
| 6b-2 | Shipped · PR #111 | The scoring cache — but a `WeakMap` keyed on the product object, comparing profiles by identity, rather than the id-plus-version key planned here. Exact, cheaper, and needs no eviction of its own. |
| 6b-3 | Shipped · PR #112 — fetch cursor deferred, on purpose | Not what this page predicted. Measurement found neither fetching nor drawing was the bottleneck — **the scoring pass was**, at 1,572ms of frozen UI for 5,000 products. Browse now scores in 400-product chunks, yielding between them, and sorts only after the last one. The 40-row reveal is the secondary half. `ProductFilters` still has no page or cursor — see below. |
| 6b-4 | Shipped · PR #113 | **Not on this page's original list.** Platform-aware disk budgets; Android splits a large payload across generation-scoped chunks with the manifest written last, so an interrupted write leaves the old catalogue whole. This is what went in where the LRU was meant to. |
| LRU | Struck | Never built. Contradicted by its own measurement, and wrong on the one platform that needed it — see below. |
| Windowing | Moved · step 12 | Not cache work: it is an architecture decision about where scoring runs. Left here it was blocking itself inside a nearly-done step. |

**Why the LRU was struck rather than deferred.** The
measurement said the mirror fits — 1,640 bytes per product against a 32MB
iOS budget and a 3MB web quota — so on the platforms with room it would have
been inventing work. And on Android it is not merely unnecessary but
*wrong*: Browse ranks every product against every other, so a product
evicted from the cache cannot be ranked against the ones still in it. An LRU
would quietly change the app's answer depending on what the user happened to
look at recently. **Reopened as a question at the foot of this page**,
with what would change the verdict.

**Why 6b-3 has no fetch cursor — decided, not overlooked.**
PR #112 recorded the deviation and the reason: *"Global ranking means
Browse needs the whole catalogue to sort it, so a paged fetcher would have no
caller. Adding one now would be dead code."* That is right, and it is why
the cursor is step 12's rather than a loose end here — its shape depends on
what the server sorts by, which is step 12's open question. The commit points
forward to "6b-4 is where windowing makes it real"; 6b-4 became the disk
budget instead, so that reference is stale and **step 12 is the real
home**.

**And 6b-4 cost something, recorded rather than hidden.**
Budgeting for an atomic replace holding two copies at peak halved the
Android budget, so a phone holds roughly **1,200–1,500 products**,
not the 5,000 this step's done-when asks for. **Step 7's premise depended
on the opposite** and is corrected there.

**Left alone deliberately:** barcode lookups stay memory-only,
one hour, never on disk (who scanned what is derived from the user, and the
storage policy draws its line there); search results stay uncached
(long-tail, poor hit rate); OCR stays uncached (its inputs never repeat).

**Done when — rewritten, and met.** Three of the four
original criteria no longer describe what was built: there is no eviction
policy to pin a test to, memory is bounded by the catalogue rather than by a
cap (the same decision), and 5,000 products cold-start on iOS and web but not
on Android. What holds now: Browse scores in chunks rather than freezing, an
outage is never recorded as a miss, a product is scored once per profile
rather than once per screen, and a catalogue too large for one value is split
rather than refused. **The thing that was still open — none of it had run on
a real Android device** — is now closed: run on a real phone 18 September,
write and cold-start read both held, no budget-skip or failure warning.
**Issue #115 closed.**

*Effort: 6a: shipped, small · 6b: four shipped, one struck, one moved to step 12 · smaller than "the real bill for step 1's simplicity" implied, because the most expensive piece was the wrong thing to build*

### Step 7 — Lift the import cap

**Status: Built · iPhone check pending**

*Tags: Pipeline · needs step 6 · Android's ceiling no longer blocks this*

The second half of step 4, held back until the cache could survive it.
Remove the 500-row ceiling and page the full Open Beauty Facts result set, or
bootstrap from the daily dump.

**Rewritten 19 September 2026 — iOS-only MVP decided; this step's blocker is gone**

**The app is iOS-only for the MVP.** Android and web stay in
the tree — nothing is being deleted, and the platform-aware cache work in
step 6 keeps working for both exactly as built — but neither gets further
development or device testing while iOS is the only release target. That
decision removes this step's entire blocker: the two corrections below
(17 and 19 September) were both about raising *Android's* disk
ceiling, and Android is no longer what this step has to clear.

iOS was never disk-constrained the way Android is — `IOS_TOTAL_BUDGET_BYTES`
is 32MB with no per-value cap, against Android's 1,200–1,500-product wall.
At the measured ~1,640 bytes/product that is comfortably tens of thousands
of products, well past "the catalogue in the thousands" this step targets.
**Lifting the cap needs no ceiling raise at all now** — it is
back to being the plain cap deletion this step originally described, plus
a real-device check on the platform that now actually ships.

The `expo-sqlite` investigation from the previous correction —
confirmed to ship in Expo Go for SDK 57, no dev-build cost — is not wasted,
just not needed to unblock this step today. It stays written down (and the
concrete plan already drafted for `data/catalogue-cache.ts`
stays valid) for whenever Android becomes a release target again, rather
than being redone from scratch.

- Nothing new to design: step 4 already built the paging, step 5 already
  built the gates. This step deletes a constant and lets the two of them
  run.
- **Verify on a real iPhone, not the simulator.** A cold
  start on real hardware is the test that means anything — step 6 got one on
  Android on 18 September (**issue #115**, closed) at today's ~600-product
  catalogue; that confirmed the chunking mechanism, which iOS's platform-aware
  path never needed in the first place. This step still needs its own
  real-device run at the larger catalogue size, on iOS, before it counts as
  done — a passing calculation is not the same claim step 6's precedent
  requires.
- Expect the catalogue in the thousands. Steps 9 and 10 add to it after
  this, not before — one source at a time, so a regression has one suspect.
- **The real ceiling left is memory, not disk, and it is far
  out.** Step 1's own table puts 74,000 products at roughly 780MB of
  heap — a RAM concern rather than a storage one, and one that applies on iOS
  same as anywhere else. That is where step 12 (stop mirroring, decide where
  scoring runs) eventually becomes necessary — not at Android's old
  1,500-product wall, but somewhere far higher, closer to this page's
  full ~74,000-product ceiling. See step 12's own note on this.

**Done when** the catalogue is in the thousands and a
real-iPhone cold start still renders from cache with no failed write. No
Android or web verification required for this to count as done while iOS is
the only release target.

**Built · checked 7 October 2026.** The 500 cap is gone
(**#180**, closed 24 September): `scripts/import-obf.mjs` keeps only
`MAX_REQUESTS = 150`, a loop guard rather than a cap. `--dump <file>`
(2 October) reads OBF's whole nightly export, about 2,830 usable face products, instead of
the six categories the API sweep pages. Staging held 2,846 products on 7 October before
#431 removed six hair-dye kits. **Not yet met:** the done-when's real-iPhone cold start
at that size. That check is the only thing between this flag and done.

*Effort: Small — cap deletion plus one real-device iPhone check ·
the Android ceiling-raise work below is parked, not required, for the MVP*

### Step 8 — Schedule the imports — and make old rows expire

**Status: Done · 18 Sep 2026**

*Tags: Pipeline · needs step 3 · fixes step 1's staleness gap*

Nightly incremental products, monthly formula reconciliation. Heavier jobs
belong in a scheduled GitHub Action rather than an Edge Function, which is
runtime-capped. `pg_cron` is already installed and already running
the hourly licensed-cache eviction at `17 * * * *` — the pattern
exists and this reuses it.

**Checked against `main`, 7 October 2026: only the reconciliation half is
scheduled.** `reconcile-obf.yml` re-reads rows the catalogue already holds; it
adds none. New products still arrive only when someone runs `import:obf` by
hand, and that script's own comment says its bookmark is not safe to import
from incrementally. "Done" above is the reconciliation.

**The reconciliation half is the part that matters, and it was a
throwaway phrase until step 1's limits made it concrete.** Right now
no row in the catalogue ever expires unless a licence forces it to: an
`obf` or `ocr` product carries
`expires_at = null` and is never re-read. A formula written back
by a scan in September is served unchanged in November, scored with full
confidence against ingredients the brand may have since replaced.

- **Re-read rows by age, oldest first.**
  `fetched_at` already exists on every row and is already
  indexed-adjacent work — this is a query, not a schema change.
- **Only the licence-free sources.** `inci_api`
  rows already expire hourly and must not be re-fetched in bulk; their terms
  forbid it. This applies to `obf` and `ocr`.
- **Decide what a changed formula means** before running it:
  silently rewriting a row changes the score of something a user has saved,
  with no notice. At minimum the change should be visible where a saved
  product is shown.
- **Surface the age past a threshold — partly done.** The
  ingredient screen has always rendered "Label read 2 months ago"
  (`app/product/[id].tsx`), and the product screen gained a
  six-month notice in PR #89. Browse still shows nothing. An old formula the
  user cannot see is old is the actual hazard — but a notice only admits the
  problem, and this step is the one that removes it.

**Done when** a run nobody triggered by hand shows up in
the bookmark table's `last_success_at`, *and* no
licence-free row in the catalogue has a `fetched_at` older than
the reconciliation window.

**Scope, decided:** `obf` only. Not
`ocr` — a barcode-less-or-not scan's formula came from this app's
own camera, not an external source there is anything to re-check it against;
a fresh re-scan is already how those update. Not `inci_api`,
excluded by its own licence (already expires hourly). `dailymed`'s
own reconciliation, if wanted later, is the same shape but a separate
decision.

**Shipped as** `scripts/reconcile-obf.mjs` +
`.github/workflows/reconcile-obf.yml` (nightly cron, off the hour,
plus manual dispatch), **PR #122**. Oldest `fetched_at` first,
self-rotating with no checkpoint file — every row touched moves its own
`fetched_at`, so it drops out of next run's "oldest" list on its
own. A new `formula_changed_at` column (migration 0017) records
when reconciliation found a row's ingredients genuinely different, distinct
from `fetched_at`'s "confirmed current" meaning — surfaced as a
notice on the product screen for a saved product whose formula changed after
it was saved.

**Six review rounds, eight commits, twelve findings —
eleven fixed, one disagreed with in writing.** Codex and CodeRabbit between
them found: the formula-replace RPC writing `formula_changed_at` as
a second, non-transactional statement (a failure between the two would
permanently lose the change event — migration 0018 makes it one write);
the RPC's own auto-detection of a change treating "brand new product" and
"existing product that had no formula yet" as the same case, which
`barcode_db` rows make a real scenario, not a hypothetical
(migrations 0019, 0020); both Edge Functions' `SELECT`s omitting
`fetched_at`/`formula_changed_at`, silently erasing a
pending notice on a re-scan; a persistently-broken row starving every healthy
row behind it forever, since a retryable failure never advances
`fetched_at` (fixed by paging past unreadable rows up to a request
ceiling, rather than stopping at a fixed batch); a run that touched nothing
still recording success; a 429 retry counting as one request instead of two,
which could have doubled the request ceiling silently; and the disk-cache
`SCHEMA_VERSION` not bumping for a shape change that would have
silently suppressed the notice on any device with a pre-existing cached
catalogue. **Disagreed, in writing, on one:** CodeRabbit wanted a single
write failure to be caught and skipped rather than aborting the whole run —
rejected as inconsistent with `import-obf.mjs`'s own established,
deliberate precedent for the identical situation (throw, let the run die,
redo the whole thing next time, rather than accumulate partial success).

**Run for real, 18 September 2026.** Migrations 0017–0020
applied to the live project; `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` added as repo secrets (the first attempt
at the second one landed empty — caught because the workflow failed loudly
rather than recording success, exactly per this step's own done-when).
Triggered by hand to confirm the mechanism end to end (the schedule itself has
not fired unattended yet — that is a formality of the clock, 02:47 UTC, not a
risk left open): `269 unchanged, 30 changed, 1 gone from OBF, 16 unread
(will retry next run)`, `sync_bookmarks` updated. Confirmed by
reading the run's own log, not by trusting a green checkmark.

*Effort: Small for the schedule · medium for reconciliation · the highest-stakes correctness work on this page*

### Step 9 — Connect the Korean MFDS register

**Status: Not possible · closed 26 Sep 2026**

*Tags: Pipeline · needs step 3 · needs a migration · also owns 5b's name/brand correction · checked 19 Sep — no Android/web dependency*

The largest genuine expansion, and the one that makes this a Korean-market
app rather than a Western catalogue with some Korean brands in it. Korea
requires cosmetics to be notified to the MFDS, and that register is open data:
thousands of Korean SKUs with official, correctly spelled ingredient names —
precisely the gap this app was built around.

- Published as dated file releases on a fixed schedule; check monthly and
  diff against what we hold.
- Needs a Hangul → INCI mapping step first.
- **It needs an enum migration, and this is easy to miss.**
  `mfds` is a valid *ingredient* source and has been since
  the first migration — but `product_source` is a different enum,
  currently `obf`, `inci_api`, `curated`,
  `barcode_db` and `ocr` (the last two added in
  `0005_scan_first_sources.sql`). MFDS is not among them. Small
  work, but not free, and not already done.
- **Moved here from step 5b, 16 September 2026: the client-supplied
  name/brand correction path.** `label-ocr` has kept
  passing a client-supplied `name`/`brand` blocked
  since it was tried and reverted (Codex flagged it P1: once a row has a
  name, an unverified guess becomes permanent and uncorrectable) — safe only
  once a wrong one has a way to be fixed. That correction mechanism is the
  same problem as this step's own cross-source precedence question — both
  are "what happens when what's stored disagrees with what's true" — and this
  step already states the rule that would govern both: a government register
  beats a crowdsourced entry, a fresh user OCR of the physical box beats
  either. Design the correction path against that rule once it exists here,
  rather than against a source-free guess beforehand.

**Done when** Korean products appear in Browse with
correctly spelled INCI names and MFDS attribution, cross-source conflicts
resolve by the stated precedence rule, and a wrong client-supplied
name/brand on an `ocr-<uuid>` row can be corrected rather
than staying permanent.

**Closed as not possible · 26 September 2026 (#181).** None of
MFDS's open product datasets carries a barcode (the functional-cosmetics one has no ingredient
list either), and since migration 0027 a product cannot exist without one. So Korean products
cannot come from this register. **What did ship** is the ingredient half: `scripts/import-mfds.mjs`
(#201) loads MFDS's official Korean ingredient names as synonyms, so a Korean label resolves.
On staging since 26 September (about 21,900 Korean names); the production run is on #316.
The name/brand correction path is moot too: people can no longer add products from the app,
so there is no client-supplied name left to correct.

*Effort: Large · highest value · do it deliberately — now also carrying 5b's deferred correction path*

### Step 10 — Poll US DailyMed for sunscreens

**Status: Retired · 22 Sep 2026**

*Tags: Pipeline · needs step 3*

Public domain, genuinely incremental (daily and weekly update packages
alongside the full download), and no licensing question at all. Narrow scope —
sunscreens only — but authoritative ones. Good to have; never urgent, and
last here because it is the smallest gain on the page.

**Shipped as** `scripts/import-dailymed.mjs`
(**PR #108**, merged 16 September) — but not run for real until 18 September,
which is the date this flag actually goes on. Same precedent as steps 3 and 4:
code merged is not done, a confirmed live run is.

**Run for real, 18 September 2026.** Dry run first:
400 labels seen, 200 usable, rejections matching the documented gates (no
active-ingredient section, too few parsed ingredients, non-skincare, dictionary
miss, no UV filter) — nothing unexpected. Real run immediately after matched it
exactly: `Wrote 200 products and 6039 ingredient links.` Confirmed by
reading the tables back, not the script's exit code:
`select * from sync_bookmarks where source = 'dailymed'` returns a
row, and `select count(*) from products where source = 'dailymed'`
returns **200**.

**Done when** (met) DailyMed sunscreens appear with
public-domain attribution.

**Retired · 22 September 2026.** Shipped and run, then undone:
DailyMed labels have no barcode, migration 0022 made a barcode compulsory, the 200 rows were
pruned, and `import:dailymed` now stops with "import:dailymed is retired" and writes
nothing. Checked 7 October against `scripts/import-dailymed.mjs`. Using a label's
printed strength, the one thing DailyMed offered that no other source does, is #174.

*Effort: Small–medium · lowest priority on this page · shipped and run*

### Step 11 — Put real limits on the two endpoints that spend money

**Status: Done · 18 Sep 2026**

*Tags: Backend · blocks on nothing · urgent with users, not rows*

The one finding from the repository review with no home anywhere above,
because every other step on this page is about what the catalogue
*holds* and this one is about what it *costs*. Numbered last
rather than scheduled last: nothing here blocks on it, and it blocks
nothing, but the day it matters it will already have mattered.

**Both metered endpoints are anonymous, and the rate limit does not
survive a cold start.** `supabase/functions/_shared/http.ts`
keeps its counters in an in-memory `Map`. Edge Functions run as
isolates: each one has its own copy of that map, and a cold start resets it.
So the limit is per-isolate rather than per-user or per-deployment, and
concurrent requests simply land on different isolates and each get a fresh
allowance. Behind those endpoints are Google Cloud Vision
(`label-ocr`) and the INCI API (`product-lookup`),
both billed, neither ours.

- **Set the provider-side spending cap first.** It is ten
  minutes of work in two dashboards, it needs no code, and it is the only
  control here that bounds the *worst* case rather than the expected
  one. Everything below is about not hitting it.
- **Move the counter somewhere durable.** A Postgres table is
  enough and the database is already there — one row per key, incremented in a
  transaction, which is a shared counter by definition. Redis if the write
  volume ever justifies it; it does not today.
- **Limit per operation, not per function.** A barcode lookup
  and a Vision call cost very different amounts, and a single shared budget
  either throttles the cheap one needlessly or lets the expensive one run.
- **Decide what the key is, and accept that it is imperfect.**
  There are no accounts, so there is no user to limit. An IP is shared by a
  whole café and rotates on mobile networks; a device identifier can be
  reinstalled away. Neither is a real identity — the honest framing is that a
  limit here raises the cost of abuse rather than preventing it, which is why
  the spending cap above is the actual floor.
- **Attach a request id and log the refusals.** A quota that
  nobody watches is discovered from an invoice. This is also what makes the
  difference between "someone is hammering us" and "we are simply more
  popular" visible at all.
- **Device attestation is the escalation, not the starting
  point.** App Attest and Play Integrity would bind requests to a real
  install, and they cost real work, a development build, and a story for the
  web target that does not have them. Hold it until the cheaper controls are
  demonstrably not enough.

**Done when** a burst from one source is refused by a
counter that survives a cold start and is shared across isolates, both
providers have a hard spending cap configured, and a refused request appears
somewhere a human would look. **Two of three met** — the provider-side cap
is not code and is now **step 14**, since leaving it inside a step marked
done would have hidden it.

**Shipped · 18 September 2026.** Migration
`0016` adds `rate_limits` and
`consume_rate_limit`, which increments and answers in one
`on conflict do update … returning` — so N concurrent
callers get N distinct counts rather than all reading the same
under-the-limit value. Fixed window rather than sliding: one upsert instead
of a row per request, at the cost of 2× the limit across a boundary,
which is the right trade for a limit sized to protect a billing account.
The caller is stored as an HMAC fingerprint, never the address —
`docs/threat-model.md` classifies a caller IP as personal data
this system does not persist, and the first draft stored it raw until review
caught it. Refusals log one `key=value` line per window across
every isolate, and the reply carries `x-request-id` and
`Retry-After`.

**And it limited nobody for its first two days live.**
The step above worried about the right thing and this page's own bullet said
so — *"decide what the key is, and accept that it is imperfect"* — but
the failure was not the imperfection it anticipated.
`callerKey` read the last `x-forwarded-for` hop, which
Cloudflare varies per request, so every request arrived as a new caller and
no count ever accumulated. Found by hand, from two numbers: 25 requests all
returning 200, and 16 rows for 37 requests. Fixed in **PR #120** against a
measurement rather than a second inference — a temporary probe on a deployed
function reported `cf-connecting-ip` present and constant across
five requests while the last `x-forwarded-for` hop took three
values; `x-real-ip`, `forwarded` and
`true-client-ip` never arrived at all.

**The lesson, and what it cost.** Unit tests covered
the arithmetic against a stub database and SQL tests covered the function
against no HTTP at all; both passed throughout the outage, because the fault
was in neither. **PR #123** adds an end-to-end test — real
`Request`, real header, real Postgres, real 429 — and restoring
the old `callerKey` fails three of its four cases. It found a
second defect on its first run: `fingerprintCaller` throws on an
empty secret, and that throw sat inside the `try` handling
database outages, so a missing salt did not degrade the limiter but removed
it, silently, behind a log line claiming otherwise.

*Effort: Cap: moved to step 14 · counter: shipped, medium · the only step here that is about money*

### Step 12 — Stop mirroring the catalogue — and decide where scoring runs

**Status: Parked · Browse removed 1 Oct**

*Tags: App-side · Backend · needs 6b-3's fetch cursor · triggered by size, not by date*

**Added 17 September 2026**, out of step 6b. It was listed
there as "window the catalogue instead of mirroring it," one bullet among
six, and that placement hid what it actually is. Windowing is not a caching
tactic. It is the visible consequence of a decision this page has never
made.

**The app ranks every product against every other, on the device.**
That is the premise — it is why Browse fetches complete formulas, why
scoring is local, and why the cache is a whole mirror rather than a working
set. A product the phone does not hold is a product that cannot be ranked.
So the moment the catalogue stops fitting, ranking has to move somewhere
that holds all of it, and that somewhere is the server.

**Corrected 19 September 2026 — the trigger moved, it did not disappear**

This step's own next bullet was written against Android's old
1,200–1,500-product wall. With the app iOS-only for the MVP, that specific
trigger no longer applies — Android and web are parked, not developed or
tested further, and iOS's 32MB per-value-uncapped budget has no comparable
near-term wall (see step 7). **That pushes this step's trigger out,
it does not retire it.** The underlying reason this step exists —
Browse ranks every product against every other, on the device, so a
product the phone does not hold cannot be ranked — is a memory ceiling
(step 1's own ~780MB-at-74,000-products figure), not a disk one, and it
applies on iOS same as anywhere else. Revisit this step once the catalogue
approaches that range, not before, and re-check the trigger if Android
ever comes back into scope, since its wall is real and much closer.

- **The trigger is a number, not a date.** At the ~74,000
  products this page measures itself against, mirroring is off the table on
  every platform — step 1's own table puts 74,000 at roughly 780MB of heap.
  **Do not build this before then:** client-side paging over a full mirror
  is genuinely the better design while the mirror fits, because it ranks
  correctly and works offline.
- **6b-3's missing half is the prerequisite, and it is deliberately
  still missing.** `ProductFilters` needs a page or cursor
  argument before anything here can start — without it a "windowed" cache is
  still asked for every row the moment Browse opens. It was left unbuilt on
  purpose: *what* the cursor pages by depends on the answer below, and
  building it first means building the wrong one.
- **The fork: what does the server sort by?** Paging by score
  means the server knows the user's skin profile — which is personal data
  leaving the device, and this project's storage policy has a line about
  exactly that. Paging by name, brand or type keeps the profile local and
  gives a Browse list that is *not ranked at all*, with scores filled in
  per page after they arrive. Those are different products, not just different
  APIs.
- **What stays on the device regardless.** Saved products,
  scan history and recently viewed — the set genuinely re-read, and the set a
  person expects to work on a plane. Whatever this step does to Browse, it
  should not be able to take those offline.
- **This is also where the LRU question returns** (see the
  foot of the page). A windowed cache needs a rule for what to drop, and
  "least recently used" stops being wrong the moment global ranking is no
  longer the device's job — because the thing it would have broken has moved
  to the server.

**Done when** Browse pages from the network against a
catalogue too large to hold, the device keeps saved products and scan history
working offline, and the ranking a user sees is the same one they would have
seen from a full mirror — or the page says plainly that it is not.

**Parked · checked 7 October 2026.** This step's whole premise was
Browse ranking every product against every other, and Browse and search were removed on
1 October. Nothing on screen ranks the full catalogue any more. The mirror itself is still
there — `data/api.ts` reads it through `data/catalogue-cache.ts`, and the
routine builder (`lib/routine-build.ts`) calls `fetchProducts` — so the
memory ceiling this step described still applies, just with no ranked list depending on it.
**#182** holds the question of whether to keep mirroring at all.

*Effort: Large · an architecture decision before it is any code · do not start it early*

### Step 13 — Give `contactWeight` room for what a type actually contains

**Status: Done · 18 Sep 2026**

*Tags: App-side · blocks on nothing*

**Added 18 September 2026**, out of a second Codex review round
on **PR #119** (graded exposure weighting, itself out of step 11's
neighbourhood only by coincidence of timing). Both findings below are the
same shape: `contactWeight` judges a product by its
`ProductType` alone, and a type is a coarser signal than the
weighting now leans on. One related finding on the same PR was small enough
to fix directly — `shampoo` moved to full weight, since the bare
classifier match also catches a left-in dry shampoo. These two are not that
small.

### A type spans exposures the weight can't see

- **Micellar water is typed `cleanser`, and
  `cleanser` is discounted to 0.25.** Most of what carries
  that type genuinely is rinsed off within a minute — foam, gel, oil, balm —
  which is exactly why the discount exists. Micellar water is the type's one
  common exception: designed to be wiped off rather than rinsed, so it keeps
  its full exposure to whatever it contains. Moving the whole type to full
  weight (the fix already applied to `shampoo`) would cost the
  majority's accuracy to fix the minority's; the type just needs splitting,
  and today it can't be, because nothing distinguishes a micellar formula from
  any other cleanser except the word "micellar" itself, which nothing reads
  before assigning the type.
- **The honest fix is a new distinction, not a table edit.**
  Either a new `ProductType` (its own classifier rule ahead of the
  generic cleanser match, in *both* runtime copies —
  `scripts/import-obf.mjs` and the Edge Function — plus the union
  entry, the label, an icon and illustration asset, and a
  `contactWeight` entry of its own), or teaching
  `contactWeight` to look past `type` at the product's
  name or tags directly — which breaks the one invariant this file states
  about itself, that type is the *only* thing about a product that
  reaches the score. Comparable in size to the 16-category
  `ProductType` expansion, not a follow-up commit.

### The same weight scales what helps and what hurts

- **`contactWeight` was reasoned about as a risk dial and
  built as a volume dial.** Every ambiguous type (`exfoliator`,
  `conditioner`, `hair-mask`, `shampoo`) takes
  full weight so an irritant is never under-counted — but
  `lib/matching.ts`'s `weightAt = positionWeight(position) *
  contact` feeds that same number into a rule's `helps`
  contribution too, which raises concern fit, not just its
  `hurts`/irritation contribution. Full weight for an ambiguous type
  therefore also means full *benefit* credit.
- **Found by Codex, concretely:** an oily/acne-prone user who
  is not sensitive, using a rinse-off physical scrub with salicylic acid.
  Salicylic acid's `hurts` rule needs sensitive skin to fire, so for
  this user there is no harm signal to inflate at all — only the benefit
  signal, credited at full leave-on strength for a product with genuinely
  short contact time. The comment that justified full weight ("the cost lands
  on the rinse-off variant being judged a little harshly") is corrected in
  `lib/rules.ts` and `docs/decisions.md` as of PR #119,
  but the scoring behaviour itself is unchanged: this case can be
  over-credited, not merely judged harshly.
- **The real fix touches the scoring loop, not the weight table.**
  Separating benefit weighting from harm weighting in
  `lib/matching.ts` is a change to the most safety-relevant file in
  the app, and deciding *how much* to discount benefit for an ambiguous
  type is a fresh piece of cosmetic-science reasoning — the same kind of pass
  that produced `contactWeight` itself — not a value to guess at
  inline. It also needs validating against every sample product's score before
  it ships, since it moves real numbers for real recommendations.

**Half shipped · 18 September 2026.** The benefit/harm
separation landed as **PR #127**: `contactWeight` now returns
`{ harm, benefit }` instead of one number, positive evidence scales
by `contact.benefit` while irritation, caution and pore-clogging
scale by `contact.harm`, and a sensitive-only harm that never
actually reaches a real score path no longer shows as a negative reason
(`harmApplied`, added after two further Codex findings on the same
PR — the first an uncounted-harm case, the second a pore-clogging exclusion
copied from the wrong loop and stripping real reasons it shouldn't have).
564/564 tests, CI green, merged. The cleanser split below shipped separately,
as its own PR.

**Done when** a rinse-off product's ingredient
*benefit* is discounted the same way its *harm* already is for
every type where the two are ambiguous (**met, PR #127**), and micellar (or
another genuinely no-rinse cleanser) scores its full exposure without
discounting the rinse-off majority of what `cleanser` holds
(**met, PR #130**).

**Closed · 18 September 2026.** `micellar-water`
landed as its own `ProductType` — `data/types.ts`'s
union and label, a classifier rule ahead of the generic cleanser match in
both `guessType` copies, and a `contactWeight` entry at
full harm and benefit in `lib/rules.ts`. That last piece needed no
new reasoning: this step's own harm/benefit split, from the first half above,
already defines what "full exposure" means for a leave-on-equivalent type —
micellar water only needed the type to exist to receive it. This page had
still carried this half as open; corrected 19 September 2026 against the
merged code.

*Effort: Medium for the cleanser split, shipped · large for the
benefit/harm separation, shipped · neither blocked the other*

### Step 14 — Clear the provider-side cost controls

**Status: Done · 18 Sep 2026**

*Tags: Console work · blocks on nothing*

**Added 18 September 2026.** What is left of
**issue #116** once step 11 closed. Step 11 built the limiter that
bounds how fast anyone can spend; this is the layer underneath it — the
caps and restrictions that live in Google's and inciapi.com's own
consoles, where no code of ours reaches. Separated out because it is the
only work on this page with no repository in it at all, and because
leaving it inside a step marked done would have hidden it.

- Budget + alerts on the Google billing account
- Lower the three unused Vision quotas
- Restrict the Vision key to Vision only
- Disable the unused Gemini API
- Find out what inciapi.com does at its ceiling (an email or their docs)
- The `cron.job` query — one line in the SQL editor, low stakes

**Done when** a hard cap or quota exists on both
providers rather than only Google, no unused API is enabled, and the Vision
key reaches nothing but Vision. Tracked in full on **issue #116**, which
carries the console paths and the reasoning for each.

**Closed · 18 September 2026.** Rotated the
Vision key in the same pass rather than auditing the old one in place — the
project it belonged to could no longer be located under the account that
created it, and a key nobody can account for is worse than not having one.
New key, new dedicated project, restricted to Cloud Vision API only
(application restrictions: none — this key is called server-side from a
Supabase Edge Function, not a browser or app, so referrer/package
restrictions don't apply and a fixed egress IP isn't available to restrict
to). Budget alert set on that project, alerts-only rather than an enforced
cap, thresholds at 50/90/100%. Confirmed working end to end against the real
app before the old key was deleted: a real label photograph returned real
ingredients through the new key.

**Two of six items turned out not to be this project's
to do.** Lowering the Vision quotas is not something Google's console
exposes for self-service on this API — every quota row read
“Ajustable: Non.” Not a gap, a wall: the real protection here is
the rate limiter (step 11) plus the budget alert, not a hand-tuned quota
table. And the Gemini API was never enabled on the fresh project in the first
place — nothing to disable.

**inciapi.com confirmed safe by their own docs.**
Quoted from `inciapi.com/docs/`: once the monthly quota is
exhausted, requests are rejected with `429` by default and only
continue against prepaid credit if a per-key opt-in toggle is explicitly
enabled — never automatic postpaid billing. Checked the account behind
this app's key directly: that toggle is off, and the prepaid balance is
$0.00 regardless, so there is nothing to charge even in the worst case.

**`cron.job` checked, both rows expected.**
`evict-expired-products` (`17 * * * *`, the licensed
INCI cache eviction from step 6/8) and `purge_rate_limits`
(`41 * * * *`, step 11's own rate-limiter cleanup, confirmed
against `supabase/migrations/0016_rate_limits.sql`). Nothing
unrecognised.

*Effort: Small, but none of it is code — browser work plus one
question to a vendor*

### Step 15 — Validate scoring against real products

**Status: Done · 19 Sep 2026**

*Tags: App-side · blocks on nothing · grows with every scoring change*

**Added 18 September 2026**, out of a conversation about
whether the scoring model is getting more sophisticated faster than anyone
is checking it is getting more *correct*. Step 13 split
`contactWeight` into harm and benefit; PR #119 graded exposure by
product type; both moved real numbers for real recommendations in the same
week. Nothing on this page, and nothing in the test suite, checks the result
against a product whose real-world reputation is already known. That is the
gap this step closes — not a new feature, a permanent check on the one this
page already built.

- **Pick 15–20 real products with an already-known verdict.**
  A widely trusted gentle moisturizer, a formula well known for clogging
  pores, one famous for causing irritation, one famous for being safe on
  sensitive skin. The internet has already reached consensus on these; the
  app either agrees with reality or it doesn't.
- **Assert a score band, not a score.** Write them as a
  permanent fixture — `__tests__/scoring-validation.test.ts` —
  with each product's real ingredient list and an expected
  `SCORE_BANDS` band, never an exact number. A range survives
  legitimate rule tuning; an exact number turns every future improvement into
  a failing test.
- **Cross-check once, by hand, before the fixture is trusted.**
  Run the same 15–20 products through an existing ingredient-scoring site
  (INCIDecoder, CosDNA, Skincarisma) and compare direction, not method — the
  goal is catching a rule that's backwards, not matching someone else's
  formula.
- **This is the regression net every later scoring change runs
  against** — step 12's move to server-side ranking, any future
  `contactWeight` work, a new rule in `lib/rules.ts` —
  the same role `catalogue-cache.test.ts` already plays for step 1.
  Without it, each of those changes is validated only by the person who wrote
  it noticing something looks off.
- **A qualitative pass, later and optional.** One
  skin-care-literate person — not necessarily a dermatologist — reading a
  sample of real results for face validity catches reasoning errors a score
  band can't. Costs nothing to schedule once the fixture set above exists.

**Done 19 September 2026 — not the way this step originally asked for**

`__tests__/scoring-validation.test.ts` and
`test-fixtures/scoring-products.ts` exist, carry 20 real,
sourced and dated product snapshots (DailyMed sunscreens, Open Beauty
Facts skincare — each with a public URL and a snapshot date), and are the
permanent regression net this step asked for. What they check against is
not what the bullets above describe.

**Absolute `SCORE_BANDS` assertions were tried and
rejected** — not skipped for lack of time. A band a product lands
in cannot distinguish "the model reasoned correctly" from "a neutral,
do-nothing formula also happens to land there," because `ANCHOR =
30` plus a 50/100 neutral fit already clears "fair" for almost
anything. The suite that shipped instead asserts two structurally
stronger properties: **14 directional invariants** (the same
real formula scores higher for the profile it is supposed to suit than
for a neutral one — e.g. EltaMD UV Restore's mineral filters against
sensitive skin), and **signal-isolation invariants** that go
further still — a synthetic control that neutralizes only the one named
ingredient a claim rests on (lactic acid, betaine salicylate, a
CosIng-function-only fallback with no named rule at all) and asserts the
score drops when that ingredient alone is removed, proving the model is
scoring the ingredient rather than something else correlated with it.

The fixture's own safety/verified/function metadata is pinned too —
`test-fixtures/scoring-dictionary.json`, a dated snapshot of
the live `ingredients` table — so a fixture's `caution`
/ `avoid` claims are cross-checked against reality rather than
hand-typed and left to drift. **The hand cross-check against a
public ingredient-scoring site**, and the later qualitative pass,
stay open as this step's own optional bullets already framed them —
nothing here claims either happened.

**Known disagreements are recorded, not hidden.** An earlier
draft used `it.failing` to track two known-wrong verdicts; that
was replaced because a green `it.failing` can't tell "the
intended failure" from "a new, different failure in the test setup" —
the same blind spot Codex flagged on PR #133. Both gaps are now prose in
`docs/scoring-validation-gaps.md` instead, and one of them —
benzoyl peroxide on dry, reactive skin — is exactly what became step 16.

**Done when** (met, met differently than written) a
real-product fixture file exists and fails when a scoring change breaks a
directional or signal-isolation invariant it encodes. Not when a scoring
change moves a score across a band edge — that was the original wording, and
it was the wrong bar: a band edge is exactly the kind of legitimate tuning
this net should survive, not fail on.

*Effort: Small to start, as scoped — grew into one test file, one
fixture file, one dictionary snapshot and one gaps doc, 655/655 passing ·
exceeded its own done-when rather than met it literally*

### Step 16 — Let irritation risk count against pore-led concerns

**Status: Done · 22 Sep 2026**

*Tags: App-side · scoring-algorithm change · needs its own before/after pass · checked 19 Sep — no Android/web dependency*

**Added 18 September 2026**, straight out of building step 15's
fixture — not a hypothesis, two things the cross-check actually caught by
running real formulas through `matchProduct` and reading the
arithmetic by hand.

- **Gap 1 — a single-active hydration formula under-scores.**
  Moved to [step 18](#step-18--score-sparse-hydration-formulas-fairly) on 19 September 2026, untouched: the
  fix is not obvious and nothing in this step affects it.
- **Gap 2 — the one worth fixing. Acne-prone/large-pores fit
  barely reacts to real irritation risk.** Benzoyl peroxide, tested
  against a dry, highly sensitive, acne-prone profile — the profile its own
  real-world reputation is a caution *for* — still scores
  **"good"** in this engine, only a few points off the same formula's
  "good" for an oily, tolerant profile. Two mechanisms compound:
  1. `concernFit` for `acne-prone`/`large-pores`
     is 65% `poreSafety`-weighted (`lib/matching.ts`,
     the pore-led concern branch) — and `poreSafety` defaults to
     100 whenever nothing in the formula is a name on
     `lib/pore-clogging.ts`'s list. Benzoyl peroxide isn't one, so
     the dominant 65% of the fit reads "clean" regardless of anything else
     the ingredient does.
  2. The irritation penalty that should catch the rest only accumulates
     for rules whose `category` is in `IRRITANT_CATEGORIES`
     (fragrance, alcohol, irritants) — benzoyl peroxide, retinol and salicylic
     acid are all filed under `"actives"`, so a rule that names
     them as hurting sensitive/dry skin never reaches the accumulator at all.
     A comment already sitting in `lib/matching.ts` flags this
     exact gap ("Out of scope for this PR: widening which categories feed the
     irritation accumulator is a separate, catalogue-wide behaviour
     change... belongs in its own PR with its own before/after evidence") —
     step 15 is what finally produced that evidence.Net effect: an ingredient can be a well-known irritant and still read as
  an excellent match for the exact skin type most likely to react badly to
  it, so long as it isn't also a pore-clogger.
- **Why this is its own step and not a quick fix.** Same
  reasoning as step 11 and step 13: widening
  `IRRITANT_CATEGORIES` to include `"actives"` rules
  that carry a `hurts.sensitive` or `hurts.skinTypes`
  match — or reweighting `poreSafety`'s 65% share for genuinely
  irritating-but-non-comedogenic actives — moves scores for every leave-on
  product containing salicylic acid, a retinoid or benzoyl peroxide, not
  just the two products step 15 happened to fixture. That needs a
  deliberate before/after pass across the catalogue, with the regression
  fixture from step 15 as the harness to run it against, not a table edit
  folded into this page.

**Corrected 19 September 2026 — the done-when named a test that no longer exists**

Step 15 closed by replacing its `it.failing` mechanism
entirely — see step 15's own note — so the specific case this bullet
pointed at, `it.failing("KNOWN GAP (step 16): benzoyl peroxide
should score worse on dry, reactive skin", ...)`, is gone from
`__tests__/scoring-validation.test.ts`. The gap it tracked is
real and unfixed; only the tracking mechanism changed. It now lives as
prose in `docs/scoring-validation-gaps.md`, under "Benzoyl
peroxide on dry, reactive skin."

Read the done-when below against that doc, not against a specific test
case: this step is done when the doc's benzoyl-peroxide entry is deleted
because the model was fixed, and a new directional or signal-isolation
invariant in `scoring-validation.test.ts` — in step 15's style,
not `it.failing` — asserts the tolerant/reactive gap that
doesn't exist today.

**Built 19 September 2026 — what shipped, and what it does not fix**

Open as **PR #142** from
`codex/step16-irritation-risk`, rebased on the current
`main` and not yet merged.
This page moves a step to done only after the merge, so the flag is
amber. Typecheck and 734 tests pass; the one failing suite
(`supabase/tests/rate_limit_e2e.test.ts`) needs Deno's
`jsr:` imports and was failing before this work.

**Against the four done-when items:**

- **Fix implemented — done.** A rule that declares a
  sensitive-skin harm now reaches the irritation penalty whatever its
  category (benzoyl peroxide, AHAs, retinoids, salicylic acid, vitamin C,
  tea tree). The `poreSafety` 65% weighting was left alone.
- **Directional invariant — done.** Four invariants in
  `scoring-validation.test.ts` fail on the previous code and pass
  now. On a synthetic leave-on serum, benzoyl peroxide for an oily, highly
  sensitive acne-prone profile went 77 to 64; dry and highly sensitive went
  72 to 59; a tolerant profile stayed at 84.
- **Catalogue-wide measurement — done.** On the 849 live
  products (820 scoreable): a tolerant profile moves nothing on unflagged
  products; for reactive profiles 157 products move, about 5 points on
  average, worst 22, 41 to 53 changing band per profile.
- **Gaps-doc entry removed — done.** The benzoyl peroxide
  entry is gone; the lactic-acid entry was replaced by a note on what is
  still open.

**Added beyond the step:** measuring the change showed
sunscreens dropping 14 to 17 points for a reason unrelated to the active.
DailyMed labels for OTC drugs list inactive ingredients A to Z
(21 CFR 201.66(c)(8), except drugs that are also cosmetics), and
`positionWeight` read that order as concentration, so
"ascorbic acid" was charged as a main ingredient because of its spelling.
`positionWeights()` in `lib/rules.ts` now detects an
A-to-Z tail of six or more and gives it one flat weight, the average of the
curve over that stretch. It detects 59 lists; in the 54 where it changes a weight (30 DailyMed, 24 Open Beauty
Facts, mostly fragrance-allergen tails that are legally unordered anyway). The ingredient page's "#5 of 44 on the label" note was
removed in the same PR, with its helper: jargon a user cannot act on, and it
contradicted the score for these lists.

**What is not done** is no longer part of this step. Every open
item — the size of the irritation charge, the gentle forms, the actives at the
front of an A-to-Z list, the fixture’s classifier type — moved to
[step 17](#step-17--calibrate-the-irritation-charge--and-close-step-16s-gaps), and gap 1 moved to
[step 18](#step-18--score-sparse-hydration-formulas-fairly) — so this step’s flag depends only on the merge.

**Done when** a chosen fix (widen
`IRRITANT_CATEGORIES`, reweight `poreSafety`'s share of
pore-led `concernFit`, or a third option found while doing the
work) is implemented, the step 15 fixture shows a real gap between benzoyl
peroxide's tolerant- and reactive-profile verdicts (as a directional
invariant, not the retired `it.failing` case above), the change's
catalogue-wide score movement has been measured before merging, and the
benzoyl-peroxide entry in `docs/scoring-validation-gaps.md` is
removed because it no longer describes a real disagreement.

*Effort: Medium — a scoring-algorithm change with catalogue-wide
impact, not a new file · blocked on nothing, blocks nothing · both gaps
traced to a specific line before this step existed, so there is no discovery
work left, only the design decision and the measurement*

### Step 17 — Calibrate the irritation charge — and close step 16’s gaps

**Status: Done · 22 Sep 2026**

*Tags: App-side · scoring-algorithm change · research-heavy · Codex · needs step 16 merged · PR #161 open*

**Added 19 September 2026**, by moving out of step 16 the irritation
work it did not implement. Gap 1 (sparse hydration) went to step 18. Step 16 made a declared sensitive-skin harm count as
irritation and stopped alphabetical drug labels being read as concentration
order. What it deliberately left, and why each piece is its own work:

**Corrected 22 September 2026.** The bullets below were written
while DailyMed products were still in the catalogue. They are not any more:
migration 0022 refuses any product without a barcode, DailyMed labels have
none, the importer (`import:dailymed`) is retired and its rows were
pruned. The live catalogue is 616 products, none from DailyMed. So **no
source records a label’s printed strength**: Open Beauty Facts has no
such field, and the label photo captures the ingredient list, not the Drug
Facts box. PR #161 first built strength-based scoring on the retired importer,
then removed it for exactly that reason; using printed strengths is now its own
issue, **#174**, and not part of this step. Read the third and fifth
bullets with that in mind.

- **The size of the charge.** The irritation penalty
  saturates, so a low-weight active still costs about half of a top-of-list
  one (measured once, 19 September, on a 43-ingredient serum with the active
  inserted, for a highly sensitive `dullness` profile: salicylic
  acid 16.1 at position 3 against 8.7 at the floor, ascorbic acid 14.2
  against 7.3, retinol 16.9 against 9.3). Kiss My Face Purely Mineral’s
  ascorbic acid still costs 9.5 points at a flat weight of 0.42. The
  constants (`IRRITATION_SATURATION` 14, the 34-point ceiling, the
  1.6 sensitivity multiplier) have no evidence behind them that anyone has
  found, and changing them moves every product’s score.
- **What the research does and does not give.** Irritation
  is dose-dependent for every active looked at:
  [retinol](https://pmc.ncbi.nlm.nih.gov/articles/PMC13513334/)
  (28.6% mild redness at 0.247%), benzoyl peroxide (equal efficacy from 2.5%
  to 10%, more redness as the strength rises),
  [salicylic acid](https://pubmed.ncbi.nlm.nih.gov/14617432/)
  (safe to 2% when formulated to avoid irritation; not enough data to set a
  no-irritation limit) and
  [AHAs](https://www.cir-safety.org/sites/default/files/ahas.pdf)
  (10% or less at pH 3.5 or higher). It gives no formula, nothing on trace
  amounts in a finished product on sensitive skin, and thresholds that differ
  by ingredient: retinol irritates around 0.1% and is capped at 0.3% on the
  face, so a blanket “the tail is trace” discount would hide a real risk. The
  list-order rule itself is
  [EU 1223/2009 Art. 19(1)(g)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009R1223):
  below 1% the order is free.
- **The likeliest real evidence is already in our own data.**
  *No longer true (22 September 2026).* DailyMed labels do state each
  active’s strength
  ([21 CFR 201.66(c)(2)](https://www.law.cornell.edu/cfr/text/21/201.66),
  “the proportion … of each active ingredient”), but DailyMed is
  no longer a catalogue source, so that evidence is not in our data. Comparing a
  stated strength against the thresholds above would still be per-active and
  sourced, but it needs a source that captures the Drug Facts box first
  (issue #174).
- **Gentle forms are charged like the strong ones.** The
  vitamin C rule’s own text says “the acidic forms can sting”, yet it also
  covers ascorbyl glucoside, 3-O-ethyl ascorbic acid and magnesium ascorbyl
  phosphate; the retinoid rule covers retinyl palmitate at retinol’s weight.
  That harm was inert before step 16, so the over-charge is new. In the live
  catalogue: 13 products with ascorbyl glucoside, 7 with 3-O-ethyl ascorbic
  acid, 4 with magnesium ascorbyl phosphate, 14 with retinyl palmitate. The
  fix is a rule split (or a lower weight) per ingredient, each with a
  source.
- **The A-to-Z run can absorb the actives at the front.**
  `positionWeights` protects only position 0, so on a multi-active
  drug label whose actives sort before the first inactive, those actives get
  the flat weight instead of a high one, which understates their harm. 22 of
  the 59 detected lists start their run at position 4 or earlier. No product
  whose verdict changes has been found, so it is low. Two routes: skip the
  leading run of UV-filter ingredients, which the dictionary already tags
  (code only, untried, and it would not cover acne treatments such as benzoyl
  peroxide), or have the importer record how many leading entries are actives
  (a schema change and a DailyMed re-import against the live catalogue).
  *Re-measured 22 September 2026 on the live catalogue (616 products, no
  DailyMed):* 27 lists have an A-to-Z run, 4 start at position 4 or
  earlier, and in 1 an active sits inside the run (Avène Cleanance, zinc
  gluconate). The 22 of 59 above were DailyMed lists, all gone. The
  DailyMed re-import route no longer exists; the gap is accepted at that count.
- **The benzoyl-peroxide fixture is typed `unknown`.**
  No catalogue product contains benzoyl peroxide, so step 16’s fixture is a
  real DailyMed gel (`950edb4e-fbba-41e3-9ec5-973806e555e7`) that
  the classifier files as `unknown`, discounting its benefit to
  0.25. Its own final score for a reactive profile was therefore not
  measured; the score figures in step 16 come from a synthetic serum. Fix the
  classifier for OTC acne-treatment labels, refresh the fixture and add a
  direct score comparison. Recorded in
  `docs/scoring-validation-gaps.md`.

**Done when** the irritation charge has a stated,
sourced basis and a measured catalogue-wide before/after; the gentle forms are
split from the strong ones with a source each; a leading active is no longer
averaged into an A-to-Z run or the gap is documented as accepted with a count;
and the benzoyl-peroxide fixture is scored under a leave-on type and compared
directly. *(Corrected 22 September 2026: the “per-active strengths where
a label gives them” clause is dropped, because no live source records a
strength. That work is issue #174.)*

*Effort: Large — research and calibration, not a tweak · needs step
16 merged · handed to Codex for the evidence work · each piece can ship
separately*

**Decided 22 September 2026.** The straight-line
penalty PR #161 introduced is kept, documented as an unsourced model choice:
no published dose-response figure gives a formula, so the sourced-basis
criterion is met by saying so plainly, and it is reopened if a labelled
dataset or published figure appears. Measured on the live catalogue (616
products, six profiles, 3,648 scores): 1,930 scores change, 359 verdicts change
band (341 up, 18 down), almost all on sensitive profiles. Mild irritants cost
fewer points; strong ones (retinol, benzoyl peroxide) cost more on highly
sensitive skin. Recorded in `docs/scoring-validation-gaps.md`,
the PR and issue #136. The flag stays not-done until PR #161 merges.

### Step 18 — Score sparse hydration formulas fairly

**Status: Done · 22 Sep 2026**

*Tags: App-side · scoring-algorithm change · needs evidence first*

**Added 19 September 2026**, split from step 17. It was step 16’s
gap 1, moved out untouched. It has nothing to do with irritation, so it does
not wait on that work and it does not block it.

- **Gap 1 — a single-active hydration formula under-scores.**
  COSRX Advanced Snail 96 Mucin Power Essence, tested for a dehydrated profile,
  lands “fair” rather than the “good”/“excellent” its reputation suggests. Of its
  five ingredients only sodium hyaluronate carries a rule that speaks to
  “dehydrated” (weight 8), and `CONCERN_SATURATION.dehydrated` is
  16.6, the 75th-percentile figure measured across the catalogue, so one
  ingredient saturates to roughly 30% of full strength.
- **Not obviously wrong.** The constant is measured, and a
  formula leaning on one well-evidenced humectant is genuinely thinner
  evidence. Lowering the constant would inflate every dehydrated-concern score
  catalogue-wide, so the fix is better ingredient and function coverage or a
  recalibration against a labelled dataset, not a special case for a brand.
  Recorded in `docs/scoring-validation-gaps.md`.

**Done when** the gap is either fixed with evidence
(wider ingredient or function coverage, or a recalibration measured against a
labelled dataset, with a catalogue-wide before/after) or closed as correct,
with the reason written down.

*Effort: Medium to large — the evidence is the work, the code is
small · independent of step 17*

### Step 19 — Close the last 3.6% of unmatched ingredient names

**Status: Done · 22 Sep 2026**

*Tags: ingredient dictionary · needs data or a decision · issue #101 follow-up · PR #159 open*

**Added 19 September 2026**, so that issue #101 can close and this
work can be picked up on its own. #101 covered everything that reading the
text better can fix: headings in any language, other names and spellings, glued
doses, junk names blocked before they are saved, and the importers and the label
scanner reading a list the same way. What is left cannot be fixed by parsing,
so it does not belong in that issue.

- **What the 3.6% is.** The share of ingredient names on real
  products that still do not match a checked ingredient in the dictionary.
  Measured on about 700 live Open Beauty Facts products: names matching exactly
  went from 92.0% to 96.2%, and unmatched ones from 7.6% to 3.6%, with 2,964 names
  added from the CosIng-derived list. The app does not break on the rest. It shows
  them as unknown and lowers its confidence in the result.
- **Real names that no public list has.** For example
  `arnebia nobilis root extract`. The CosIng list and the Open Beauty
  Facts taxonomy do not have them, so there is nothing to match them to. Someone
  has to check each one and add it by hand.
- **Names that could mean two things.** `iron oxides`
  could be several different colour codes. These were left unmapped on purpose:
  a wrong guess puts a wrong safety rating on a product, which is worse than
  showing the name as unknown.
- **Garbled scan text.** For example `retisla ratiss ma
  ol`. The source text is corrupted and nobody can tell what the original
  word was. Matching typos to the nearest known name would risk wrong matches, so
  the recommendation is not to.
- **Not ingredients at all.** Addresses, marketing lines and
  packaging text. These are correctly skipped and need no work.
- **The unchecked stubs.** A stub is a name a scan or import met
  that the dictionary did not know, saved as unverified. The cleanup script
  (`npm run clean:stubs`) repoints the spelling variants to the real
  name and leaves the rest. About 815 stubs remain after it, and they could be
  real ingredients.

**Decisions this step needs from a person:** whether to promote
stubs that appear on three or more products (it fills gaps, but changes what
“verified” means, from “on a trusted list” to “seen a lot”);
which names are worth adding by hand; and whether to look for a further source
of ingredient names.

**Done when** each remaining unmatched name is either in
the dictionary from a checked source, deliberately left unmapped with the reason
written down, or confirmed as not an ingredient, and the promote-or-not decision
on the stubs is recorded.

*Effort: Small to medium — the decisions and the data are the work,
not the code · blocks on nothing · not urgent, since unknown names already lower
confidence rather than block an answer*

**Not a step, an ongoing routine:** EU CosIng has no modified-since
API and hands out its CSV only through a session-bound download. A human checks
quarterly for a fresher export. That feeds the ingredient dictionary rather than
the product catalogue, so it sits outside the sequence.

## Three kinds of data, three different clocks

*Reference · why the cadences in steps 8 and 9 are what they are*

A formula in *our* database only changes when *we* rewrite it. Open
Beauty Facts learning that COSRX reformulated something changes nothing here
until we fetch it — so the refresh rhythm should match **our write
cadence**, not the world's rate of change.

| What | Rhythm | Cadence | Why that number |
| --- | --- | --- | --- |
| New products |  | Nightly | Cheap once it's incremental — we ask only for what changed since last night, which is a handful of rows, not 74,000. |
| Existing formulas |  | Monthly | Brands reformulate roughly once every year or two per product, and the upstream source finds out later still. Monthly already outpaces reality. |
| Ingredient dictionary |  | Quarterly | It is regulation. The EU amends the CosIng annexes a few times a year and the OBF taxonomy that embeds it moves slower. |
| Licensed cache rows |  | Hourly | **Already built.** `pg_cron` runs `evict-expired-products` at `17 * * * *`. That is a licence obligation, not a performance choice — leave it alone. |

## Nobody will tell us when something changes

*Reference · the source-by-source detail behind steps 4, 9 and 10*

There are no webhooks in this space. Not from Open Beauty Facts, not from the
Korean government, not from anyone. Every source here is pull, not push.

That sounds worse than it is. The distinction that matters is not push versus
pull, it's **full versus incremental** — and most of these sources
do support asking "what changed since I last looked", which is what makes a
nightly poll almost free, and what step 3's bookmark exists to remember.

| Source | Licence | Change detection | Step |
| --- | --- | --- | --- |
| Open Beauty Facts — Already our main source — the bulk of 153 products | ODbL — ours to keep | Every product carries `last_modified_t`, and the API filters on it. A full database dump is published daily as one compressed file. — Poll incrementally each night; bootstrap from the dump. | Step 4 |
| Korea MFDS — data.go.kr — ingredient names only (#201); no product barcodes | Open data — free API key | Dated file releases on a fixed schedule rather than a live feed — check monthly and diff against what we hold. — Needs Hangul → INCI mapping, and a `product_source` enum value. | Step 9 |
| US DailyMed — NIH — retired 22 Sep: no barcodes | Public domain — no restrictions | Genuinely incremental: publishes daily and weekly update packages alongside the full download. — Sunscreens only, but authoritative ones. | Step 10 |
| EU CosIng — Feeds the ingredient dictionary | CC BY 4.0 — ours to keep | No modified-since API, and the live site hands out the CSV only through a session-bound download — a known annoyance. — Quarterly manual check. | Manual |
| INCI API — Scanner cascade fallback | Proprietary — cache with a deadline | Their terms forbid bulk downloading and permit caching only per the returned headers — which is exactly why `expires_at` and the hourly eviction job exist. — Works today. Do not widen its role. | Leave alone |
| Our own OCR — Already live — 24 products arrived this way | Ours — user-contributed | Not a poll at all — a write path. Every photographed label is saved against its barcode, so the next person to scan it gets an instant answer. — Grows in the exact shape of what users actually buy. — **Changing, 22 Sep:** [#214](https://github.com/sabrahermassi/skincare-recommendation/issues/214) makes the label photo the main scan path, and a read will produce a verdict with no product name and no barcode. The save therefore becomes an optional follow-up rather than something every read performs — this channel's growth rate becomes a function of how appealing that follow-up is, not of scan volume. Decided, not yet built. | Compounds |
| INCIDecoder, CosDNA, SkinSort, Hwahae, Olive Young | Proprietary — scraping prohibited | Rich data, all of it off limits — their terms forbid automated collection, and retailer pages break constantly besides. — Not worth the legal exposure for a consumer app. | Avoid |

## The gates that exist today

*Reference · what the importer already rejects*

Step 5 adds to this list; it does not start it. A row already has to have a
name, an ingredients list, and at least two parsable ingredients. It must show
positive evidence of being a cosmetic rather than merely failing to look like
food. Its type is guessed from category tags and title across several languages
— because "Schuimende Reinigingsgel" and "nettoyant moussant" are both
cleansers, and typing them as serums quietly changed how harshly their
ingredients were scored.

About a third of what Open Beauty Facts returns is thrown away by these gates
already. That is the expected rate, not a sign something is broken — and it is
why step 5 matters: a third of a much larger number is a much larger number.

## Things worth answering before they become problems

*Not yet decided*

Open questions rather than recommendations — each cheap to settle now and
expensive to discover later.

### Should the cache ever evict? — parked, with a reason

**Step 6b was built around an LRU, and it was never built.** The
plan called for bounding both layers — a maximum product count in memory,
evicting least-recently-used, and a disk byte budget that evicts until the
payload fits rather than refusing the write. It is struck in step 6 above, and
it is here rather than deleted because the reasoning is worth meeting again
rather than rediscovering.

**Two things killed it.** The measurement said the mirror fits —
1,640 bytes per product against a 32MB iOS budget and a 3MB web quota — so on
the two platforms with room, eviction would have been inventing work. And on
Android, the one platform without room, eviction is not merely unnecessary but
*wrong*: Browse ranks every product against every other, so a product
evicted from the cache cannot be ranked against the ones still in it. An LRU
would quietly change the answer the app gives depending on what the user
happened to look at recently — a wrong ranking that looks exactly like a right
one. 6b-4's chunked, platform-aware budget went in instead: it refuses a write
it cannot make, and keeps the previous copy whole when it does.

**What would reopen it.** Not catalogue growth on its own —
growth past the ceiling is step 7's ceiling raise and then step 12. The thing
that changes the answer is *where scoring runs*. The moment ranking
moves to the server, the objection above evaporates, because the completeness
an LRU would break is no longer the device's job. So this question is really
step 12's to answer, and answering it early means answering it against the
wrong architecture. **The one thing worth deciding now** is
smaller and separable: the memory layer's `byId` and
`byType` indexes would keep evicted products alive in the heap
regardless of any policy, so whoever builds eviction has to invalidate them —
a detail the original plan caught and which is easy to lose now that the
bullet it lived in is struck.

### Does the app still work on a plane?

Step 1 gave the app a 24h disk cache, so a recently-opened catalogue now
survives losing the network — but nobody designed that, it fell out of
caching. Worth deciding whether offline is a feature this app supports on
purpose (in which case the TTL, the error states and the saved shelf all need
a considered answer) or an accident that happens to work, because the two get
maintained very differently.

### What should a scan without a barcode leave behind? — answered: nothing

**Answered 20 September 2026, and not the way step 5b first shipped
it.** Commit `5df2173` landed on *answer and discard*:
a product row exists only with a name, a barcode and an ingredient list, and
migration `0022` refuses anything less. The person photographing a
label still gets their full verdict — that never depended on a row — but
nothing is written until they supply the other two, on `/add-product`.
The accrual machinery step 5b describes (`resolve-scan`, the 24h
`expires_at` grace window, `app/attach-barcode.tsx`) was
removed in the same commit. The three paragraphs below are the reasoning as it
stood before that, kept because the trade is worth meeting again if the
contribution rate ever turns out to matter more than catalogue cleanliness —
which is exactly what [#214](https://github.com/sabrahermassi/skincare-recommendation/issues/214)
puts back in play.

One decision settles three loose ends at once, and it is a product question
rather than a technical one. Someone photographs an ingredient list with no
barcode. They get a complete, correct verdict either way — scoring reads the
formula, not the name. The question is what the app keeps.

**Answer and discard** leaves the catalogue clean and wastes a
label somebody already photographed. **Ask for the barcode after
showing the verdict** — "scan the code so the next person gets this
instantly" — turns a throwaway into a real contribution, at the cost of a
prompt and a decision about what happens when it is skipped.
**Keep it hidden** is today's behaviour and is the one option
that quietly gets worse.

Whichever way it goes, it also answers whether a just-scanned product should
appear in that person's Browse list (it does not today, and that is a
targeted cache insert, not a polling problem), and whether
`scan-label.tsx` should start sending the `name` and
`brand` the Edge Function already accepts. Step 5 carries the
mechanics.

### Should a list already on screen update itself? — half answered

The original form of this: freshness is checked once per launch, and if that
check finds new products while Browse is already mounted, the list does not
repaint — the tab stays mounted, so its effect never runs again.

**Half of it turned out not to be hypothetical.** The case that
bit was not an import landing mid-session, it was the user's own scan: they
photograph a label, the row enters the cache, and the Browse tab they return
to still shows the list without it. So Browse now *re-reads the cache when
the tab regains focus* — synchronous, no network, and it hands back the
same array instance when nothing changed, so an ordinary tab switch renders
nothing at all. That covers every case where the user leaves the screen and
comes back, which is all of them today.

**What is still parked is the subscription** — the cache
notifying the screens that hold its arrays, which is the shape the store
already uses for the profile and the saved shelf, and what React Query and
SWR do. It is the more correct answer and a great deal more machinery than one
focus handler. Worth doing if a third screen starts holding its own catalogue
copy, if something needs to update while *visible* rather than on
return (a background refresh landing, a push), or if the focus re-read starts
being wrong rather than merely late. Recorded in
`docs/decisions.md` so the next person meets the decision rather
than the symptom.

### Is AsyncStorage fast enough to hold the cache? — answered: yes

Asked before step 1 shipped, on the theory that AsyncStorage deserialises a
value whole on read and 946 KB might hurt — a worst case step 2 has since
more than halved. Measured on an iPhone once the
cache existed: **120ms to read, 11ms to parse.** Fast enough
that moving the read behind the splash screen removed it from view
entirely.

So the MMKV question is closed for now, and closed cheaply — no EAS setup,
no custom development build, and Expo Go still works, which is how this
project is tested on a phone. Reopen it only if the catalogue grows enough
to change that reading: steps 7 and 9 are the ones that would do it, and
step 2 pushes in the opposite direction by shrinking the payload.

### What happens to the 24 user-scanned products?

Those rows came from real people photographing real boxes, and they are
currently indistinguishable from imported data in the read path. Two things to
settle: whether a formula read by one user's camera should be trusted for
everyone else without review, and what the retention story is if someone asks
for their contribution to be removed.

### Does the scoring engine still feel instant at 5,000 products? — half answered

Every product in Browse was scored on the device before it rendered, at eight
call sites, memoised per component only. At 153 that is invisible. At the
scale steps 7 and 9 are aiming for it is not, and neither caching nor
deduplication helps — the work happens after the data arrives.

**Two of the three answers are now in.** 6b-2 shipped the scoring
cache, though keyed on the product object and the profile by identity rather
than on an id and a version counter — simpler, exact, and it needs no eviction
of its own. 6b-3 took the pass off the render path, so Browse scores 40 rows
rather than the whole catalogue before it can paint.

**What is still unanswered is the thing the question actually asked:**
nobody has run this at 5,000 products on a phone. Step 6 got its own real-device
run on 18 September (issue #115, closed) — but that confirmed the chunking
mechanism at today's ~600 products, not scoring speed at 5,000. Measure that
right after step 7 lifts the cap, when the catalogue size first changes
materially — the same moment the Android storage ceiling bites for real, at
volume rather than in principle.

### Who is watching the nightly job?

A scheduled import that silently stops is worse than no import, because the
catalogue looks fine and simply stops growing. Step 3's bookmark table makes
this trivial to check — if the last successful run is older than two days,
something should say so out loud. Decide where "out loud" is before step 8,
not after.

### Does the attribution survive the merge?

Attribution is stored per row, deliberately, because the obligation travels
with the row and not with the table. Once several sources contribute to one
product — step 5's cross-source identity work, deferred to step 9 — it needs
to stay true: a row assembled from an ODbL formula and a public-domain label
carries both credits, and neither can be dropped for tidiness.

Measured figures were read directly from the live Supabase catalogue on 8 September
2026. Product counts, payload sizes and query timings are real; cadences, cache
durations and the 400 KB target in step 2 are recommendations.

Revised 13 September and reordered 14 September 2026, each time after reading the
data layer, the migrations and the import script rather than the previous draft.
Deduplication moved from last place to step 2; the dependency story was rewritten
from a single chain to the blocking relationships above; and the claim that
`product_source` holds three values was corrected — it holds five, and
`mfds` is still not one of them.

Checked again on 14 September against the committed implementation rather than
the draft, which is the only reading that catches a page drifting from its code.
It found three: the test count, the number of cached fetchers, and a privacy
behaviour that shipped without being written down here. The product screen's new
formula-age notice also dated two paragraphs that said no such thing existed.
Corrected in place rather than appended, so the page stays readable as one
document rather than a changelog.

Checked a third time on 14 September against two external reviews — one of
PR #89, one of the whole repository — rather than against the code alone. Review
is the reading that catches what neither the page nor its author thought to look
at: it found five defects in step 1's cache, and that `fetched_at`,
which this page has described as the freshness key since the first draft, was
never written after insert at all. Step 11 exists because one of its four larger
findings had no home on this page, and the absence was the finding.

Checked a fourth time on 17 September, against the merged 6b code rather than
against the four pull requests' own descriptions — which is a different reading
again, because a PR describes what it set out to do. It found that the piece this
step was named for was never built, that the piece marked done was half done, and
that one bullet in a nearly-finished step was silently blocking itself. Step 12
exists because that bullet needed to stop being a bullet. The LRU is parked as a
question rather than deleted, on the same principle the rest of this page
follows: a decision someone can meet and disagree with is worth more than a line
that quietly disappeared.

Step 2's figures are measured, not projected: both payload shapes were
requested from the live catalogue on 15 September and their responses weighed.
That is the only reading that could have falsified the step — a diff can show
the query got smaller without showing whether it got smaller enough, and the
400 KB target was the part that had to be proven rather than argued.

Step 11 is the one step this page got to mark done and then had to admit was
not working. It shipped, deployed, passed every test, and limited nobody for two
days — the key it counted by changed on every request. That is not a gap in the
reasoning above, which named the key as the hard part; it is the difference
between naming a risk and measuring one. The correction was made against a probe
on a live deployment rather than a second round of inference, and the end-to-end
test that now guards it (PR #123) exists because the unit and SQL tests both
stayed green throughout. Step 14 was split out in the same pass, on the same
principle the LRU was: work left inside a step marked done is work nobody sees
again.

Checked a fifth time on 18 September, against a second Codex review round on
PR #119 rather than against this page. It found two findings with no home here —
the same situation step 11 was in — and one that did: a bare classifier match
catching more than the type it names, which is the same failure step 5 already
fixed once for a different pair of words. Step 13 exists for the two that needed
one; the third was small enough to fix on the PR itself and needed no line here.

Checked a sixth time on 18 September, against six rounds of Codex and CodeRabbit
review on PR #122 rather than against a single pass. The pattern repeating across
rounds is worth naming: nearly every finding was a variant of the same root cause
migration 0008 was written to close — a write split across two non-transactional
statements, where the first can durably succeed while the second is silently
lost. It surfaced in the RPC (formula and change-timestamp, two calls), in the
RPC's own change-detection (an existence check standing in for a null-aggregate
check), and in the request-counting that bounds the run itself (a retry counted
as the call, not as the request it actually made). One finding was declined
rather than fixed, on the same standard the rest of this page holds itself to:
not "this could be more robust" but "this diverges from a precedent this
codebase already chose on purpose." Step 8 is marked done on the strength of a
real production run, not the merge — the one thing still owed is the schedule's
own first unattended firing, which needs nothing further from anyone.

Checked a seventh time on 19 September, against the merged code rather than
against this page's own "still open" flag — the same correction step 6b and
step 10 needed. PR #130 had shipped step 13's cleanser split the day before this
check, and this page had not caught up: a targeted question ("is step 13 done?")
is what surfaced the gap, not a scheduled re-read. The done-when was met in full
once both halves were confirmed directly in the code — `data/types.ts`,
`lib/rules.ts` and both `guessType` copies — rather than
taken on the PR title's word alone.

Checked an eighth time on 22 September, not against the code but against a product
decision taken elsewhere — which is a reading this page had not done before.
[#214](https://github.com/sabrahermassi/skincare-recommendation/issues/214)
inverts the scan flow: the ingredient-list photo becomes the main path and the
barcode the shortcut, because ~851 catalogue products means most real barcodes
miss. Only one line on this page turns out to depend on that, and it is in the
sources table rather than in any step: "our own OCR" is described as a write path
every read performs, and under #214 the write becomes optional. Worth naming
because the channel is marked *Compounds*, and an optional write compounds
more slowly than a mandatory one — that is a forecast this page makes, and the
forecast's premise just moved. Steps 7, 9 and 12 are unaffected and now carry
their own issues (#180, #181, #182).

Checked a ninth time on 22 September, against the tree rather than against this
page — prompted by one detail not matching: this page named a screen,
`app/attach-barcode.tsx`, that does not exist. It did exist, and the
reason it is gone is larger than a rename. Commit `5df2173`
(20 September) reversed step 5b's row-accrual decision outright: no barcode-less
rows, no grace window, no `resolve-scan`, a product row valid only with
a name, a barcode and an ingredient list. Step 5b and the matching open question
both described the superseded design as current, four days after it stopped being
so. Corrected in place, with the old reasoning kept rather than deleted, because
[#214](https://github.com/sabrahermassi/skincare-recommendation/issues/214)
— verdict first, contribution optional — reopens the same trade. Worth naming how
this was caught: a single wrong filename, checked instead of waved past.
