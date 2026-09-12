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

## Scoring

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
