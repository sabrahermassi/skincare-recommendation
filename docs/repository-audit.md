# Repository audit summary

This is a universal Expo/React Native skincare compatibility app for iOS, Android, and web. The core product is substantially implemented: onboarding, a local skin profile, barcode scanning, label-photo OCR, a Supabase catalogue, ingredient analysis, deterministic scoring, saved products, history, and ingredient details.

The codebase is unusually thoughtful about unknown data, privacy, source licensing, and explainability. Its main risks are now at integration boundaries: anonymous OCR writes, incomplete-product recovery, network/error handling, database/import consistency, and a scoring model that is well engineered but not yet externally validated.

I inspected all first-party application code, backend functions, migrations, scripts, tests, configuration, CI, architecture/privacy documentation, and the inventories of design handoffs and local development tooling. Binary artwork and installed third-party package internals were not individually audited.

## Architecture and folder structure

```text
Expo application
│
├─ app/                         Expo Router screens
│  ├─ (tabs)/                   Scan, Browse, Saved, Profile
│  ├─ onboarding/               Intro carousel and four-step quiz
│  ├─ product/[id]              Unified product/result screen
│  ├─ result/[id]               Re-export of product/[id]
│  ├─ ingredients/[id]          Product ingredient list
│  ├─ ingredient/[inci]         Individual ingredient detail
│  └─ scan-label                Label-photo camera modal
│
├─ components/                  Shared visual components and onboarding shells
├─ store/                       Zustand device-local state
├─ data/                        Domain types, API seam, fallback catalogue
├─ lib/                         Matching, safety, INCI parsing, design utilities
│
├─ supabase/
│  ├─ functions/                Barcode lookup and Google Vision OCR
│  └─ migrations/               Catalogue schema, RLS, eviction, atomic RPC
│
├─ scripts/                     Catalogue/dictionary import utilities
├─ __tests__/                   Jest unit and contract tests
├─ docs/                        Threat model, privacy, storage, decisions
├─ .github/workflows/           CI and exported-bundle secret scan
└─ design*/ / .claude/          Design references and development tooling
```

The main architectural seam is [`data/api.ts`](data/api.ts). Screens never directly access Supabase or the fallback catalogue. When the two public Supabase variables are configured, the API layer uses Supabase; otherwise it returns eight bundled sample products from [`data/products.ts`](data/products.ts) and 24 sample ingredients from [`data/ingredients.ts`](data/ingredients.ts).

One layering leak is that the data layer imports `defaultPackagingType` from a visual component, making `data → components` rather than keeping domain mapping below the UI: [`data/api.ts`](data/api.ts), [`components/BottleIcon.tsx`](components/BottleIcon.tsx).

## How the application works end-to-end

1. The root layout loads fonts and waits for Zustand persistence to hydrate before rendering. This prevents returning users briefly seeing onboarding: [`app/_layout.tsx`](app/_layout.tsx).

2. The tabs layout checks `hasSeenOnboarding`. A first-time user is declaratively redirected to onboarding: [`app/(tabs)/_layout.tsx`](app/(tabs)/_layout.tsx).

3. Onboarding contains three introductory screens followed by questions about concerns, base skin type, sensitivity, and pregnancy/breastfeeding status. Answers are written into the Zustand profile: [`lib/profile.ts`](lib/profile.ts), [`data/types.ts`](data/types.ts).

4. Returning users land on the scanner. A barcode is read with `expo-camera`, then sent to the `product-lookup` Edge Function: [`app/(tabs)/index.tsx`](app/(tabs)/index.tsx), [`data/api.ts`](data/api.ts).

5. Barcode lookup checks, in order:

   - The existing Supabase catalogue
   - Open Beauty Facts
   - INCI API, when configured
   - UPCitemdb for identity only

   Successful external results are stored through an atomic database RPC: [`supabase/functions/product-lookup/index.ts`](supabase/functions/product-lookup/index.ts), [`supabase/migrations/0008_replace_product_ingredients.sql`](supabase/migrations/0008_replace_product_ingredients.sql).

6. If no barcode result is found, the user can photograph the ingredient label. The client crops toward the guide, strips metadata, uploads base64 data, and deletes temporary files: [`app/scan-label.tsx`](app/scan-label.tsx).

7. The OCR Edge Function validates image size and structure, strips metadata again, calls Google Cloud Vision, parses ingredient names, resolves synonyms and verified dictionary entries, and stores the resulting product/formula: [`supabase/functions/label-ocr/index.ts`](supabase/functions/label-ocr/index.ts).

