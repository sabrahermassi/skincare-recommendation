# Privacy disclosures

**This is not a published, user-facing privacy policy.** The app has never
been submitted to the App Store or Play Store — there is no `eas.json`, no
bundle identifier configured, no store listing (confirmed by search; see
`CLAUDE.md`: "Currently a demo running entirely on fabricated data"). There
is nowhere to publish a policy yet, and no Play Console Data Safety form or
Apple App Privacy label to fill out — those don't exist until an app listing
does.

What this document is instead: the factual record a real privacy policy will
need, written now, in the terms a privacy policy uses, so that filling out
those forms later is transcription rather than research done under launch
pressure. It exists because of issue #16, which found that
`.claude/claude-security-guidance.md`'s promise to "revisit and confirm
whether the third-party AI provider retains or trains on submitted images"
was never kept once OCR shipped.

## Third-party data processors

### Google Cloud Vision API

**What's sent:** a photo of a product's printed ingredient list, normally
cropped client-side to the labeled region before it leaves the device (see
`lib/crop-to-guide.ts`) — this is the standard path, but a crop that fails
for any reason (a layout measurement not yet landed, a degenerate frame, a
manipulation error) falls back to the uncropped photo rather than blocking
the scan, per `docs/threat-model.md`'s "Send the minimum" section. Always
stripped of all EXIF/XMP/IPTC metadata regardless of whether the crop
applied — no GPS coordinates, device identifiers, or capture timestamps are
included (see `supabase/functions/_shared/strip-metadata.ts`).

**When:** only when a user actively photographs a label through the "Read
the label" flow. Never in the background, never for any other feature.

**Retention and training, per Google's own published terms:**

- Google does not use submitted content to train or improve its models.
  ([Vision API Data Usage](https://docs.cloud.google.com/vision/docs/data-usage))
- The synchronous endpoint this app calls (`images:annotate`) processes the
  image in memory and does not persist it to disk. Some request metadata is
  logged briefly for abuse detection. (Same source. The async batch
  endpoints, which store submitted images temporarily with a TTL of a few
  hours, are not used by this app.)
- Google's [Cloud Data Processing
  Addendum](https://cloud.google.com/terms/data-processing-addendum) is
  incorporated by reference into the standard GCP Terms of Service — the
  agreement in effect for any Google Cloud project, including one used only
  through an API key. No separate contract was negotiated, since there is
  none to negotiate for API-key-only usage. **Whether that standard,
  incorporated DPA is sufficient for this project's obligations is a
  determination this document cannot make** — see issue #14 (open at time of
  writing) and `docs/threat-model.md`'s trust-boundary section.

**What this app itself retains from that exchange:** only the recognized
text, parsed into ingredient names, stored against the product. The
photograph itself — cropped or not, before or after stripping — is never
written anywhere and exists only for the duration of the request. See
`docs/threat-model.md`'s "No photo storage, ever" non-goal.

**In-app disclosure:** `app.json`'s `expo-camera` plugin sets the iOS
camera-access purpose string (`NSCameraUsageDescription`) to name both uses
— barcode scanning and label photography. That string is **inert in Expo
Go**, which ships its own `Info.plist` — it only takes effect through
prebuild, a development build, or a store build, which is exactly when it
becomes a real store declaration rather than a no-op. `app/scan-label.tsx`
carries the disclosure on every platform in the meantime: a persistent line
in the capture screen and a fuller sentence on the permission-request
screen, so a user is told where the photo goes independent of which build
they're running.

### Open Beauty Facts, the INCI API, UPCitemdb

Product catalogue lookups by barcode. No user-identifying or user-supplied
content is sent to these — only the scanned barcode number. See
`docs/threat-model.md`'s trust-boundary section for the untrusted-input
handling on the way back.

### PostHog — usage analytics (#225)

**What is sent:** five funnel events and nothing else — `scan_started`,
`verdict_viewed`, `save_tapped`, `sign_in_shown`, `signed_in` — each with a
couple of fixed-value properties (which path: barcode, label or browse;
product or ingredient; signed in or not; Apple or Google; new account or
not), plus PostHog's own app-lifecycle events (opened, backgrounded,
installed, updated) and the device facts its SDK attaches (OS, app version,
device model, locale). **Never** an ingredient list, product name, barcode,
image, or any skin-profile field; no person properties at all. The closed
list lives in `lib/analytics.ts` and `__tests__/analytics.test.ts` fails if
a free-text or personal property is added.

**Identity:** a random id PostHog generates on the phone. Not a device
identifier, not an advertising id — the SDK reads neither, so there is **no
App Tracking Transparency prompt** and nothing is tracked across other apps
or websites. **On sign-in that random id is linked to the account id**
(the id only — no email, no name). That is the moment a guest's earlier
events become attributable to an account; it is what lets the funnel count
sign-ups, and it is disclosed on the Privacy screen. Signing out starts a
new random id, so the next person on the phone is not linked to the last.

**Where and how long:** PostHog's EU region (`eu.i.posthog.com`) by
default. Geo-IP lookup is off in the SDK. The request still carries the
caller's IP to PostHog; the project setting **"Discard client IP data"**
should be on, and retention set in the project, before launch — both are
the operator's to set in PostHog.

**App Store privacy labels** (App Store Connect → App Privacy), for this
processor: *Usage Data → Product Interaction* and *Identifiers → User ID*
(once signed in), both **linked to the user** after sign-in, **not used for
tracking**, used for **Analytics**. *Diagnostics* only if PostHog's crash
reporting is ever turned on (it is not).

**EU lawful basis** is not decided here: whether consent is required
depends on #14, and the question has been raised there.

## What isn't sent anywhere

- Skin profile, quiz answers, scan history, saved products: on-device only
  today (`AsyncStorage`, unencrypted — a separate, already-tracked gap, not
  this document's subject; see `docs/device-storage-policy.md`). That
  storage is also swept into Android's default `allowBackup` and iOS
  device/iCloud backups, which is a disclosable processing fact for whatever
  becomes the real privacy policy.
- Face or skin photographs: this app has no feature that captures one. If
  one is ever added, it needs its own entry here and its own regulatory
  review — see `docs/threat-model.md`'s non-goals.

## When this becomes a real policy

Before any store submission, this document's facts need to become the
"Third-Party Services" section of an actual privacy policy, and the
retention/training statements above need to be re-verified against whatever
Google's terms say at that time (linked, not copied, above, for exactly this
reason) rather than assumed to still hold.
