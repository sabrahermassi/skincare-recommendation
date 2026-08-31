I'm building a mobile app for browsing and evaluating Korean skincare
products, using Expo and React Native.

## Product context

Users can:

- Browse a product catalog, filterable by product type (serum, ampoule,
  sunscreen, moisturizer, etc.) and skin type/concern (dry, dehydrated,
  acne-prone, etc.)
- Complete an onboarding flow that captures their skin type and concerns,
  used to personalize browsing (every product shows a match percentage
  against their profile by default — browsing works with or without
  active search intent, like window shopping)
- Tap a product to see its full ingredient list
- Check ingredients against pore-clogging/comedogenic status and general
  ingredient safety
- Compare multiple products side by side
- Scan a product's QR code, or upload/take a photo of an ingredient list,
  and get the same ingredient/safety breakdown as a catalog product
- Get notified when: a new product matches their skin profile, a saved/
  wishlisted product restocks, or a weekly digest of new Korean skincare
  releases matching their profile is ready

## What I need right now

Set up the Expo/React Native workspace, then build a working demo app
with mock/hardcoded data (3-5 sample Korean skincare products, e.g.
something like a hydrating serum, a sunscreen, a cleanser — realistic
but fabricated ingredient lists is fine for now) covering:

1. A simple onboarding flow (2-3 screens) capturing skin type and 1-2
   concerns
2. A product browse/list screen showing the mock products, with a
   match-percentage badge on each (percentage can be a hardcoded/random
   placeholder for now — real matching logic comes later)
3. A product detail screen showing full ingredient list and a mocked
   comedogenic/safety flag per ingredient
4. A basic compare screen (pick 2 products, see ingredients side by side)

Keep this to a genuinely minimal, working demo — the goal right now is a
real app I can launch on my phone via Expo Go, not a polished final UI.
Use React Navigation for screen flow. Keep component structure clean
enough that it's easy to swap mock data for real API calls later — don't
hardcode data directly inside components; put it in a separate mock data
file that a future API layer can replace.

Once it's set up, tell me exactly how to launch it on my phone with Expo Go.
