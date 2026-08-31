I'm building a skincare product/ingredient lookup app that needs to run
on iOS, Android, AND web from a single codebase.

Set up a new Expo project with:

- TypeScript
- Expo Router (file-based navigation) — this needs to work cleanly across
  mobile and web, not just mobile
- Web support explicitly enabled and verified working (expo start --web
  should run correctly, not just mobile)
- NativeWind (Tailwind for React Native) for styling, so the UI stays
  consistent and fast to build across all three platforms
- Zustand for lightweight global state (skin profile, saved products,
  onboarding completion status)
- expo-camera and a barcode/QR scanning library, configured and verified
  working on mobile (acceptable if scanning is mobile-only for now —
  flag if there are complications getting it to at least gracefully
  degrade on web rather than crash)

After setup, create a minimal "hello world" screen with one button that
navigates to a second screen, to confirm routing works. Then show me
exactly how to:

1. Launch it on my phone via Expo Go
2. Launch the web version in a browser

Confirm both work before we move on to building actual screens.
