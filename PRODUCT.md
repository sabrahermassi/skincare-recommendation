# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

People who buy skincare and want to know quickly whether a product appears compatible with their skin before buying or using it. The main scene, confirmed 2026-10-06, is holding a product in a shop: one hand, unsure signal, a decision pending. Reviewing products they already own (saved shelf, routine) is secondary.

The MVP is most relevant to people thinking about acne and blemishes, irritation and sensitivity, their chosen skin concerns, and their skin type.

## Product Purpose

for.me turns scattered manual ingredient research (copy ingredients, check several sites, compare, decide) into one quick scan and a personal ingredient-compatibility reading: Product → Scan → Analyze → Understand.

Success: the person identifies a product, sees how compatible it appears with their skin, sees the main ingredient reasons behind that, and makes their own decision. for.me informs; it does not decide.

Source of truth for launch scope: `FOR_ME_MVP.md`.

## Positioning

An ingredient-based compatibility reading, personalised to the person's skin profile, from a single scan. It is not a skincare social network, shopping platform, routine builder or AI dermatologist.

## Operating Context

- Scan by photographing the ingredient list (default) or by barcode (shortcut). Home is the landing screen; scanning opens from a raised middle tab button as a full-screen modal.
- Scan first, quiz later: no skin question before the first scan. A result without a profile still answers on its Safety tab; the Skin match tab offers to personalise.
- Two result tabs: Skin match (personal) and Safety (the same for everyone: irritation and pore-clogging risk, ingredient list).
- Catalogue lives in Supabase (products with name, barcode and ingredient list; about 36k dictionary ingredients). People cannot add products from the app.
- Account is optional. Signed in, the saved shelf syncs to the server. Signed out, people can still save on the device. Notes and routine steps need an account.

## Capabilities and Constraints

- Scoring is fit minus penalties from curated ingredient rules and pore-clogging data. Confidence is shown separately from the score; unreadable formulas are refused rather than guessed. Score bands come from `SCORE_BANDS` and are never hardcoded.
- Skin profile: up to 3 concerns, base skin type (may be "I don't know"), sensitivity, pregnancy status. No age, gender or area.
- Claims policy is a hard constraint (`docs/claims-policy.md`, enforced by test): no diagnose, treat, cure, repair, antibacterial, approval or guarantee claims. A disclaimer does not rescue a medical claim.
- iOS is the only release target. Android and web remain in the tree but get no development or device testing.
- Expo SDK 57, Expo Router, NativeWind (Tailwind v3), Zustand. Design tokens live in `tailwind.config.js` and `lib/colors.ts`; values must not bypass them.
- Undecided: the EU safety notice behind a feature flag (regulatory-safety workstream); Skin needs advice copy is placeholder until scientifically checked.

## Brand Commitments

- Name: for.me (display name), lowercase.
- Voice rules are in `docs/voice.md` and lose to the claims policy: say what happens and what to do next; name what is true about the photo or connection; never blame the reader; confidence without certainty.
- No real third-party brand name, logo or product photo in any shipped asset.

## Evidence on Hand

- Product spec: `FOR_ME_MVP.md`. Policies: `docs/claims-policy.md`, `docs/voice.md`, `docs/device-storage-policy.md`, `docs/privacy-disclosures.md`.
- Design handoffs in the repo root (`design_handoff_*`, `handoff_home_and_tip`, `design handoff october 3d`) are intent, not measurement.
- No testimonials, ratings, press or user numbers exist. Do not fabricate them.

## Product Principles

- Inform, never decide. The person makes the call.
- Answer first. A scan gives a useful result before any setup.
- Say how sure we are. Confidence is separate from the score, and unknowns lower confidence instead of blocking an answer.
- Stay inside the claims policy, even when a warmer sentence is available.
- Fast to read in a shop: one hand, short time, one clear reason behind the result.