8. The product is fetched with its ordered ingredient list. `matchProduct` scores it locally against the device-local profile. No profile data is sent to Supabase: [`lib/matching.ts`](lib/matching.ts).

9. The result screen displays the score, confidence, reasons, irritation/pore findings, detailed ingredients, save action, and attribution. The same screen is used for both scan and browse results: [`app/product/[id].tsx`](app/product/[id].tsx), [`app/result/[id].tsx`](app/result/[id].tsx).

10. Saved products, starred ingredients, profile, history, onboarding status, and local product-name suggestions persist in AsyncStorage: [`store/useAppStore.ts`](store/useAppStore.ts).

## Frontend and component structure

Route screens own fetching and orchestration. Shared UI is split into:

- Catalogue/result components: `ProductRow`, `ProductThumbnail`, `ScoreRing`, `RiskCards`, `IngredientTabsList`.
- Navigation/chrome: `AppHeader`, `ScreenHeader`, tab layout.
- Onboarding: `OnboardingShell`, `QuizFrame`, `QuizScreen`, `QuizOptionCard`.
- Shared primitives: custom `Text`, `PrimaryButton`, icons, bottle illustrations.

The main screens are large—Scan is about 788 lines, Profile 623, and Product roughly 600—so behavior, SVG artwork, state machines, and layout are often combined in one file. Components have been extracted where reuse mattered, but these screens are approaching maintainability limits.

Styling uses NativeWind/Tailwind plus raw React Native token modules. The intended sources are [`tailwind.config.js`](tailwind.config.js), [`lib/tokens.ts`](lib/tokens.ts), and [`lib/colors.ts`](lib/colors.ts).

## Backend, database, and data relationships

There is no conventional application server. Supabase provides:

- Public catalogue reads through PostgREST.
- `product-lookup` and `label-ocr` Edge Functions.
- PostgreSQL persistence and scheduled cache eviction.

Current relationships:

```text
products
  id PK
  barcode UNIQUE
  source / attribution / expiry
       │
       │ 1:N, ordered by position
       ▼
product_ingredients
  product_id FK ───────────────┐
  inci_name FK                 │
  position                     │
                               ▼
                         ingredients
                           inci_name PK
                           functions[]
                           safety
                           verified
                           source
                               ▲
                               │ N:1
                    ingredient_synonyms
```

The schema is defined in [`supabase/migrations/0001_catalogue.sql`](supabase/migrations/0001_catalogue.sql), with synonyms in [`supabase/migrations/0006_ingredient_synonyms.sql`](supabase/migrations/0006_ingredient_synonyms.sql).

There are no user, profile, saved-product, or history tables. Consequently, there is no cross-device sync.

RLS is enabled for all catalogue tables. Anonymous/authenticated clients receive public `SELECT` access but no table-write policy. Writes happen with the service role inside Edge Functions. The formula-replacement RPC is explicitly revoked from public roles and granted only to `service_role`: [`supabase/migrations/0008_replace_product_ingredients.sql`](supabase/migrations/0008_replace_product_ingredients.sql). Its current definition is [`0009`](supabase/migrations/0009_bump_fetched_at_on_formula_rewrite.sql), which adds the `fetched_at` bump that lets the client's freshness key observe a formula rewrite.

One model mismatch remains: the database still requires `products.area`, while the client removed area completely. Both Edge Functions currently hardcode `"face"`. The client also has `productType` packaging metadata that the database lacks, so it is inferred from product category: [`supabase/migrations/0001_catalogue.sql`](supabase/migrations/0001_catalogue.sql), [`store/useAppStore.ts`](store/useAppStore.ts).

## Skin profile, state management, and data flow

`SkinProfile` contains:

- Up to three visible concerns
- Nullable base skin type
- Nullable three-level sensitivity
- Nullable pregnancy/breastfeeding status

See [`data/types.ts`](data/types.ts) and [`store/useAppStore.ts`](store/useAppStore.ts).

Zustand is the only global state manager. Persistence is versioned at schema version 6 and includes migration from the old `skintel-store` key and earlier profile formats: [`store/useAppStore.ts`](store/useAppStore.ts).

Catalogue data is cached behind the `data/api.ts` seam by [`data/catalogue-cache.ts`](data/catalogue-cache.ts): a memory layer with no expiry while the app is open, and a 24h AsyncStorage layer, with a count-plus-newest-timestamp watermark standing in for a full refetch. There is still no query library, normalization layer, or shared request state; screens hold the result in component-local state as before and learn nothing about the cache.

