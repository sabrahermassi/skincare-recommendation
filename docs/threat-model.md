# Threat model and data classification

Written against GitHub issue #13. This is the document that has to exist
before any migration creates a user-owned table — it is the input to #14
(regulatory determination), #12 (token storage) and the account-lifecycle
work (#19, #20), and it is what `.claude/claude-security-guidance.md` should
be rewritten against (#26) once it lands.

## Where this stands today

When this was first written, the backend held a database but no user data (the account work since — #218 onward — is noted inline):

- Four tables — `ingredients`, `products`, `product_ingredients`,
  `ingredient_synonyms` — all shared catalogue data. RLS is enabled with a
  public-read policy for `anon`/`authenticated` on `ingredients`, `products`,
  and `product_ingredients`. `ingredient_synonyms` has neither yet — a gap in
  the migration, not a deliberate decision, and worth its own follow-up.
  No table has write policies; every write goes through the service-role
  key, server-side only, never from the client.
- *Superseded by #218:* there was no authentication anywhere in the app.
  Sign in with Apple and Google now put a Supabase session on the device —
  no email, no password. The session lives in the Keychain/Keystore on a
  phone and in memory on web (see §1's session row). The client still holds
  only the anon key.
- *Superseded by #219:* there was no user-owned table. Migration 0025 adds
  the first two, `saved_products` and `saved_ingredients`, owner-only under
  RLS. Still no profile, quiz answers or scan history on the backend, by
  decision.

Personal data also exists on the device: the Zustand store
(`store/useAppStore.ts`) persists the skin profile — concerns, skin type,
sensitivity, pregnancy status — plus a 50-entry scan history, to
AsyncStorage, unencrypted, on-device, and never sends either anywhere.
That is health-adjacent data, held the same way with or without an account.

The product direction (confirmed while planning this doc): accounts with
cross-device sync are the destination for this data. Photos are never stored
server-side — label images already go to Google Vision in memory and are
discarded; no face or skin imagery is retained. Both are treated as fixed
constraints below, not defaults that might slide.

## 1. Data classification

| Data | What it is | Sensitivity | Lives today | After accounts | Retention |
|---|---|---|---|---|---|
| Skin profile | concerns, base skin type, sensitivity, pregnancy status (gender, age group and body area were collected once and have been removed) | Health-adjacent; pregnancy status may be GDPR Art. 9 data (#14) | AsyncStorage, unencrypted, on-device | **No change: never leaves the device, signed in or not** (#219 — no `skin_profiles` table, no opt-in) | Until the person changes it or taps Delete my profile |
| Quiz answers | the same fields, as collected during onboarding | Health-adjacent | Folded into skin profile above | Same as skin profile — device only | Same as skin profile |
| Scan history | last 50 scans: product id, score, warning count, timestamp | Health-adjacent (reveals concerns by inference — a run of "avoid" verdicts on acne products implies acne-prone skin) | AsyncStorage, on-device | **No change: never leaves the device** (#219, `FOR_ME_MVP.md`) | The newest 50 (`HISTORY_LIMIT`); the person can remove entries or clear it |
| Saved products | product id (or raw barcode), when it was saved, and which formula version was on screen | Low sensitivity alone, but joins with scan history to reveal the same inferences | AsyncStorage, on-device | `saved_products` (migration 0025), one row per product, owner-only under RLS; the device keeps a cached copy (#223) | Until removed, or until account deletion — `on delete cascade` from `auth.users` |
| Saved ingredients | starred ingredient names | Low sensitivity alone; a run of starred actives hints at concerns | AsyncStorage, on-device | `saved_ingredients` (migration 0025), owner-only under RLS | Same as saved products |
| Journal note | up to 500 characters the user wrote about a saved product (#228) | Potentially health-adjacent — the prompt asks about the product, but people may write anything, and it is theirs | On a signed-in phone, inside the cached shelf (AsyncStorage), queued until it syncs (#228) | `saved_products.note`, owner-only under RLS; never shared, never in analytics | Same as saved products |
| Routine step | the user's own step 1/2/3 for a saved product (#227) | Low | On a signed-in phone, inside the cached shelf (AsyncStorage) | `saved_products.routine_step` | Same as saved products |
| Product author | which account added a catalogue product from a label photo (#241) — the first column tying a public catalogue row to a person | Low alone, but it links everything one person scanned and named; it must not be public | Does not exist before accounts: every existing and imported row has no author | `product_authors` (migration 0026), a table of its own because `products` is publicly readable. Written only by `label-ocr` with the service role, after the caller's token is confirmed with Auth; readable only by the author (for the export) and the service role. Guests' saves leave no row | Until account deletion, when `user_id` is set to null and the product stays; the row goes with its product |
| First-page flag | the date an account first saved a product, so the welcome shows once (#230) | Low. The person can edit their own `user_metadata`, so it is a nicety and must never gate anything | The account ids that have seen it on this phone, in `useAppStore` (`journalStarted`) | `auth.users` `user_metadata.journal_started_at`, written by the signed-in client | Until account deletion; in the export |
| Account identifier | email and the Apple or Google subject id, from Sign in with Apple / Sign in with Google (#217, #218). Apple's email may be a Hide My Email relay address. No name is requested from Apple; Google's sign-in always includes the account's name and profile-picture URL, which Supabase keeps in the user's metadata (unused by the app) | PII | Supabase Auth `auth.users` and `auth.identities`, created on first sign-in (#218). Identities that share a verified email are linked into one user | Same, referenced by every owner column | Until account deletion |
| Usage events (#225) | five funnel events with fixed-value properties, PostHog's lifecycle events and device facts; never content or profile fields | Low alone; **linked to the account id after sign-in**, which makes a guest's earlier events attributable to that account | PostHog SDK file on the phone; PostHog (EU region) once sent | Same, joined to the account id | PostHog project retention (operator-set). A new random id after sign-out. On account deletion the person and its events are deleted in PostHog too (#24), within the 30-day deletion SLA |
| Session token | access token, refresh token and user record — proof of authenticated identity | Credential-equivalent | On iOS/Android, the Keychain/Keystore through `lib/secure-storage.ts` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, backup-excluded, cleared on a fresh install); on web, memory only (#218). Never AsyncStorage, never `localStorage` — see `docs/device-storage-policy.md` row 1 | Same | Until sign-out, or until a refresh is refused (revoked token, deleted account), which clears it |
| Caller IP | used for rate-limiting in `_shared/rate-limit.ts`, and for the scan outcome log in `_shared/scan-log.ts` (migration 0024). **A signed-in caller is rate-limited by account id (#241), and also by address against a looser ceiling shared by all signed-in callers on that address (`SIGNED_IN_PER_ADDRESS`, 5× the limit), so many accounts on one machine cannot multiply the allowance** — the account confirmed with Auth first, then HMAC'd into the same fingerprint, so `rate_limits` never holds a raw account id either; the refusal log line names `user:<id>` the way it names an address | PII under GDPR — a dynamic IP can identify a person even without being combined with other logs | Never persisted as an address. Held in-memory per Edge Function isolate, and as the same truncated HMAC fingerprint (`fingerprintCaller`) in both `rate_limits` and `scan_log`, both service-role only. The raw address reaches Edge Function logs on the request that first crosses the limit — once per caller per window globally when the shared counter refuses, once per isolate when a single isolate spends the whole allowance itself | Same | In-memory: isolate lifetime. Fingerprint in `rate_limits`: purged hourly, max ~25h. Fingerprint in `scan_log`: nulled hourly once the row is over a day old, same ~25h ceiling — the outcome counts around it live longer (see the `Scan outcome log` row below), but the fingerprint itself never outlives what this row already promises. Logs: the platform's own log retention |
| Label photo | photographed ingredient list, sent to `label-ocr` | Not stored — this is a fixed non-goal, see below | Stripped of EXIF/XMP/IPTC on the device and again on ingest, forwarded to Google Vision, response used, image discarded | No change | N/A — never persisted |
| Photo metadata | GPS coordinates, device identifier and capture timestamp, written into the file by the camera | PII, and the highest-consequence field in this table — a coordinate is a home address | Removed before the image leaves the handset and again in `label-ocr`, by `_shared/strip-metadata.ts` | No change | N/A — never persisted, and deliberately not promoted to a column |
| Scan outcome log | which scan path ran (barcode/label), the outcome (resolved, not found, refused by the quality gate, image too large, upstream failure, …), and for a label read, how many names were parsed and how many resolved against the ingredient dictionary — the measurement issue #236 exists to produce, ahead of #214 flipping the label path to primary. No ingredient name, product name, barcode or image is stored | Low sensitivity for the outcome/count fields alone (they identify no one and name no product); the caller fingerprint attached to each row is the same PII discussed in the Caller IP row above | `scan_log`, service-role only (migration 0024) | No change | Fingerprint: nulled after 1 day (see Caller IP row). Full row (fingerprint already null): purged after 30 days |

Nothing above is a face, skin, or body photograph. None currently exists.

**Deleting an account (#24):** `delete-account` deletes the auth user, and
with it by cascade every row the account owns, immediately; an Apple-linked
account's grant is revoked first. It then asks PostHog to delete the
account's analytics person and events, which can fail without undoing the
deletion (it is logged for the operator). Stated SLA: everything gone within
30 days, analytics included. Production is on Supabase's Free plan, which
takes no backups, so no backup copy of a deleted account exists; on the Pro
plan, daily backups would keep it for up to 7 days, still inside the promise.
Details in `docs/privacy-disclosures.md` ("Backups").
The full wording of the promise is there.

`Scan history` above is also this app's recommendation history — every
scored product view is already captured there, so issue #13's separate
mention of "recommendation history" isn't a distinct data type here. No
second table is planned; if that ever changes, it gets its own row.

## 2. Trust boundaries

- **Device ↔ AsyncStorage.** Today's real boundary: anything here survives
  app data extraction on a lost or shared device. Currently unencrypted, and
  also copied into Android's default `allowBackup` and iOS device/iCloud
  backups — see `docs/device-storage-policy.md` for the trigger to revisit
  this.
- **Device ↔ camera/image-manipulation cache** (issue #27). `takePictureAsync`
  and, since #16, `expo-image-manipulator`'s crop step each write a photo of
  the ingredient label to the app's cache directory — and neither Expo
  library deletes its own file afterward, confirmed against the Expo
  community's own documented experience with exactly this. Left alone, every
  scan leaves up to two copies of a label photo sitting in cache
  indefinitely.

  The platform defaults on that cache directory are better than they look
  and needed no code to get: iOS gives a newly-created third-party-app file
  `NSFileProtectionCompleteUntilFirstUserAuthentication` since iOS 7 with no
  entitlement required, and Android's app-specific cache has been encrypted
  via File-Based Encryption by default since API 29. Neither is something
  Expo's file APIs expose control over, and neither needed to be touched —
  what actually needed fixing was that the files existed at all past the
  point they were still needed. `app/scan-label.tsx` now deletes both in a
  `finally` block covering every exit path (success, every failure branch,
  and the outer catch), so a photographed label has no reason to outlive the
  scan that took it.
- **Client ↔ backend (Supabase).** Anon key today; will carry a session token
  once accounts exist. This is where every RLS policy does its work.
- **Backend ↔ Google Vision.** One image per label scan, in transit only.
  Response text is trusted only as far as `label-ocr`'s existing parsing
  guards go.

  Outbound, this is the boundary the app's most sensitive field crosses, and
  it is the one place where "we never store photos" buys nothing: a camera
  writes GPS coordinates into the file, so until issue #22 the image handed
  to Google carried the user's location whether or not we kept a copy.
  `label-ocr` now strips every metadata container before the call, and the
  client strips before the upload — see the non-goals below for why the
  server pass is the control and the client pass is not.

  **Saving a read list.** `label-ocr` answers a photo with the parsed list and
  a signed `readToken`; saving takes that list back with a barcode and a name.
  The token proves the list came out of a (rate-limited) read, was not edited,
  and is under 30 minutes old. It is single-use: the first save records it
  (`used_read_tokens`, migration 0023) and any later save with it is refused, so
  one read cannot be replayed into many catalogue entries. It is deliberately not
  bound to a barcode — the barcode is asked for after the photo — so the one save
  it allows can go under any barcode nobody has claimed yet. The list is
  still a real read, and an existing entry is never replaced by a later save:
  `label-ocr` saves insert-only, and the database function leaves a product that
  already has ingredients alone, serialising two saves on one barcode with an
  advisory lock.

  *The 30-minute window is about to be exercised differently (#214).* Today the
  save follows the photo almost immediately, so the deadline is slack nobody
  notices. #214 makes the label photo the main scan path and shows the verdict
  **before** asking anything, which turns saving into an optional follow-up the
  user reaches after reading a result — minutes later, not seconds. The security
  properties are unchanged (single-use, unedited, rate-limited, not bound to a
  barcode), and the window is deliberately not being widened here; what changes
  is that an expired token becomes a case real users will hit rather than an
  edge, so the save path has to fail as a plain "scan it again" rather than as
  an error. #214's own body flags the same thing against `readTokenDeadline`.

  **What happens to the image once it's there (issue #16).** This was an
  open question — `.claude/claude-security-guidance.md`'s AI/LLM section says
  outright "no AI/LLM features exist... revisit this section then, and
  confirm whether the third-party AI provider retains or trains on submitted
  images." That revisit never happened when OCR shipped. It has now:
  Google's own [Vision API Data Usage
  page](https://docs.cloud.google.com/vision/docs/data-usage) states it does
  not use submitted content to train or improve its models, and that the
  synchronous endpoint this app calls (`images:annotate` — not the async
  batch endpoints, which we don't use) processes the image in memory without
  writing it to disk; request metadata is logged briefly for abuse
  detection. Google's [Cloud Data Processing
  Addendum](https://cloud.google.com/terms/data-processing-addendum) is
  incorporated by reference into the standard GCP Terms of Service, which
  covers any GCP project the moment it's created — there is no separate
  contract to negotiate for API-key-only usage like this app's, so none has
  been. That is as far as this document can settle the question: **whether
  the standard, incorporated-by-reference DPA is *sufficient* for this
  project's obligations is not an engineering determination** — it depends
  on whether GDPR applies to this controller at all, whether the data is
  Art. 9, and whether the standard terms (sub-processor list, SCCs, transfer
  assessment) are adequate for that classification. That is issue #14's
  question, still open at time of writing. This document states the DPA is
  *in force*; it does not and cannot state that it is *adequate*.

  **Confirmed:** the Google Cloud project behind `GOOGLE_VISION_API_KEY`
  belongs to the project owner's own account, not a personal sandbox, an
  employer's org, or a borrowed key — which matters because these terms bind
  whoever holds the project, and the reasoning above only transfers if that
  holder is this project.

  **Send the minimum.** Until issue #16, the on-screen guide box in
  `app/scan-label.tsx` was decoration — `takePictureAsync` returns the full
  sensor frame regardless of what's drawn over it, so everything around the
  bottle (background, a hand, whatever else was in frame) went to Vision
  along with the label. `lib/crop-to-guide.ts` now maps that guide box
  through the camera preview's cover-fit scaling into the photo's own pixel
  coordinates, and `scan-label.tsx` crops to it (plus a small margin for
  imperfect framing) before anything is stripped or sent. This sits on top
  of, not instead of, the server-side caps in §6 — a crop that fails for any
  reason falls back to the uncropped photo rather than blocking the scan.

  **On-device OCR: evaluated, not adopted.** The privacy-preserving default
  would be to never send the image anywhere at all. Every on-device option
  (ML Kit wrappers, Vision-framework wrappers) is a native module, and a
  native module needs a real development build — this project does not use
  one, and stays on Expo Go instead. `label-ocr/handler.ts`'s own header
  comment already made this call when OCR shipped; this is that decision
  promoted from an implicit code comment to an explicit one.

  An earlier version of this reasoning also cited "no weekly re-signing on a
  physical iPhone" as the cost being avoided. That framing tied a durable
  architectural argument to a moving fact about Expo Go's own release cadence
  — Expo Go's App Store build tracks one SDK version at a time, so every SDK
  upgrade this project makes (SDK 57 as of writing) can put physical-device
  testing a step behind whatever Expo Go currently ships, independent of
  anything decided here. That is a real, ongoing cost of the Expo Go
  constraint itself, not a cost specific to on-device OCR — see `CLAUDE.md`'s
  Expo SDK section for the current state of that trade-off. The conclusion
  above does not change: on-device OCR still needs a development build
  either way, and this project still does not have one.

  **Revisit if a development build is ever adopted for some other reason**
  — at that point the calculus changes and on-device OCR is worth measuring
  for real, not just ruling out on architectural grounds.
- **Backend ↔ third-party product sources** (Open Beauty Facts, UPCitemdb,
  INCI API). Untrusted data in, already treated as such by the existing
  cascade and `source`/`verified` columns. Not a user-data boundary.
- **Backend ↔ object storage.** None exists. No bucket is provisioned, and
  none is planned while the no-photo-storage non-goal (§5) holds — confirmed
  directly for issue #23: no `.upload()`, no `createSignedUrl`, no Storage
  usage anywhere in this codebase, and no user accounts to scope access to
  in the first place. `products.image_url` is not a counterexample — it's a
  third-party catalogue-photo URL (Open Beauty Facts / the INCI API), never
  a user's own image, and hidden client-side regardless
  (`SHOW_SOURCE_PHOTOS`/`USE_SOURCE_PHOTOS`, both `false`).

  That's a goal ("no public URLs to user photos") with no mechanism behind
  it, which is exactly as useless the day a bucket *is* added as it is
  today — so the mechanism is written down now, before there's a bucket to
  retrofit it onto. **If that ever changes, the new bucket must have all
  five of these from day one**, not as a follow-up review:

  - **Signed URL TTL in minutes, not hours or days.** A long-lived URL
    pasted into a support ticket or a crash report is a standing
    unauthenticated leak for as long as it stays valid.
  - **No CDN/proxy caching of a signed response** — explicit `private,
    no-store` on the response, verified through whatever CDN actually sits
    in front of it, not just checked at origin. A cache that keeps serving a
    signed 200 after the signature expires is the standard way a "private"
    bucket leaks anyway.
  - **Object keys are random**, never sequential or derived from a user
    identifier. A guessable key turns one bug into full enumeration even
    behind otherwise-working auth.
  - **Bucket default-deny.** Access only through signing — never a public
    bucket relying on an obscure path standing in for real access control.
  - **Re-authorize at signing time, every time.** A valid session proves who
    is asking, not that they own the specific object being requested — that
    ownership check belongs at the signing call itself, not assumed from
    being logged in.
- **Backend ↔ Supabase with the service-role key.** The service-role key
  bypasses RLS entirely. Today it's used only for catalogue writes nothing
  user-owned touches. Once user tables exist, no code path may use the
  service-role key to read or write a user's row on that user's behalf —
  user-scoped operations go through the authenticated client role, not
  around it.

  **The one exception, and why it is safe: `delete-account` (#224).**
  Deleting an auth user needs the service-role key, so this function holds
  it. The user it deletes is taken from the caller's token, verified by
  Supabase Auth (`auth.getUser(token)`); the request body is read for one
  field only, an Apple authorization code, and anything it says about
  *who* is ignored — honouring a `user_id` would be an account-deletion
  IDOR. `supabase/tests/delete_account.test.ts` pins that no token and a
  forged token delete nothing and that a body naming another user is
  ignored; `npm run check:delete-account` runs the same against the
  deployed function on staging. The saved shelf cascades from `auth.users`,
  so the function never touches those rows itself.
- **Backend ↔ Apple (Sign in with Apple REST API, #224).** Deleting an
  Apple-linked account revokes the app's Apple grant first (App Store
  Guideline 5.1.1(v)). The Apple key (`APPLE_PRIVATE_KEY`, with
  `APPLE_KEY_ID`, `APPLE_TEAM_ID`, `APPLE_CLIENT_ID`) lives only in the
  function's environment — never an `EXPO_PUBLIC_` value — and signs a
  five-minute client secret per request. Apple receives a one-time
  authorization code the person just approved and nothing else about them.

## 3. Attackers in scope

- **Another authenticated user**, reaching for a profile, history entry, or
  saved list that isn't theirs — by guessing an id, replaying a request, or
  a client bug that sends the wrong id. This is the primary attacker RLS
  exists for.
- **Someone with the device** — lost, shared, or rooted — reading
  AsyncStorage directly. Relevant today, not just after accounts.
- **A network attacker** between client and backend. Standard TLS
  assumptions apply; nothing here changes that.
- **A compromised or hostile third-party product feed**, feeding bad data
  into the shared catalogue. Already scoped by the existing `source`/
  `verified` design; noted here only for completeness.

**Not in scope:** a compromised Supabase project itself, a malicious
Anthropic-tooling supply-chain attack, or physical compromise of Google's
Vision infrastructure. These are treated as out of this app's threat model.

## 4. The isolation decision

Per-user isolation is enforced by construction, not by discipline:

- **Every user-owned table carries a `NOT NULL` owner column** (`user_id
  uuid not null references auth.users`) set from the verified session
  server-side. The client never supplies a user id as a parameter — identity
  comes from the session only, the same rule
  `.claude/claude-security-guidance.md` already states for a hypothetical
  backend and which now has a real target.
- **RLS policies are written in the same migration that creates the table,**
  and enforced with both clauses, not just one: `USING` controls row
  visibility and which existing rows can be updated or deleted; `WITH CHECK`
  validates inserts and updates, so a user cannot reassign a row's ownership
  by writing someone else's id into it. Both are keyed off the same
  centralized session-verification path, never a client-supplied id. Not a
  follow-up, not a "phase 2" — a user-owned table is not merged without its
  policies. Deny by default — a table exists in a non-readable state until
  its policy says otherwise, mirroring how the catalogue tables already
  default-deny writes.
- **The service-role key is never used as a shortcut for a user-scoped
  operation.** It stays reserved for what it's used for today: catalogue
  writes nothing user-owned touches. If an Edge Function needs to act on a
  user's data, it does so with that user's verified session, not the
  service-role key.
- **Defence in depth.** RLS is the floor, not the whole answer — application
  code should not assume a missing policy will be caught elsewhere, but
  neither should it skip RLS on the assumption the application layer already
  checked.

## 5. Non-goals (written down on purpose)

- **No photo storage, ever.** Label images are processed in memory and
  discarded, as they are today. This includes never storing a thumbnail, a
  cached copy, or a "just in case" retry artifact.

  **Application-layer encryption at rest for photos (issue #27): evaluated,
  declined.** Per-user-key encryption protects data held in a store; there is
  no store. Adopting it now would mean building real key-management
  infrastructure — generation, secure storage, rotation, destruction, with a
  lost key meaning permanently unrecoverable data — for a category of data
  this non-goal already rules out keeping. **Revisit this specific decision**
  the same moment either of the two paths that could reopen it happens:
  photo storage stops being a non-goal, or the "No face or skin imagery"
  non-goal below is ever revisited. Either revision must include this
  decision, made against that feature's real backup and retention posture,
  not reused unchanged from here.
- **No image metadata reaches a third party.** Every metadata container —
  EXIF, XMP, IPTC, and any format-specific equivalent — is removed from a
  label photo before it leaves the device and again on ingest, by
  `supabase/functions/_shared/strip-metadata.ts`. Nothing recovered from it is
  promoted to a column: we do not retain the capture timestamp, the device
  identifier, or the coordinates in any form. A future feature that wants one
  of those adds an explicit column with a stated purpose; it does not read it
  back out of a file we were supposed to have cleaned.
- **No face or skin imagery**, now or after accounts. If a future feature
  wants this, it needs its own threat-model revision and its own regulatory
  review — it does not fall under what's approved here.
- **No third-party analytics or crash reporting that receives health-adjacent
  fields** (concerns, skin type, scan history) in identifiable form.

Recording these here is deliberate: it's what lets #23 and #28 (both
photo-*storage* hardening issues) be closed as not-applicable rather than
carried indefinitely, as long as this boundary holds.

**#22 was on that list and should not have been.** The others are about bytes
at rest, which the no-storage non-goal genuinely disposes of. #22 is not: the
metadata leaves the device and crosses a third-party boundary *in transit*,
and the absence of a bucket does nothing about that. It was a real gap for as
long as the list said otherwise, and it is fixed above by stripping rather
than by anything this section rules out. The lesson generalises — "we don't
store it" answers questions about retention, not about egress, so check which
kind an issue is before this section is allowed to close it.

**#21 was on it too, and only half belonged.** Two of its controls really are
discharged by having no storage: derivatives inheriting a parent object's ACL
needs derivatives, and re-encoding *before storage* needs storage. The rest of
it — proving the bytes are an image, and capping how big an image we will act
on — is about ingest, and ingest happens whether or not anything is kept. Those
are implemented; see §6.

**#27 the same way — only the server-side half was actually closed by this
non-goal.** No backend storage genuinely disposes of application-layer
encryption at rest, decided above. But #27 also asks about the on-device
cache, and a device's own filesystem is not the storage this non-goal is
about — a temp file sitting in `Camera`/`ImageManipulator` cache is neither
in memory nor discarded just because the *backend* never persists anything.
That half was a real, separate gap (two files per scan, never deleted) and
is fixed in Trust Boundaries above, not by anything this section rules out.

## 6. What we check before acting on a label photo

Every control here lives in `_shared/strip-metadata.ts` and is enforced in
`label-ocr` on every request, before the image reaches Google Vision.

- **Type is decided by structure, not by what the caller says.** Not the MIME
  type, not the extension, and not the magic bytes alone — `FFD8FF` prefixed
  to an archive is three bytes anyone can type. The file is accepted only if
  it walks as a real JPEG (a frame header *and* a scan) or a real PNG (`IHDR`
  first, at least one `IDAT`, `IEND`).
- **Dimensions are read from the header and capped**: 50 megapixels total,
  20,000 pixels on either side. This is the decompression-bomb defence, and
  the reason it is cheap: a 64000×64000 PNG is a few hundred bytes on disk and
  says so in its first 25 bytes, so the cost of refusing it is the header
  rather than the 4,096 megapixels it would expand to. The caps sit above any
  real phone camera (48 MP sensors are the current high end) and below
  anything a bomb needs.
- **Body size is capped before the body is read**, against `Content-Length`,
  rather than after `req.json()` has already buffered it. Supabase does not
  document a request body limit for Edge Functions, so there is nothing to
  delegate this to.
- **Anything after the end-of-image marker is discarded**, which is what
  removes an appended-payload polyglot.
- **Peak memory is bounded by the image.** The walker writes into a single
  preallocated buffer sized to the input, so a request costs about the size of
  the photo rather than a multiple of it.

**We deliberately do not decode and re-encode the image**, which #21 lists as
a control. The two things a re-encode is usually credited with — dropping
embedded payloads and killing polyglots — already fall out of the structural
rewrite above. What it would uniquely add is protection against an image
crafted to exploit a decoder, and we have no decoder: these bytes are walked
and handed to Google Cloud Vision. Re-encoding would mean opening the file
ourselves first, which moves that risk off Google's hardened decoder and onto
our own isolate — taking on a real exposure to spare a third party that is far
better equipped to absorb it. If a decoder ever does enter this path for some
other reason, revisit: the calculus only holds while we never open the file.

## What this changes right now, before accounts exist

- Skin profile and scan history are already health-adjacent and already
  live, unencrypted, in AsyncStorage. That's a real gap this document
  surfaces but doesn't fix — that issue is #12; see
  `docs/device-storage-policy.md`.
- `.claude/claude-security-guidance.md` describes an app with sessions and
  per-user rows. Until #26 rewrites it, treat this document as the accurate
  one where they conflict.

## Verification

Three real features, checked against this document before their first
migration ships:

- **Sign-in.** Account identifier and session token are classified above;
  storage mechanism is #12's scope, not created here — see
  `docs/device-storage-policy.md`.
- **Syncing the profile.** Owner column named, RLS policy required in the
  same migration, client never sends a user id.
- **Syncing the saved list.** Same requirements; also confirms the
  saved-products table doesn't leak into a public read policy the way the
  catalogue tables intentionally do.

If any of the three is ambiguous against this document, the document isn't
done. Once the first user-data migration is written, confirm it creates the
table and its RLS policies in the same file — that's the concrete test that
this changed anything.

**A policy is not verified until a negative test fails without it (issue
#17).** RLS failures are silent — a wrong policy doesn't error, it returns
another user's row, so "the migration includes an RLS policy" is not
evidence the policy does anything. When this was written there was no
`auth.users`-referencing table, no owner column, and no storage bucket
anywhere in `supabase/migrations`. Migration 0025 (#219) is the first
user-owned table and met the bar below: `supabase/tests/saved_shelf.test.sql`
runs in CI, and `npm run check:shelf-rls` runs the same checks on staging
with two real accounts. There is still no storage bucket. The requirement,
fixed here so it isn't relitigated per-migration:

- **Every migration that creates or alters a user-owned table must land a
  negative authorization test in the same PR** — user A cannot read,
  update, or delete user B's row — run directly against the database (a
  real Postgres client authenticated as each user, or the local Supabase
  RLS test harness), not only through the app's own queries. A query that
  never asks for another user's data proves nothing about whether the
  policy would stop it.
- **The same applies to the storage bucket**, whenever one is provisioned:
  a signed-URL or object-read test proving user A cannot obtain user B's
  object, alongside the five bucket rules already required above.
- **"Not found" vs. "forbidden" must be asserted, not just chosen.** §1's
  authorization guidance already picks a convention; the negative test is
  what confirms the code doesn't leak which one applies to a request for
  someone else's data.

This doesn't retroactively create tests for tables that don't exist —
nothing here is exempt from CLAUDE.md's aversion to speculative machinery.
It's the acceptance bar the *first* migration that adds one has to clear,
written down now so it's a review checklist item then, not a debate.
