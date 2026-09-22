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

Supabase is the live backend (Edge Functions `product-lookup`, `label-ocr`
deployed). `data/api.ts` falls back to 8 sample products only when
`EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are absent — keeps checkouts and
tests hermetic. Live catalogue: 851 products (grows when someone runs the
operator script `import:obf`, or when a user photographs a list and names a
product — a product exists only with a name, a barcode and an ingredient list,
enforced in `replace_product_with_ingredients`; `import:dailymed` is retired
because DailyMed has no barcodes. The one scheduled catalogue job,
`reconcile-obf.yml`, re-checks existing rows for reformulation, it doesn't add
new ones; check the live count rather than trusting this number for long),
~36k dictionary ingredients, ~25k synonyms.

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
with `--` for a small change).

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

## You have no TTY — regenerating route types

`href` strings are type-checked against `.expo/types/router.d.ts`, which
only `expo start` regenerates (`expo export` does not). The QR needs a real
TTY to draw — **type generation does not**, it happens on disk regardless.

**On any route add/rename/remove:** run `npx expo start --port <free-port>`
backgrounded with output redirected to a file (ignore the missing QR line);
wait until `.expo/types/router.d.ts` changes, or ~10s after the log shows
`Waiting on http://localhost:<port>`; kill it; re-run `npm run typecheck`;
tell the user a route changed so their own dev server picks up the file
too. If types look wrong (non-route dirs appearing as routes), delete
`.expo/types` and repeat.

## Architecture

**`data/api.ts` is the only data seam.** No component imports
`data/products.ts` / `data/ingredients.ts` directly — always go through
`fetchProducts` / `fetchProduct` / `fetchProductsByIds`. This already *is*
the real backend; the invariant keeps the seam clean for the day it isn't.

**Routing** — Expo Router (file-based) in `app/`; web must work, not just
native.

- **`/` is `app/(tabs)/index.tsx`** (Home: scan card, search box, skin profile),
  not a product list. The scanner is `app/(tabs)/scanner.tsx`, full screen, opened
  from the raised middle tab button (or `openScanner()` in `lib/genie.ts`).
  `initialRouteName` doesn't change what `/` resolves to. A root
  `app/index.tsx` is impossible — it collides with `app/(tabs)/index.tsx`.
- **Never navigate from a layout file.** Gate with a declarative
  `<Redirect>` inside the navigator, or navigate from a user event.
- Regenerate typed routes (above) whenever routes change.

**State** — `store/useAppStore.ts`, one Zustand store: skin profile,
onboarding flag, wishlist. Persisted via `persist` + AsyncStorage, gated on
`useAppStore.persist.hasHydrated()` in `app/_layout.tsx`.
**`store/useAppStore.ts` is the only file allowed to import AsyncStorage**
— see `docs/device-storage-policy.md` for which data class goes where.

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

Evidence, in priority order: **`lib/rules.ts`** (59 curated rules, each
carrying the sentence shown to the user) > **CosIng `functions`**
(benefit-only signal; a named rule always beats a declared function,
nothing counts twice) > **`lib/pore-clogging.ts`** (27 clogger families
with confidence tiers, owns acne fit).

- Acne/`large-pores` fit is 65% pore-cleanliness-weighted; contested
  clogger entries count zero.
- Per-concern saturation constants are mandatory — do not remove them.
- **Confidence is separate from score.** Refusal is only for genuinely
  unreadable formulas (< 3 identified ingredients, or < 25% coverage);
  unknown ingredients lower confidence, never block an answer.
- **`contactWeight` (`lib/rules.ts`) is the only place a product's *type*
  touches the score** — it returns `{ harm, benefit }`, scored independently:
  harm stays at 1 unless a type is unambiguously short-contact, so a wrong
  type guess can only over-state risk, never hide it; benefit is discounted
  more freely, since crediting a rinse-off product at leave-on strength is
  the opposite mistake. **`cleanser`, `body-wash` and `body-scrub` discount
  both** (0.25/0.25, 0.5/0.5); `micellar-water` — split out of `cleanser`
  because it's wiped rather than rinsed — takes full weight on both.
  `unknown`, `exfoliator`, `conditioner`, `hair-mask` and `shampoo` keep harm
  at 1 but discount benefit to 0.5 (0.25 for `unknown`), since each spans
  both a rinse-off and leave-on product. Reasoning in `docs/decisions.md`.
- `hazard` warnings cap the score at 45 and subtract 5 per additional
  hazard. `irritant` warnings go through the graduated irritation penalty
  instead — **do not merge these two tiers.**
- Import `COMEDOGENIC_FLAG_THRESHOLD` (3) / `COMEDOGENIC_SEVERE_THRESHOLD`
  (4) from `lib/safety.ts` — never re-inline a comedogenic check.
  `scoreExplanation` / `confidenceLabel` live in `lib/matching.ts` with the
  arithmetic they describe.

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
  (`react-native-css-interop@0.2.6`) declares `tailwindcss: "~3"` as a hard
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

## Running on a device

`expo-camera` is bundled in Expo Go — no dev build needed, *if* Expo Go's
installed SDK matches this project's.

- **iPhone:** if a plain App Store Expo Go refuses the project, use
  `eas go` (Apple Developer Program + TestFlight) or sign.expo.dev
  re-signing.
- **Android:** if the Play Store build refuses it, run
  `npx expo-go download android <sdk>` with this project's *actual* SDK.

Windows: **never pipe `expo start`'s output** — the QR needs a real TTY
(type generation does not, see above). If a WSL/Hyper-V adapter is
advertising the wrong IP, pin
`REACT_NATIVE_PACKAGER_HOSTNAME=<your Wi-Fi IP>`.