## Recommendation and matching logic

The scoring engine is deterministic and ingredient-driven. It explicitly ignores product marketing fields such as `targets` and `suitableFor`.

Its evidence order is:

1. 59 curated ingredient rules from [`lib/rules.ts`](lib/rules.ts).
2. CosIng functional roles, used as benefit-only fallback evidence.
3. 27 pore-clogging families with high/moderate/contested confidence from [`lib/pore-clogging.ts`](lib/pore-clogging.ts).
4. Four pregnancy-caution categories from [`lib/pregnancy-caution.ts`](lib/pregnancy-caution.ts).

Formula:

```text
fit   = 70% concern fit + 30% skin-type fit
score = 30 + 0.7 × fit − irritation penalty − pore penalty
```

Ingredient contributions are weighted by label position and product contact. Potential harm and positive evidence use separate contact weights so ambiguous use stays conservative in both directions. Hazards cap the score; irritants receive a sensitivity-scaled penalty. A score is refused if fewer than three ingredients are recognized or coverage is below 25%. Confidence is separate from the score: [`lib/matching.ts`](lib/matching.ts).

This separation of score, confidence, warnings, explanations, and unknown-data handling is strong. However, the numeric weights and saturation constants remain heuristic. Tests establish consistency, not clinical validity or calibration. There is no committed expert-reviewed benchmark corpus showing that a score of 85 has a real-world interpretation.

A label-only product receives type `"unknown"`. `contactWeight` treats its potential harm like a leave-on product but gives positive evidence only the quick-rinse weight. This avoids under-counting risk or over-crediting benefit, but can still be more cautious than the product's real use warrants: [`supabase/functions/product-lookup/index.ts`](supabase/functions/product-lookup/index.ts), [`lib/rules.ts`](lib/rules.ts).

## Implemented versus incomplete

Implemented:

- Expo Router navigation for all primary screens
- First-run onboarding and editable local skin profile
- Barcode scanning on the configured camera formats
- Barcode lookup cascade
- Label photography, metadata stripping, OCR, parsing, and persistence
- Browse, type filtering, and product/brand search
- Personalized scoring and confidence
- Ingredient and risk details
- Saved products and scan history
- Starred-ingredient persistence
- Sample-data fallback
- Database migrations, RLS, expiry scheduling, and atomic Edge Function writes
- CI for typecheck, lint, tests, multi-platform export, and secret scanning

Incomplete or not operationally closed:

- No authentication or cross-device synchronization; intentionally absent.
- No visible list/use for starred ingredients. They can be starred and persisted but only read to render the same star again: [`app/ingredient/[inci].tsx`](app/ingredient/[inci].tsx), [`store/useAppStore.ts`](store/useAppStore.ts).
- Product-name suggestions remain device-local and have no submission/review path: [`store/useAppStore.ts`](store/useAppStore.ts).
- The documented paste/manual-ingredient flow is absent from routing and the scanner’s `Mode` type, despite leftover API support and comments: [`app/(tabs)/index.tsx`](app/(tabs)/index.tsx), [`data/api.ts`](data/api.ts).
- Web retail-barcode support has been verified from dependency source but not end-to-end on real hardware, according to [`docs/decisions.md`](docs/decisions.md).
- No store-release setup, `eas.json`, application identifiers, or published privacy policy: [`docs/privacy-disclosures.md`](docs/privacy-disclosures.md).

## Most important issues and potential bugs

1. **Identity-only products are a dead end.** UPCitemdb can return a recognized product with zero ingredients. The app navigates to its product screen, but that screen intentionally presents no “photograph the label” action when the formula is empty. The recovery action promised by the backend therefore does not exist. Opening Label Photo manually also omits the known barcode, creating a separate OCR product instead of completing the existing one: [`supabase/functions/product-lookup/index.ts`](supabase/functions/product-lookup/index.ts), [`app/product/[id].tsx`](app/product/[id].tsx), [`app/(tabs)/index.tsx`](app/(tabs)/index.tsx).

2. **Successful barcode scans log history twice.** The scanner records the view before navigation, and the unified product screen records it again after loading. One physical scan increments `seenCount` twice: [`app/(tabs)/index.tsx`](app/(tabs)/index.tsx), [`app/product/[id].tsx`](app/product/[id].tsx).

