# Device storage policy

Written against issue #12. Companion to `docs/threat-model.md`, which
classifies the data; this document says which storage mechanism holds each
class, per platform, and what enforces it.

## The rule

| Data class | iOS | Android | Web |
|---|---|---|---|
| Auth / session material (access token, refresh token, PKCE verifier, any credential-equivalent) | `expo-secure-store` (Keychain), `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | `expo-secure-store` (Keystore), backup-excluded | **Memory only.** Never `localStorage`, `sessionStorage`, IndexedDB, or a non-`HttpOnly` cookie |
| Skin profile, quiz answers, scan history, saved products, saved ingredients, product suggestions | AsyncStorage | AsyncStorage | AsyncStorage (`localStorage`-backed by `react-native-web`) |
| UI-only state (onboarding flag, future filter state) | AsyncStorage | AsyncStorage | AsyncStorage |
| Session-scoped state (compare tray, pasted ingredient list) | not persisted | not persisted | not persisted |

**None of row 1 exists yet.** There is no sign-in, no session, and no token
anywhere in this app. Row 1 is written before there is anything to store,
because the alternative is deciding it inside the pull request that adds
authentication — where the path of least resistance is `persistSession: true`
and no second thought, and that path is wrong.

## Why the profile and scan history stay on AsyncStorage

The tempting alternative is moving all of it into `expo-secure-store`. Two
things rule that out as stated, not as a matter of taste:

- **Size.** `expo-secure-store` has a practical per-value ceiling around 2KB
  on iOS. The persisted payload today — profile, onboarding flag, saved
  products and ingredients, and up to `HISTORY_LIMIT` (50) scan-history
  entries — runs to roughly 7-8KB. It does not fit.
- **Hydration.** `app/_layout.tsx` gates its render on one store's
  `useAppStore.persist.hasHydrated()`. Splitting the profile into a second,
  differently-backed store means gating on two hydration completions instead
  of one, which is exactly the kind of machinery that reintroduces the
  onboarding-flash bug #2 already fixed once.

The residual risk this leaves is real and worth naming rather than leaving
implicit: `docs/threat-model.md` §2 already establishes that on a running,
unlocked device this data sits behind the same platform-default file
protection as everything else in the app sandbox — iOS
`NSFileProtectionCompleteUntilFirstUserAuthentication`, Android File-Based
Encryption since API 29. What that baseline does **not** cover is backups:
**Android's `allowBackup` defaults to true**, so the skin profile and scan
history are being copied into the user's Google Drive backup today, and iOS
includes AsyncStorage's on-disk file in device/iCloud backups. That is a
live exposure on health-adjacent data, introduced the moment #2 shipped
persistence, and this document is where it gets written down rather than
left to be rediscovered.

**Revisit trigger:** the first time this project moves off Expo Go onto a
development build (`android:dataExtractionRules` / `allowBackup`, iOS
`isExcludedFromBackup` all require a config plugin, which is inert in Expo
Go) — or the first store submission, whichever comes first. The actual
control belongs to issue #14 (regulatory determination) and #24 (retention),
which are where "health-adjacent data in a consumer cloud backup" gets
adjudicated; this document only names the gap and the trigger.

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
   wrong primitive from a new file.
2. **`__tests__/store.test.ts`** pins the exact key set `PERSISTED_KEYS`
   writes to AsyncStorage, and asserts none of them look credential-shaped.
   This catches someone adding a new field to the *already-allowlisted*
   store that shouldn't be there — the lint rule can't see inside a file
   it's allowed to touch.
