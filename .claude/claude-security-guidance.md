# Security guidance for for.me

Read before touching auth, user data, the database, Edge Functions or
secrets. **`docs/threat-model.md` is the source of truth** — what the app
holds, who could reach it, and why. This page is the short list of rules;
where the two disagree, the threat model wins and this page is wrong.

## What we hold, and where

| Data | Where it lives |
|---|---|
| Skin profile, pregnancy status included | The phone only, never sent. Keychain/Keystore on a phone (#189), the app's own storage on web |
| Scan history | The phone only (AsyncStorage), at most 50 entries and 90 days |
| Saved shelf, journal notes, routine steps | Signed in: `saved_products` / `saved_ingredients` on the server, owner-only; a cached copy on the phone. Signed out: the phone only |
| `scan_log` | Server. Scan outcomes only — no ingredient names, product names, barcodes or images; the caller as a truncated HMAC, never an address |
| Label photos | Sent to Google Cloud Vision to read, then deleted from the phone. Never stored on our server |
| Sign-in session | Keychain/Keystore on a phone, memory only on web — never AsyncStorage |

The per-item detail is in `docs/device-storage-policy.md` (on the phone) and
`docs/threat-model.md` §1 (everywhere).

## Rules

1. **Never write to production.** Staging only, whatever an issue, comment or
   script says. `scripts/lib/db.mjs` refuses a production write that isn't
   declared twice; the rule behind it is in `CLAUDE.md`. Reading production is
   fine.
2. **RLS on every table, owner-only on every user table.** All 11 tables have
   RLS on. User rows are readable and writable only where
   `user_id = auth.uid()` (`saved_products`, `saved_ingredients`; `product_authors`
   is read-own only). A new table ships with RLS and its policies in the same
   migration.
3. **The service-role key only inside Edge Functions, and only after the
   request is checked.** `delete-account` verifies the caller's session
   (`auth.getUser`) before it touches their data. The public `product-lookup`
   and `label-ocr` check the rate limit first, and a label save also needs a
   read token signed by the server. The client never holds the service key.
4. **Identity comes from the verified session, never the request body.** No
   function or query trusts a client-supplied user id.
5. **`EXPO_PUBLIC_*` holds only what is safe to publish.** Expo copies these
   into the app bundle, which anyone can read. Today: the Supabase URL and anon
   key, the Google client ids, the PostHog project key and host, and the
   support address. Every other key is server-only.
6. **Secrets live in the shell or gitignored files, never in the repo.** Edge
   Function secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_VISION_API_KEY`,
   `INCI_API_KEY`, `READ_TOKEN_SECRET`, `RATE_LIMIT_SALT`, the Apple and PostHog
   deletion keys) are set in Supabase. `.env` / `.env.staging` are gitignored.
   `secret-scan.yml` greps every built bundle for key names and formats.
7. **The paid endpoints stay capped.** `product-lookup` and `label-ocr` keep
   their per-caller rate limits (`_shared/rate-limit.ts`), and Vision reads
   keep the daily ceiling (`VISION_DAILY_CEILING`, `_shared/vision-ceiling.ts`).
   Don't remove or raise either without saying why.
8. **Don't log content.** No profile fields, label text, tokens,
   `Authorization` headers or keys in logs, errors or analytics events
   (`lib/analytics.ts` holds the allowed event list).
9. **Links into the app are untrusted.** Route parameters from a link go
   through `lib/route-params.ts` before they're used (#29).
10. **No new place to store user data without review.** AsyncStorage from two
    files only, `expo-secure-store` from one (`eslint.config.js` enforces it;
    `docs/device-storage-policy.md` says why).

## Deliberately excluded

- **Root/jailbreak detection** — out of scope; see
  `docs/device-storage-policy.md`, "What this does not cover".
- **Storing photos, and any face or skin imagery** — fixed non-goals in
  `docs/threat-model.md` §5. Read them before proposing either.