3. **Network failures are frequently presented as missing data.** Barcode lookup catches every non-404 error and displays “not in our catalogue,” then records an unknown barcode. Browse search converts request errors into an empty result. Product detail converts request failure into “Product not found.” These states mislead users during outages: [`app/(tabs)/index.tsx`](app/(tabs)/index.tsx), [`app/(tabs)/browse.tsx`](app/(tabs)/browse.tsx), [`app/product/[id].tsx`](app/product/[id].tsx).

4. **Edge Function calls have no client timeout.** Direct catalogue reads have a 12-second abort, but `functions.invoke` for both barcode lookup and OCR is outside that wrapper. Barcode mode can remain in “looking” indefinitely until the platform/network rejects: [`data/api.ts`](data/api.ts).

5. **Anonymous OCR can poison the shared catalogue.** A public caller can submit any structurally valid image and optional new barcode. The server requires four parsed tokens but does not require any verified ingredient before persisting. That record can then become the short-circuit result for later users. The client rejects a zero-recognition result only after the server has already stored it: [`supabase/functions/label-ocr/index.ts`](supabase/functions/label-ocr/index.ts), [`app/scan-label.tsx`](app/scan-label.tsx).

6. **OCR does not honor product expiry.** `productForBarcode` does not filter `expires_at`. It can return an expired INCI API formula before scheduled eviction. If it tries to enhance an empty INCI API row, the code preserves `source: "inci_api"` but sets `expires_at: null`, conflicting with the database constraint: [`supabase/functions/label-ocr/index.ts`](supabase/functions/label-ocr/index.ts), [`supabase/migrations/0001_catalogue.sql`](supabase/migrations/0001_catalogue.sql).

7. **The bulk OBF importer bypasses the atomic RPC and ignores returned Supabase errors.** It separately writes ingredients/products, deletes joins, and inserts batches. A partial failure can leave products with incomplete or empty formulas while still printing a success message: [`scripts/import-obf.mjs`](scripts/import-obf.mjs).

8. **Edge Function product responses omit ingredient functions.** Direct reads request `functions`, but both Edge Function result selects omit them. The returned object therefore has less scoring evidence than the same product fetched immediately afterward: [`data/api.ts`](data/api.ts), [`supabase/functions/product-lookup/index.ts`](supabase/functions/product-lookup/index.ts), [`supabase/functions/label-ocr/index.ts`](supabase/functions/label-ocr/index.ts).

9. **Pregnancy warnings can be visually neutralized.** Safety deliberately flags exact pregnancy-caution names even when OCR left them unverified, but `rungFor` returns `neutral` before consulting warnings. The product risk count can say “Elevated” while the responsible ingredient row appears neutral/unassessed: [`lib/safety.ts`](lib/safety.ts), [`lib/matching.ts`](lib/matching.ts).

10. **A literal backspace character exists in a capitalization regex.** `titleCase` contains character code 8 rather than regex `\b`, so factor ingredient names will generally not be capitalized as intended: [`lib/matching.ts`](lib/matching.ts).

## Security and privacy

Strong controls worth preserving:

- Public and server-only environment variables are clearly separated: [`.env.example`](.env.example).
- Supabase Auth session persistence is explicitly disabled because authentication does not exist: [`lib/supabase.ts`](lib/supabase.ts).
- Catalogue RLS is read-only for clients.
- The privileged write RPC is service-role-only.
- Images are cropped where possible, metadata-stripped twice, size/dimension checked, never stored, and temporary client files are deleted.
- CI exports all three platforms and scans bundles for server-secret names and provider key patterns: [`.github/workflows/secret-scan.yml`](.github/workflows/secret-scan.yml).

Remaining concerns:

- Edge Functions are effectively public and rely on an in-memory, per-isolate IP rate limiter. Cold starts or distributed requests can weaken it; default CORS is `*`, although restricting CORS alone would not stop scripted callers: [`supabase/functions/_shared/http.ts`](supabase/functions/_shared/http.ts).
- Profile and history are health-adjacent data stored in plaintext AsyncStorage and may enter iCloud/Google device backups. The project documents this accurately but has not implemented a release-time backup policy: [`docs/device-storage-policy.md`](docs/device-storage-policy.md).
- If client-side cropping fails, the full photograph is transmitted. Metadata is removed, but surrounding people, rooms, documents, or shelf context remain pixels: [`app/scan-label.tsx`](app/scan-label.tsx).
- The privacy disclosure is explicitly not a published policy, and the legal sufficiency of the Google processing terms remains open: [`docs/privacy-disclosures.md`](docs/privacy-disclosures.md).
- There are no live negative RLS tests. The threat model itself identifies this requirement: [`docs/threat-model.md`](docs/threat-model.md).

