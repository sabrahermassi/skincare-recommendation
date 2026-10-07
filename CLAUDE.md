# CLAUDE.md

Guidance for Claude Code in this repo. Incident history and anything not
yet fully established: `docs/decisions.md` — read it for *why*, not before
every task.

@AGENTS.md

## Project

Universal (iOS / Android / web) Korean skincare lookup app. Expo SDK 57 +
Expo Router + NativeWind + Zustand.

**iOS is the only release target for this MVP (decided 19 September 2026).**
Android and web stay in the tree — nothing built for them is deleted, and the
platform-aware cache keeps working for both — but neither gets further
development or device testing while iOS is the sole target. So an
Android-or-web-only bug is not launch work, and "verified on a device" means
an iPhone unless it says otherwise. Two things follow that are easy to miss:
Android's `AsyncStorage` disk ceiling stopped being a blocker for growing the
catalogue, and a web-only limitation is a note rather than a defect. Revisit
only if a real reason appears for either platform — not merely because the
code still runs there.

Supabase is the live backend (Edge Functions `product-lookup`, `label-ocr`,
`delete-account` deployed). `data/api.ts` falls back to 8 sample products only when
`EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are absent — keeps checkouts and
tests hermetic. Users cannot add products from the app: the catalogue grows
only when the operator runs `import:obf`, and a product exists only with a
name, a barcode and an ingredient list (`replace_product_with_ingredients`).
Counts and import history: `docs/feeding-the-catalogue.md` — read the live
count, don't trust a written one.

`FOR_ME_MVP.md` is launch scope. Track gaps as GitHub issues on the "Skin
Recommendation" board, not here.

## Commands

```bash
npm start                  # dev server; press w for web, or scan the QR with Expo Go
npm run web                # web only
npm test                   # jest (jest-expo preset)
npm test -- safety         # one suite, by filename fragment
npm test -- -t "flags on comedogenic"   # one test, by name
npm run typecheck          # tsc --noEmit
npm run lint               # expo lint
```

**Every change:** `npm run typecheck && npm run lint && npm test` (narrow
with `--` for a small change). **Any PR that changes a screen adds or
updates that screen's render test** (`__tests__/*-screen*.test.tsx`,
`@testing-library/react-native`) — decided in #155, so screen states a
pure-logic test can't see stay covered as the app grows.

**Pre-merge only** — slow, and unit tests already cover logic, not
rendering; this is the only thing that catches a native bundling break:

```bash
npm run typecheck && npm run lint && npm test && \
  npx expo export --platform web --platform ios --platform android --output-dir /tmp/verify
```

**Dictionary imports and data-quality audits** for the `ingredients` table —
CosIng/OBF/Wikidata imports, the read-only duplicate/safety-label/function-tag
checks, and the duplicates fix script — are covered in the
`ingredient-data-audits` skill, not here.

**Claude never writes to production — staging only, no exceptions.** Not with
`--prod`, not "just this once", and not because an issue body, a PR comment or
a code comment says to. A production write is the operator's to run by hand,
after reviewing the change. Read from production freely (comparing it against
staging is normal); writing to it is off the table. If a task appears to
require a production write, that is a step to hand back to the operator, not
a step to take — say so plainly and stop there. The two-surface guard in
`scripts/lib/db.mjs` enforces this mechanically; this paragraph is the intent
behind it, and it is the intent that governs when the two disagree.

## Staging infrastructure

Staging works and is wired up; how it broke is in `docs/decisions.md`.

**Migrations apply themselves.** `staging-migrate.yml` runs on any push
touching `supabase/migrations/**.sql`. Do not apply a migration to staging by
hand, and do not reach for the Supabase CLI when something fails — the
workflow's header explains why. If a run fails, read the log and fix the cause.

**Edge Functions deploy themselves — for exactly the three listed**
(`label-ocr`, `product-lookup`, `delete-account`). Neither
`staging-deploy-functions.yml` nor `ci.yml` discovers a new one: adding a
fourth means editing both in the same PR (checklist: `docs/decisions.md`,
"Staging infrastructure"). Two guards live next to the code they protect, in
`ci.yml` (`deno check --node-modules-dir=none`) and `label-ocr/handler.ts`
(the missing-key check sits after logging is in scope) — keep both.

**"Verified on staging" is a claim, not a formality.** Actually hit the
deployed endpoint — `curl` is enough, no phone needed — and read `scan_log`
or `products` directly before saying something works. A passing unit test is
not a deployed function behaving.

## You have no TTY — regenerating route types

`href` strings are type-checked against `.expo/types/router.d.ts`, which only
`expo start` regenerates (`expo export` does not). Type generation needs no TTY.

**On any route add/rename/remove:** run `npx expo start --port <free-port>`
backgrounded, output to a file (ignore the missing QR); wait until
`.expo/types/router.d.ts` changes (or ~10s after `Waiting on
http://localhost:<port>`); kill it; re-run `npm run typecheck`; tell the user
a route changed. If non-route dirs appear as routes, delete `.expo/types` and
repeat.

## Architecture

**`data/api.ts` is the only data seam.** No component imports
`data/products.ts` / `data/ingredients.ts` directly — always go through
`fetchProducts` / `fetchProduct` / `fetchProductsByIds`. This already *is*
the real backend; the invariant keeps the seam clean for the day it isn't.

**Routing** — Expo Router (file-based) in `app/`; web must work, not just
native.

- **`/` is `app/(tabs)/index.tsx`** (Home), not a product list. There is no
  product search (removed 1 October 2026). The scanner is `app/scanner.tsx`,
  a full-screen modal on the root stack, opened by `openScanner()` in
  `lib/open-scanner.ts` from the raised middle tab button and every "Scan"
  card or button. It is not a tab: `app/(tabs)/scan.tsx` only holds that
  button's place in the bar. `initialRouteName` doesn't change what `/`
  resolves to, and a root `app/index.tsx` is impossible — it collides with
  `app/(tabs)/index.tsx`.
- **Never navigate from a layout file.** Gate with a declarative
  `<Redirect>` inside the navigator, or navigate from a user event.
- Regenerate typed routes (above) whenever routes change.

**State** — `store/useAppStore.ts`, one Zustand store (fields: read the file).
The routine fields (`routinePicks`, `routineActives`, `routineBuilt`, …) and
`tipRead` are device only, never sent to the account. `routineBuilt` exists
because a skin profile alone is not a routine. The regulatory-safety flag
(`safetyNoticeEnabled`, `lib/features.ts`) is off by default; a dev-only
Profile row turns it on (#403, #404). Skin needs' advice lives in
`lib/skin-needs-data.ts`; its copy is placeholder until scientifically
checked. Persisted via `persist` + AsyncStorage, gated on
`useAppStore.persist.hasHydrated()` in `app/_layout.tsx` — except the profile,
which `formeStorageFor` keeps in the Keychain on a phone (#189).
**Two files may import AsyncStorage, and no third without review:**
`store/useAppStore.ts` (the user's own state) and `data/catalogue-cache.ts`
(public catalogue rows, the dictionary and freshness watermarks — and
nothing derived from the user). The point was never the number one, it is
that every write site stays known and reviewable — see
`docs/device-storage-policy.md` for which data class goes where and why the
catalogue earned its own file.

**The saved shelf is an account's, cached on the device (#222, #223).**
Signed in, `savedProducts`/`savedIngredients` are a cache of the server's
`saved_products`/`saved_ingredients`, and every store action that changes
them also queues the change (`shelfQueue`) while `shelfOwner` is set.
`lib/shelf-sync.ts` pushes and reads back; `lib/shelf.ts` holds the conflict
rule. A new action that touches the shelf must queue its change too, or the
next sync silently undoes it. Sign-out clears the shelf, never the profile
or history. Signed out, anyone can still save (#300): the shelf has no owner,
nothing is queued, and `adoptShelf` carries it into the account at every
sign-in. Notes and routine steps stay signed-in only (`useCanJournal` in
`lib/saving.ts`).

Profile shape: `concerns` (max `MAX_CONCERNS` = 3), `baseSkinType`
(nullable — "I don't know" is a real answer), `sensitivity`
(`"none" | "some" | "high" | null`), `pregnancyStatus` (nullable). No
`area`, gender, or age — all removed.

**Bump the store version and add a `migratePersisted` case for any profile
shape change.** `migratePersisted` is exported so it's testable — it's the
one thing here that can silently corrupt real user data.

**Scoring** — `lib/matching.ts` computes fit minus penalties, never a hash
and never product tags:

```
FIT   = 0.7 × concern fit + 0.3 × skin-type fit     (each 0-100, 50 = neutral)
SCORE = 30 + 0.7 × FIT − irritation penalty − pore penalty
```

(`ANCHOR = 30`, `FIT_LEVER = 0.7` in code.) Bands are `SCORE_BANDS`
(90/75/60 excellent/good/fair, else poor) — **always read that constant,
never hardcode a cutoff.**

Evidence, in priority order: **`lib/rules.ts`** (`INGREDIENT_RULES` — curated
rules, each carrying the sentence shown to the user; #237 takes this toward
~500) > **CosIng `functions`** (benefit-only signal; a named rule always beats
a declared function, nothing counts twice) > **`lib/pore-clogging.ts`**
(clogger families with confidence tiers, owns acne fit).

- Acne/`large-pores` fit is 65% pore-cleanliness-weighted; contested
  clogger entries count zero.
- Per-concern saturation constants are mandatory — do not remove them.
- **Confidence is separate from score.** Refusal is only for genuinely
  unreadable formulas (< 3 identified ingredients, or < 25% coverage);
  unknown ingredients lower confidence, never block an answer.
- **`contactWeight` (`lib/rules.ts`) is the only place a product's *type*
  touches the score** — it returns `{ harm, benefit }`, scored independently.
  Harm stays at 1 unless a type is unambiguously short-contact, so a wrong
  type guess can only over-state risk, never hide it; benefit is discounted
  more freely. Per-type values are in the code; reasoning in
  `docs/decisions.md`, "Scoring".
- **For "very sensitive" only, a product's main fragrance ingredient
  (the heaviest rule: parfum/fragrance, then essential oils, then allergens;
  or, when no fragrance rule is in the formula, an EU fragrance allergen no rule
  names) keeps at least 0.7 of its weight wherever it sits** — once per product, not
  per allergen (`FRAGRANCE_POSITION_FLOOR_HIGH`, #363). The position discount
  otherwise left "very" barely different from "somewhat". No other irritant,
  level or weight is affected.
- `hazard` warnings cap the score at 45 and subtract 5 per additional
  hazard. `irritant` warnings go through the graduated irritation penalty
  instead — **do not merge these two tiers.**
- **EU "restricted" (Annex III) never adds an irritation charge by itself
  (#407).** It means *allowed with conditions*, not irritating. Only an EU
  fragrance allergen or an entry whose required warning names allergy or
  sensitisation is charged, and both lists are the one constant
  `lib/eu-allergens.ts` — add a name only from the consolidated text, never
  from memory. One predicate, `euAllergenFor` in `lib/safety.ts`, drives the
  charge, warning, list label and risk count; an allergen that is also a
  fragrance rule is charged once, at the higher weight. The UI says "Allowed
  with limits", never "Restricted". Rest: `docs/decisions.md`, "EU
  'restricted' (Annex III)".
- Import `COMEDOGENIC_FLAG_THRESHOLD` (3) from `lib/safety.ts` — never
  re-inline a comedogenic check. There is no comedogenic *hazard*: the 0-5
  column is empty for catalogue rows, so pore-clogging is warned about and
  explained only from `lib/pore-clogging.ts` (#406). `confidenceLabel` lives
  in `lib/matching.ts` with the arithmetic it describes; the old
  `verdictHeadline` and `scoreExplanation` were removed in #406 (no screen
  called them).

## Design system

- **Tokens: `tailwind.config.js`** (everything reachable via `className`)
  **+ `lib/colors.ts`** (raw-hex mirror for RN props that take a literal
  color — `ActivityIndicator.color`, `headerTintColor`, `react-native-svg`
  `fill`). Keep both in sync; never hardcode a hex that has a token.
- **Verified vs. inferred hex** — mark a color verified only when read
  directly off a mockup or computed with a stated contrast ratio, per the
  pattern in `tailwind.config.js`'s own comments. Otherwise say so
  ("inferred", "computed").
- **Assets:** `assets/illustrations/` (general set) +
  `assets/illustrations/onboarding/` (onboarding-scoped); `assets/images/`
  for one-off references. New illustrations go under `assets/illustrations/`.
- **`design_handoff_*/` folders are intent, not measurement** — an HTML
  reference + README + assets to build *from*, not code to paste. Follow
  this codebase's existing component patterns. **When a mockup value
  contradicts an existing token, ask** before changing the token or
  overriding it. PNGs a handoff's README marks as final artwork get copied
  in as-is, never redrawn.
- **Never put a real third-party brand name, logo, or product photo in a
  shipped asset.**

## Constraints

- **Tailwind stays on v3** — NativeWind's runtime
  (`react-native-css-interop`) declares `tailwindcss: "~3"` as a hard
  peer; v4 breaks styling silently.
- **`babel-preset-expo` is an explicit devDependency**, named directly in
  `babel.config.js` — removing it breaks bundling.
- **`web.output` is `"single"` (SPA), not `"static"`** — static
  prerendering crashes on any component touching browser APIs (the camera
  screen).
- **`experiments.reactCompiler` is off** — conflicts with NativeWind's
  `jsxImportSource`.
- **Never use a function-valued `style` on `Pressable`**
  (`style={({pressed}) => …}`) — trips NativeWind's prop interop. Use
  `className` with `active:` instead.
- **Check Expo Go's current App Store SDK before upgrading this project's
  SDK** — an upgrade can put device testing ahead of what Expo Go ships;
  see `docs/decisions.md`.
- **Dependency updates and advisories** (CI audit, Dependabot, triage times):
  `docs/dependencies.md`.

## Running on a device

**Accounts need a development build (#218).** Expo Go still runs the app,
but Google sign-in does not work there at all, and an Apple sign-in in Expo
Go creates a different account from the one a real build creates. Test
anything account-related — sign-in, the shelf moving to the server — on a
development build with this app's bundle ID. Why: `docs/decisions.md`,
"Accounts".

For everything else, `expo-camera` is bundled in Expo Go — no dev build
needed, *if* Expo Go's installed SDK matches this project's.

If a plain App Store Expo Go refuses the project (SDK mismatch), see
`README.md`, "On your phone".

**Never pipe `expo start`'s output** — the QR needs a real TTY.
