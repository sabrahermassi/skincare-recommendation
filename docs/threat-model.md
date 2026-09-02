# Threat model and data classification

Written against GitHub issue #13. This is the document that has to exist
before any migration creates a user-owned table — it is the input to #14
(regulatory determination), #12 (token storage) and the account-lifecycle
work (#19, #20), and it is what `.claude/claude-security-guidance.md` should
be rewritten against (#26) once it lands.

## Where this stands today

As of this writing, the backend holds a database but no user data:

- Four tables — `ingredients`, `products`, `product_ingredients`,
  `ingredient_synonyms` — all shared catalogue data. RLS is enabled on all
  four, with a public-read policy for `anon`/`authenticated` and no
  write policies; every write goes through the service-role key, server-side
  only, never from the client.
- There is no authentication anywhere in the app. No sign-in, no session, no
  token. The client holds the Supabase anon key only.
- There is no user-owned table. No owner column, no profiles, no quiz
  answers, no saved-product list, no scan history, on the backend.

But personal data already exists, just not on the backend: the Zustand store
(`store/useAppStore.ts`) persists skin profile — gender, age group, body
area, concerns, skin type, sensitivity — plus a 50-entry scan history, to
AsyncStorage, unencrypted, on-device. That is health-adjacent data, live
today, with zero accounts involved.

The product direction (confirmed while planning this doc): accounts with
cross-device sync are the destination for this data. Photos are never stored
server-side — label images already go to Google Vision in memory and are
discarded; no face or skin imagery is retained. Both are treated as fixed
constraints below, not defaults that might slide.

## 1. Data classification

| Data | What it is | Sensitivity | Lives today | After accounts | Retention |
|---|---|---|---|---|---|
| Skin profile | gender, age group, body area, concerns, base skin type, sensitivity | Health-adjacent | AsyncStorage, unencrypted, on-device | Synced row, owned by user id | Until account deletion |
| Quiz answers | the same fields, as collected during onboarding | Health-adjacent | Folded into skin profile above | Same as skin profile | Same as skin profile |
| Scan history | last 50 scans: product id, score, warning count, timestamp | Health-adjacent (reveals concerns by inference — a run of "avoid" verdicts on acne products implies acne-prone skin) | AsyncStorage, on-device | Synced row, owned by user id | User-configurable; default cap already exists (50 entries) client-side, needs a server-side equivalent |
| Saved products | list of product ids | Low sensitivity alone, but joins with scan history to reveal the same inferences | AsyncStorage, on-device | Synced row, owned by user id | Until account deletion |
| Account identifier | email or OAuth provider id | PII | Does not exist yet | Supabase Auth `auth.users`, referenced by every owner column | Until account deletion |
| Session token | proof of authenticated identity | Credential-equivalent | Does not exist yet | Short-lived, refreshable; storage mechanism is #12's problem, not this doc's | Session lifetime |
| Caller IP | used for rate-limiting in `_shared/http.ts` | Low sensitivity in isolation, PII under GDPR when combined with request logs | Held in-memory per Edge Function isolate, never persisted | Same, unless logging is added later | Ephemeral (isolate lifetime) |
| Label photo | photographed ingredient list, sent to `label-ocr` | Not stored — this is a fixed non-goal, see below | Forwarded to Google Vision, response used, image discarded | No change | N/A — never persisted |

Nothing above is a face, skin, or body photograph. None currently exists.

## 2. Trust boundaries

- **Device ↔ AsyncStorage.** Today's real boundary: anything here survives
  app data extraction on a lost or shared device. Currently unencrypted.
- **Client ↔ backend (Supabase).** Anon key today; will carry a session token
  once accounts exist. This is where every RLS policy does its work.
- **Backend ↔ Google Vision.** One image per label scan, in transit only.
  Response text is trusted only as far as `label-ocr`'s existing parsing
  guards go — this boundary is already handled and out of scope here.
- **Backend ↔ third-party product sources** (Open Beauty Facts, UPCitemdb,
  INCI API). Untrusted data in, already treated as such by the existing
  cascade and `source`/`verified` columns. Not a user-data boundary.
- **Backend ↔ Supabase with the service-role key.** The service-role key
  bypasses RLS entirely. Today it's used only for catalogue writes nothing
  user-owned touches. Once user tables exist, no code path may use the
  service-role key to read or write a user's row on that user's behalf —
  user-scoped operations go through the authenticated client role, not
  around it.

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

- **Every user-owned table carries an owner column** (`user_id uuid
  references auth.users`) set from the verified session server-side. The
  client never supplies a user id as a parameter — identity comes from the
  session only, the same rule `.claude/claude-security-guidance.md` already
  states for a hypothetical backend and which now has a real target.
- **RLS policies are written in the same migration that creates the table.**
  Not a follow-up, not a "phase 2." A user-owned table is not merged without
  its policies. Deny by default — a table exists in a non-readable state
  until its policy says otherwise, mirroring how the catalogue tables already
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
- **No face or skin imagery**, now or after accounts. If a future feature
  wants this, it needs its own threat-model revision and its own regulatory
  review — it does not fall under what's approved here.
- **No third-party analytics or crash reporting that receives health-adjacent
  fields** (concerns, skin type, scan history) in identifiable form.

Recording these here is deliberate: it's what lets #21, #22, #23, #27, and
#28 (all photo-storage hardening issues) be closed as not-applicable rather
than carried indefinitely, as long as this boundary holds.

## What this changes right now, before accounts exist

- Skin profile and scan history are already health-adjacent and already
  live, unencrypted, in AsyncStorage. That's a real gap this document
  surfaces but doesn't fix — worth its own tracked issue.
- `.claude/claude-security-guidance.md` describes an app with sessions and
  per-user rows. Until #26 rewrites it, treat this document as the accurate
  one where they conflict.

## Verification

Three real features, checked against this document before their first
migration ships:

- **Sign-in.** Account identifier and session token are classified above;
  storage mechanism is #12's scope, not created here.
- **Syncing the profile.** Owner column named, RLS policy required in the
  same migration, client never sends a user id.
- **Syncing the saved list.** Same requirements; also confirms the
  saved-products table doesn't leak into a public read policy the way the
  catalogue tables intentionally do.

If any of the three is ambiguous against this document, the document isn't
done. Once the first user-data migration is written, confirm it creates the
table and its RLS policies in the same file — that's the concrete test that
this changed anything.