## Duplication and documentation drift

- The full INCI parser exists in both client and OCR Edge Function code. A parity test mitigates drift, but product lookup still has a third, simpler parser: [`__tests__/inci-parser-parity.test.ts`](__tests__/inci-parser-parity.test.ts).
- Product-type guessing is duplicated between the live lookup function and OBF importer.
- Several comments still describe removed search/paste modes.
- `CLAUDE.md` says pore cleanliness carries 45% of acne/large-pore fit, while the code now uses 65%: [`CLAUDE.md`](CLAUDE.md), [`lib/matching.ts`](lib/matching.ts).
- The threat model still describes removed gender, age, and body-area profile fields and claims the synonyms table lacks an index/policy even though migration 0006 contains both: [`docs/threat-model.md`](docs/threat-model.md), [`supabase/migrations/0006_ingredient_synonyms.sql`](supabase/migrations/0006_ingredient_synonyms.sql).
- Playwright is installed but unused.
- Starred ingredients and product suggestions add persisted state without a meaningful downstream workflow.

## Testing status

I ran the existing read-only verification commands:

- TypeScript: passed.
- Jest: 17/17 suites passed, 312/312 tests passed, 0 snapshots.
- Lint: exited successfully with seven warnings, all `react-hooks/set-state-in-effect`.

Coverage is strong for:

- Matching and score behavior
- Safety and pregnancy rules
- Pore-clogging logic
- INCI parsing and parser parity
- Image metadata stripping and crop geometry
- Store actions and migrations
- Sample API contracts
- Formatting and profile helpers

Coverage is weak or absent for:

- Rendered React Native screens and user interactions
- Navigation and duplicate history behavior
- Camera lifecycle and permissions
- Live barcode/OCR flows
- Edge Function handlers
- Third-party failure/timeout behavior
- Real Supabase response contracts
- Database migrations/RLS negative tests
- Importer failure and rollback behavior
- Accessibility automation
- Web/native E2E tests

No code-coverage reporter, percentage, or threshold is configured in [`package.json`](package.json).

## What is done well

The most valuable qualities to preserve are:

- One clear asynchronous data seam with a hermetic fallback.
- Deterministic, explainable ingredient-level scoring.
- Honest unknown/unverified states rather than invented data.
- Confidence separated from compatibility score.
- Ordered ingredient relationships and position-aware scoring.
- One unified product/result screen.
- Strong Zustand persistence migrations and hydration gating.
- Atomic Edge Function catalogue writes.
- Read-only RLS and careful secret separation.
- Thoughtful image privacy controls and source attribution.
- CI gates for types, lint, tests, platform bundling, and secret leakage.
- Many comments record actual failure history rather than merely restating code.

## Five next improvements, in priority order

1. **Protect catalogue integrity.** Stage anonymous OCR submissions separately or require stronger server-side acceptance/review rules; fix expired-source handling and prevent unverified scans from becoming permanent short-circuit catalogue truth.

2. **Repair the complete scanning state machine.** Let identity-only products capture a label against the same barcode, add bounded barcode lookup behavior, distinguish genuine misses from network/rate-limit failures, and record one history event per user action.

3. **Validate and calibrate the scoring model.** Review rules with appropriate domain expertise, attach evidence/source/version metadata, commit a representative product/profile benchmark corpus, and decide how unknown product type should affect contact weighting.

4. **Tighten data contracts and ingestion.** Use the atomic RPC—or an equivalent transaction—for bulk imports, check every Supabase result, align Edge Function selects with the client schema, validate incoming rows at runtime, and resolve the obsolete database `area` versus client `productType` mismatch.

5. **Test the actual boundaries.** Add screen/navigation tests, Edge Function integration tests, importer failure tests, expiry tests, live RLS negative tests, and a small camera/OCR E2E suite. Then set meaningful coverage thresholds and either use or remove Playwright.

## Original read-only audit confirmation

During the audit itself, no files were modified, created, deleted, renamed, formatted, or moved, and no packages were installed. The pre-existing working-tree state remained unchanged: two generated Expo type files were already marked modified, and two `.claude/commands` files were already untracked.
