# Device storage policy

Written against issue #12. Companion to `docs/threat-model.md`, which
classifies the data; this document says which storage mechanism holds each
class, per platform, and what enforces it.

## The rule

| Data class | iOS | Android | Web |
|---|---|---|---|
| Auth / session material (access token, refresh token, PKCE verifier, any credential-equivalent) | `expo-secure-store` (Keychain), `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | `expo-secure-store` (Keystore), backup-excluded | **Memory only.** Never `localStorage`, `sessionStorage`, IndexedDB, or a non-`HttpOnly` cookie |
| Skin profile and quiz answers, pregnancy status included — device only, for everyone; never sent anywhere | `expo-secure-store` (Keychain), `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (#189) | `expo-secure-store` (Keystore) | AsyncStorage (`localStorage`-backed by `react-native-web`): web has no Keychain and is not a release target |
| Scan history — device only, for everyone; never sent anywhere | AsyncStorage, at most 50 entries and 90 days (#189) | same | same |
| Saved products and saved ingredients — signed in, a cache of the account's shelf plus its queue of unsynced changes (#223); a pre-accounts shelf on a device never signed in | AsyncStorage (in `useAppStore`), cleared at sign-out | same | same |
| Journal note (#228) — free text the user wrote about a saved product | AsyncStorage, as part of the cached shelf; source of truth is `saved_products.note` on the server | same | same |
| UI-only state (onboarding flag, future filter state; the account ids that have seen the first-page welcome, #230 — its record is the account's `user_metadata`) | AsyncStorage | AsyncStorage | AsyncStorage |
| Analytics id and queued funnel events (#225) — PostHog's random id, and events waiting to send | PostHog SDK's own file in the app's document directory (`persistence: "file"`, via `expo-file-system`) — **not** AsyncStorage | same | **Memory only** (`persistence: "memory"`): the SDK's web store is `localStorage` |
| Cached catalogue data (product rows, ingredient dictionary, freshness watermark) | AsyncStorage | AsyncStorage | AsyncStorage (`localStorage`-backed by `react-native-web`) |
| Session-scoped state (the list a label photo just read, `lib/pending-label.ts`) | not persisted | not persisted | not persisted |

**Row 1 exists as of #218.** Sign in with Apple and Sign in with Google put
a Supabase session on the device, and `lib/secure-storage.ts` is where it
lives: the Keychain/Keystore on a phone, a memory-only map on web.
`lib/supabase.ts` sets `persistSession: true` and `storage` in the same
edit, and `__tests__/supabase-client.test.ts` pins the pair so neither can
change alone. Row 1 was written before there was anything to store, so this
PR followed it rather than deciding it — the checklist below is what it was
held to.

Accounts are in the MVP: a guest tier (scan, full verdict, device-only
history, no signup) and a signed-in tier (saved shelf, journal notes,
routine-step tagging), built in #217–#230. Two more steps land directly on
this file.

- **#223** points the saved shelf at the server. Settled in writing, as it
  asked: **the shelf's cached copy stays in `useAppStore`**, where
  `savedProducts` and `savedIngredients` already were, together with the
  queue of changes not yet pushed (`shelfQueue`) and the account the cache
  belongs to (`shelfOwner`). No third AsyncStorage file. The catalogue
  cache's reasons for a file of its own — public, identical per install,
  large — are all untrue of a shelf, and `data/catalogue-cache.ts` may hold
  nothing derived from the user. The network half goes through
  `data/api.ts` (`fetchShelf`, `pushShelf`); the rules are in
  `lib/shelf.ts`.
- **#222** decided what sign-out does to local data, which item 6 of the
  checklist below had left open: **the shelf is cleared; the profile and the
  history stay.** The shelf is the account's and leaves with it; one left on
  the phone would be carried into whichever account signs in next. Since
  #300 a signed-out person has a shelf of their own, saved on the phone and
  carried into the account at their next sign-in; sign-out starts it empty.
  The profile and scan history are the device's for everyone, signed in or
  not, so signing out never touches them. Queued shelf changes get one last
  push before a deliberate sign-out. Whatever still hasn't reached the
  server — offline at sign-out, or a session that ended on its own — is
  parked for that one account (`parkedShelf`): never shown, pushed when the
  same account next signs in on this phone, dropped if a different one
  does.
- **#228** adds a journal note to a saved product — free text the user wrote
  themselves, which is the most personal thing this app will hold. It has
  its own row in the table above (added with #219, which created the
  `note` column), rather than a corner of row 2. On the device it rides
  inside the cached shelf, so it is plaintext at rest like the rest of that
  row, behind the platform's file protection; it is never written anywhere
  else, never shared and never sent to analytics. The column caps it at 500
  characters.


## Why the profile moved to the Keychain, and the history didn't (#189)

The profile holds pregnancy status, which may be special-category health
data (#14), so on a phone it now sits in the Keychain beside the session,
where a backup or a copy of the app's files can't read it. What had kept it
out:

- **Size.** `expo-secure-store` has a practical per-value ceiling around 2KB
  on iOS, and the whole persisted store — shelf, up to 50 history entries —
  runs to roughly 7-8KB. The profile alone is a couple of hundred bytes, so
  it moved alone; the rest of the store stays in AsyncStorage.
- **Hydration.** `app/_layout.tsx` gates its render on one store's
  `useAppStore.persist.hasHydrated()`, and a second, differently-backed store
  would mean gating on two. The profile is still part of the one store:
  `formeStorageFor` in `store/useAppStore.ts` takes it out of each write and
  puts it back on each read, so `persist` sees one file and hydrates once.
- **Reinstalls.** Keychain items outlive the app. The store reads the
  profile only when its own AsyncStorage file exists, which never happens on
  a fresh install, so a previous install's profile never comes back; the
  first write replaces or removes it. It doesn't go through `claimOnce`,
  which waits for the store to hydrate — see `lib/secure-storage.ts`.

An existing profile moved on the first launch after the update (store v9),
and the plain-text copy was deleted then; `__tests__/profile-keychain.test.ts`
covers the move, a missing or corrupt Keychain value, a fresh install, and
"Delete my profile" reaching the Keychain copy.

**The consequence, accepted:** a profile never comes across to a new phone
through a backup or a phone-to-phone transfer — the Keychain item is
this-device-only. The person answers the four questions again. Recorded in
`docs/decisions.md`, "State".

The scan history stays in AsyncStorage: it is the larger part of the file,
and the ticket kept it there on purpose. It is capped at 50 entries and 90
days instead (`HISTORY_LIMIT`, `HISTORY_MAX_AGE_DAYS`), dropped when the app
starts and whenever the log is written.

The residual risk this leaves is real and worth naming rather than leaving
implicit: `docs/threat-model.md` §2 already establishes that on a running,
unlocked device this data sits behind the same platform-default file
protection as everything else in the app sandbox — iOS
`NSFileProtectionCompleteUntilFirstUserAuthentication`, Android File-Based
Encryption since API 29. What that baseline does **not** cover is backups:
**Android's `allowBackup` defaults to true**, and iOS includes AsyncStorage's
on-disk file in device/iCloud backups. Since #189 the profile is no longer in
that file on a phone, but the scan history (health-adjacent by inference),
the cached shelf and journal notes still are. That is the live exposure, and
this document is where it gets written down rather than left to be
rediscovered.

**Revisit trigger:** the first time this project moves off Expo Go onto a
development build (`android:dataExtractionRules` / `allowBackup`, iOS
`isExcludedFromBackup` all require a config plugin, which is inert in Expo
Go) — or the first store submission, whichever comes first. **#218 is that
move:** Sign in with Apple and the native Google module need a development
build, so the trigger has fired, and the backup exposure is now a live
question for #14/#24 rather than a future one. The actual
control belongs to issue #14 (regulatory determination) and #24 (retention),
which are where "health-adjacent data in a consumer cloud backup" gets
adjudicated; this document only names the gap and the trigger.

## Every item on the phone

What the app itself stores on a phone, where, for how long, and whether a
backup carries it. "Backed up" means iOS device/iCloud backups (and Android's
default `allowBackup`); a Keychain item marked `THIS_DEVICE_ONLY` never is.

| Item | What's in it | Where | Kept | Backed up |
|---|---|---|---|---|
| `forme.profile` | Skin profile: concerns, skin type, sensitivity, **pregnancy status** | Keychain, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (web: inside `forme-store`) | Until the person changes it or taps Delete my profile, which deletes it | No |
| `sb-<project>-auth-token` (and `.0`, `.1`, … chunks) | The sign-in session: access and refresh tokens, user record | Keychain, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (web: memory only) | Until sign-out or a refused refresh; wiped on a fresh install | No |
| `forme.secure.keys` | The list of session keys written, so a reinstall can delete them | Keychain, same setting | Until the next reinstall purge | No |
| `forme-store` → `history` | Scan history: product id or barcode, score and warning count at the time, when seen | AsyncStorage | At most 50 entries and 90 days since last seen; the person can remove entries or clear it | Yes |
| `forme-store` → `savedProducts`, `savedIngredients` | The saved shelf: product ids, when saved, formula version, routine step, journal note | AsyncStorage | Until removed; signed in, cleared at sign-out (the account keeps it) | Yes |
| `forme-store` → `shelfOwner`, `shelfQueue`, `parkedShelf` | Which account owns the shelf; shelf changes not yet synced | AsyncStorage | Until synced, or dropped at sign-out / account deletion | Yes |
| `forme-store` → `hasSeenOnboarding`, `secureStoreClaimed`, `journalStarted` | Flags: intro seen, this install cleared the Keychain, accounts that saw the first-page welcome | AsyncStorage | Until Delete my profile (the Keychain flag is kept) | Yes |
| `skintel-store` | The store's pre-rebrand name | AsyncStorage | Copied to `forme-store` and deleted on first read | Yes, until then |
| `forme-catalogue-v3`, `forme-catalogue-meta-v3`, `forme-catalogue-manifest-v3`, `forme-catalogue-chunk-…` | Public catalogue rows, the ingredient dictionary, freshness watermarks — nothing from the user | AsyncStorage (`data/catalogue-cache.ts`) | Replaced as the catalogue refreshes | Yes (public data) |
| PostHog's file | The analytics id and events waiting to send (#225) | The app's document directory (web: memory) | Until sent; a new id after sign-out | Yes |
| `for.me-account-export.json` | The account export, while it is being shared | The app's cache directory | Deleted once the share sheet closes (`lib/account.ts`) | No (cache) |
| Label photos | A picked or taken label photo and its resized copies | The app's cache directory | Deleted once read (`lib/pick-label-photo.ts`) | No (cache) |

## Why cached catalogue data is its own class, in its own file

Every other row in the table above is *the user's*. The catalogue cache is
not: it holds product rows and ingredient definitions that are public,
identical for every install, and re-downloadable at any time. Losing it costs
a spinner. Losing the skin profile costs the user their answers.

That difference is why it gets a second allowed file rather than a seventh key
inside `useAppStore`:

- **It is server state, not client state.** It goes stale on its own schedule
  and needs refetching, freshness checks and invalidation — machinery the
  profile never needs. The widely-followed split is to keep server caches out
  of the client-state store rather than reimplement that machinery inside it.
- **Store writes would churn.** `partializeState` serialises the whole
  persisted blob on change. Feeding ~937KB of catalogue through that path
  would make every unrelated profile edit pay for it.
- **The audit story stays intact.** The point of confining AsyncStorage to one
  file was never the number one — it was that every write site is known and
  reviewable. Two named files with stated, disjoint contents preserves that;
  an unreviewed third would not.

**The boundary, stated so it can be enforced:**
`data/catalogue-cache.ts` may persist catalogue rows, the ingredient
dictionary and freshness watermarks, and **nothing derived from the user** —
no profile, no saved shelf, no scan history, no free-text the user typed. If a
cache key would differ between two installs with the same catalogue, it does
not belong in this file.

**Size, and the open question it raises.** The persisted store is 7-8KB; this
cache is two orders of magnitude larger, and AsyncStorage deserialises a value
whole on read. That is the size class where AsyncStorage is known to hurt and
where MMKV is the usual answer — but MMKV cannot run in Expo Go, which is this
project's only device-testing path today (see the same revisit trigger above,
which it shares). Ship on AsyncStorage, measure the cold-start read, and let
that measurement decide; do not pay for a development build in advance.

## Why web tokens are memory-only, not an httpOnly cookie

An httpOnly cookie has to be set by a server on a response. This app has no
such server: `app.json` sets `web.output: "single"` — a static SPA — and
`CLAUDE.md` documents why `"static"` (which would prerender server-side) was
rejected outright, for an unrelated but load-bearing reason (it crashes the
camera screen). Supabase Auth from a browser SPA hands the client a JWT
directly; there is no intermediary that could turn it into a cookie today.
Proposing an httpOnly cookie here would be describing a feature this app
does not have a server for, not deferring one.

**The actual web stance: tokens live in memory only, for the tab's
lifetime.** A hard refresh or new tab means signing in again. That is a real
UX cost, accepted deliberately rather than defaulted into, and it stays true
until a server-rendered or server-backed session exists — at which point the
only acceptable upgrade is an `HttpOnly; Secure; SameSite=Lax` cookie set by
that server. Never `localStorage`, never `sessionStorage`, never IndexedDB.

Three caveats worth stating so nobody over-claims what this buys:

- **A memory-held token is still XSS-reachable.** Memory-only bounds the
  *window* of exposure to the tab's lifetime; it does not substitute for
  #30 (XSS scoped by target).
- **No cross-tab session sync.** Each tab authenticates independently — this
  is a consequence of the memory-only design and is accepted, not a bug to
  fix later.
- **OAuth on web will need `detectSessionInUrl: true`** (currently `false`),
  at which point the access token transits the URL fragment briefly before
  being stripped. Note it against #29/#30 when that lands; memory-only
  storage does not cover it.

## When authentication is added — the checklist that PR must satisfy

Met by #218, item by item, with two departures stated here so they are not
mistaken for drift:

- **Item 3's first-launch sentinel is a flag in `useAppStore`
  (`secureStoreClaimed`), not a new AsyncStorage key in
  `lib/secure-storage.ts`.** Writing the sentinel from the secure-storage file
  would have made it a third AsyncStorage file, which this policy does not
  allow without review. The flag is a plain boolean, never a token, so it sits
  within row 2's contents. Secure storage cannot list its own keys, so it
  keeps a manifest of what it wrote and deletes all of it when the flag is
  missing.
- **Item 3's interface is `authStorage`, not `secureStorage`/`StateStorage`.**
  The only consumer is the Supabase client, whose storage contract is three
  async methods; the Zustand type bought nothing. A session is larger than
  the ~2KB some iOS releases accept per item, so values are split across
  numbered keys.
- **Item 6 was left open by #218 and decided in #222:** sign-out clears the
  shelf and keeps the profile and history (see the #222 note at the top).

1. Add `expo-secure-store` at the version matching the installed Expo SDK
   (confirm with `npx expo install --check`, or read it directly out of
   `node_modules/expo/bundledNativeModules.json`) — do not assume a version
   from memory.
2. `app.json` plugins gain
   `["expo-secure-store", { "configureAndroidBackup": true, "faceIDPermission": "…" }]`.
   **This is inert in Expo Go** — it only takes effect through prebuild or a
   development build.
3. Create `lib/secure-storage.ts`. It is the only file permitted to import
   `expo-secure-store`, and it is added to the allowlist in
   `eslint.config.js` in the same commit. Interface:

   ```ts
   import { Platform } from "react-native";
   import type { StateStorage } from "zustand/middleware";

   /** False on web: expo-secure-store has no web implementation. */
   export const isSecureStorageAvailable = Platform.OS !== "web";

   /**
    * Zustand/Supabase-compatible storage backed by Keychain/Keystore.
    * Throws on web rather than falling back — a silent downgrade to
    * localStorage is the exact failure this module exists to prevent.
    */
   export const secureStorage: StateStorage;
   ```

   Required behaviors, each for a reason:
   - **Reads treat a decryption failure as a miss, not a crash.** After an
     Android restore-from-backup, Keystore entries are undecryptable and
     `getItemAsync` throws. Forcing re-auth is correct; crashing on launch
     is not.
   - **First launch after install purges SecureStore.** iOS Keychain items
     survive app uninstall; AsyncStorage does not. Write a sentinel key to
     AsyncStorage on first run and, if it is absent while Keychain entries
     exist, delete them — otherwise a reinstalled app resurrects the
     previous owner's token.
   - Values are strings; `createJSONStorage` works unchanged.
   - Keys use only `[A-Za-z0-9._-]` — `expo-secure-store`'s own restriction.
4. `lib/supabase.ts` passes `storage: secureStorage` on native and an
   explicit in-memory adapter on web. **Omitting `storage` on web is not
   sufficient** — `@supabase/auth-js` defaults to `globalThis.localStorage`
   when `persistSession` is true and no storage is supplied.
5. Sign-out clears **every** backing store it touches, not just the one the
   sign-out code happens to know about.
6. Whether sign-out also wipes the local skin profile is a product decision
   that must be made explicitly in that PR, not defaulted.
7. Token lifetime and refresh belong to #20 (session lifecycle), not here.

## What this does not cover

- Root/jailbreak narrows SecureStore's advantage over AsyncStorage on an
  *unlocked* device. Root/jailbreak detection is explicitly out of scope —
  see `.claude/claude-security-guidance.md`'s "Deliberately excluded" list.
- `no-restricted-imports` (the enforcement mechanism below) cannot catch a
  transitive dependency reaching AsyncStorage, or a string built at runtime
  to defeat static analysis.
- The Supabase anon key remains in the client bundle by design — that is
  #15's scope, not this document's.

## Enforcement

Two layers, because the rule is really two different failure modes:

1. **`eslint.config.js`** restricts `import`/`require`/dynamic-`import` of
   `@react-native-async-storage/async-storage` and `expo-secure-store` to
   their one approved file each, and restricts the bare and qualified forms
   of `localStorage`/`sessionStorage`. This catches someone reaching for the
   wrong primitive from a new file. `lib/secure-storage.ts` is exempt from the
   `expo-secure-store` ban only; its own block keeps it off AsyncStorage and
   `localStorage`.
2. **`__tests__/store.test.ts`** pins the exact key set `PERSISTED_KEYS`
   writes (to AsyncStorage, except the profile, which goes to the Keychain on
   a phone — `__tests__/profile-keychain.test.ts`), and asserts none of them
   look credential-shaped.
   This catches someone adding a new field to the *already-allowlisted*
   store that shouldn't be there — the lint rule can't see inside a file
   it's allowed to touch.
