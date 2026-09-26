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
and it drifted between them. `COMEDOGENIC_FLAG_THRESHOLD` /
`COMEDOGENIC_SEVERE_THRESHOLD` in `lib/safety.ts` exist so there's exactly
one place that number can be wrong.

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
`product-lookup`. It does not discover new functions — see `CLAUDE.md` for
the checklist that has to be followed by hand when one is added.

**`SUPABASE_ACCESS_TOKEN` is account-wide, and that is accepted.** Supabase
personal access tokens cannot be scoped to a project, so the token in GitHub
secrets can also reach production. This was weighed and taken: the
alternative is no automated function deploys at all. `staging-migrate.yml`'s
header rejects the same token for *migrations* precisely because a
connection string can be scoped to one project and a token cannot — that
reasoning still stands for migrations. **Do not re-flag this as a finding.**
