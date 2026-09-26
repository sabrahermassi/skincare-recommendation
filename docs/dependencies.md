# Dependencies: updates and advisories

Issue #33. How dependency updates and security advisories are handled.

## What's checked

- **CI (`ci.yml`)** runs `npm audit --omit=dev --audit-level=high` on every
  PR and push to `main`: a high or critical advisory in a runtime dependency
  fails the build. A second step runs the full audit, dev tooling included,
  and only prints it.
- **Dependabot (`.github/dependabot.yml`)** opens update PRs: npm weekly,
  in at most two groups (Expo packages, everything else), five open at most;
  GitHub Actions monthly. Security-update PRs are a repository setting
  (Settings → Code security), separate from this file.

## Runtime vs dev-only

- **Runtime** is `dependencies` in `package.json`: code that ships inside the
  app. An advisory here can reach users.
- **Dev-only** is `devDependencies`: tests, lint, types and build tooling. It
  never ships, so its advisories are lower priority.
- **Not covered by either check:** the Edge Functions' Deno imports
  (`jsr:`/`npm:` specifiers in `supabase/functions/`). Review those by hand
  when a function changes.

## Who looks, and how fast

The repository owner reviews Dependabot PRs and advisories.

| What | When |
|---|---|
| Critical or high, runtime | Within a week |
| Everything else (moderate or low, or dev-only) | Once a month, with the grouped Dependabot PRs |

Before merging any update PR: `npm run typecheck && npm run lint && npm test`
pass in CI, and for an Expo or native package, `npx expo install --check`
agrees with the new version (Expo Go only runs the versions its SDK ships).

## Exceptions

- **Expo SDK majors are never taken from Dependabot.** `expo`, `expo-*`,
  `@expo/*` and `*-expo` majors, and React Native majors and minors, move
  only in a hand-made SDK upgrade, after checking which SDK the App Store's
  Expo Go runs (`CLAUDE.md`, "Constraints"; `docs/decisions.md`).
- **Tailwind stays on v3.** NativeWind's runtime needs it; v4 breaks styling
  without an error.
- **An advisory that can't be fixed yet.** Fix it with a patch or minor
  bump, or an `overrides` pin in `package.json` if that fixes it. npm has no
  way to ignore a single advisory. If the only fix is an SDK upgrade, open an
  issue with the advisory ID; whether to upgrade or accept the risk until
  then is the owner's call. Never lower the audit threshold to make CI pass.
