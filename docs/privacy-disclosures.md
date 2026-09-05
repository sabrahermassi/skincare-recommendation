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

**What's sent:** a photo of a product's printed ingredient list, cropped
client-side to the labeled region before it leaves the device (see
`lib/crop-to-guide.ts`) and stripped of all EXIF/XMP/IPTC metadata — no GPS
coordinates, device identifiers, or capture timestamps are included (see
`supabase/functions/_shared/strip-metadata.ts`).

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
  through an API key. No separate contract was negotiated because none was
  needed.

**What this app itself retains from that exchange:** only the recognized
text, parsed into ingredient names, stored against the product. The
photograph itself — cropped or not, before or after stripping — is never
written anywhere and exists only for the duration of the request. See
`docs/threat-model.md`'s "No photo storage, ever" non-goal.

### Open Beauty Facts, the INCI API, UPCitemdb

Product catalogue lookups by barcode. No user-identifying or user-supplied
content is sent to these — only the scanned barcode number. See
`docs/threat-model.md`'s trust-boundary section for the untrusted-input
handling on the way back.

## What isn't sent anywhere

- Skin profile, quiz answers, scan history, saved products: on-device only
  today (`AsyncStorage`, unencrypted — a separate, already-tracked gap, not
  this document's subject).
- Face or skin photographs: this app has no feature that captures one. If
  one is ever added, it needs its own entry here and its own regulatory
  review — see `docs/threat-model.md`'s non-goals.

## When this becomes a real policy

Before any store submission, this document's facts need to become the
"Third-Party Services" section of an actual privacy policy, and the
retention/training statements above need to be re-verified against whatever
Google's terms say at that time (linked, not copied, above, for exactly this
reason) rather than assumed to still hold.
