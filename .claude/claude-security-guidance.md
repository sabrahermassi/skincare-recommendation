# Security guidance for [Skincare App Name]

## Authentication

- Protected API endpoints must require a valid session/token, checked centrally (e.g. Supabase Auth session, or middleware if using a separate backend). Do not roll custom auth checks per-route.
- If using Supabase Auth: rely on its session/JWT handling rather than hand-rolling token verification. Do not accept an algorithm supplied by the token itself.
- Token/session expiration must be validated — this is the library default; do not disable it.
- The verified session's user ID is the authenticated user's identity. This is the only trusted source of identity for a request.
- Never trust a client-supplied `userId` from request bodies, query parameters, or URL parameters. Every service function/query takes the user ID from the verified session, never from the request payload.
- If this app implements its own registration/login (rather than only using Supabase Auth or another managed provider), password hashing must use a modern algorithm (`bcrypt` or equivalent). Never store or log a plaintext password.

## Authorization and data ownership

- Every user-owned resource (quiz responses, skin profile, saved/recommended products, uploaded skin photos) must be scoped to the authenticated user server-side.
- A client-controlled resource ID must never be sufficient on its own to access another user's data — always combine it with the authenticated user ID in the query (or, if using Supabase, enforce this via Row Level Security policies rather than trusting application-layer checks alone).
- Do not introduce an endpoint, query, or Supabase RLS policy that allows one authenticated user to read, modify, or delete another user's quiz data, skin profile, photos, or recommendation history.
- Authorization checks must happen before returning or mutating protected data.
- Decide and document consistently whether "not found" and "belongs to another user" both return a generic `404` (avoids leaking existence of other users' records) versus a `403` — pick one and apply it consistently rather than mixing them.

## Skin health and personal data

- Quiz responses, skin type/condition history, and any uploaded skin photos are sensitive personal data — treat this with the same care as health data, even though it isn't a formal medical record.
- Uploaded skin photos are the single most sensitive data type in this app — they are biometric-adjacent images tied to an identified user. Apply extra scrutiny here: access control on storage (not just the database row), no public URLs to user photos, and explicit user consent/deletion controls.
- Do not log photo contents, quiz answers, JWTs/session tokens, `Authorization` headers, secrets, or database credentials — including in `console.log`, request logs, or error messages.
- Do not expose user data or internal implementation details through error messages, stack traces, or debugging output. Return generic error messages to clients for unhandled errors.
- Do not return raw database errors directly to API clients.
- Define a data retention stance: how long are quiz responses, photos, and recommendation history kept, and can a user delete their account and data entirely.

## Database security

- The application's database role should be scoped to what the app actually needs; avoid granting schema-owner or DDL privileges to the runtime credential.
- Database queries must preserve user-level data isolation (see "Authorization and data ownership" above) — this is the single most security-critical invariant in this codebase. If using Supabase, this means Row Level Security must be enabled and correctly scoped on every table containing user data — do not rely on the client only calling "safe" queries.
- Do not introduce raw/dynamically-constructed SQL from client-controlled input.
- Do not introduce a database operation that bypasses the intended authorization boundary (e.g. a client-side call using the service-role key instead of the authenticated user's session).

## Third-party product / affiliate data

- Product data pulled from any third-party feed or affiliate API is untrusted input once it crosses into this app — sanitize before rendering (avoid unescaped HTML/markup from external descriptions), and don't treat it as more trustworthy just because it's "our" data source.
- If product recommendations are ever personalized using a third-party service (e.g. an external matching/AI API), do not send more user data to that service than the specific request requires.

## AI / LLM features

No AI/LLM features exist in this codebase today (as of this writing). If one is added — e.g. AI-assisted skin analysis from photos, or LLM-generated recommendations — quiz/photo content sent to it needs the same isolation and no-unnecessary-retention treatment as everywhere else in this app. Revisit this section then, and confirm whether the third-party AI provider retains or trains on submitted images.

## Secrets and configuration

- Secrets (API keys, database URLs, JWT secrets if applicable) must come from environment variables — never hardcoded.
- Never commit `.env` files (should be gitignored). Watch for accidental secret leakage through other checked-in files (scratch request files, test fixtures with real tokens/keys embedded).
- Avoid exposing secrets through logs, error responses, tests, or generated files.

## Security review priorities

Beyond the categories above, also watch for: injection vulnerabilities (should be rare if using a query builder/ORM or Supabase client — flag any raw SQL or dynamic query construction), and changes that weaken an existing security boundary (rate limiting, CORS origin list, security headers, Row Level Security policies).
