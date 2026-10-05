# Dependencies: updates and advisories

Issue #33. How dependency updates and security advisories are handled.

## What's checked

- **CI (`ci.yml`)** runs `node scripts/check-audit.mjs` on every PR and push
  to `main`: a high or critical advisory in a runtime dependency fails the
  build, unless it is in the allowlist (below). It runs after typecheck, lint
  and tests, so a failing audit never hides them. A further step runs the full
  audit, dev tooling included, and only prints it.
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
- **Native libraries Expo pins are never taken from Dependabot either.**
  React, React DOM, React Native Web, AsyncStorage, Masked View, Gesture Handler,
  Reanimated, Worklets, Safe Area Context, Screens and SVG: Expo sets one
  version of each per SDK, and Expo Go only runs that one. They move in the
  SDK upgrade, with `npx expo install --fix`. A new dependency on that list
  (`node_modules/expo/bundledNativeModules.json`) is added to the ignore list
  in `dependabot.yml` in the same PR. Ignoring them may also hold back
  Dependabot's security PRs for them; the CI audit still fails on a high or
  critical advisory in any of them, and the rule below applies.
- **Developer tools' majors are never taken from Dependabot.** Jest (and
  `@jest/*`, `babel-jest`, `@types/jest`), Testing Library, `test-renderer`,
  ESLint, TypeScript and `@types/react`: a major changes how tests, lint or the
  typecheck run, and one grouped PR (#367) that took three of them at once
  failed the typecheck. Each is a planned upgrade on its own branch; their
  minors and patches still come through Dependabot.
- **An advisory that can't be fixed yet.** Fix it with a patch or minor
  bump, or an `overrides` pin in `package.json` if that fixes it. If the only
  fix is an SDK upgrade or a major we can't take, open an issue with the
  advisory ID; whether to upgrade or accept the risk until then is the owner's
  call. If the owner accepts it, add it to the allowlist below. Never lower the
  audit threshold to make CI pass.

## The audit allowlist

`audit-allowlist.json` is a list of high or critical advisories CI lets
through because no fix exists yet. `scripts/check-audit.mjs` reads it.

- **Each entry has four fields:** `id` (the GHSA ID), `package` (the package
  the advisory is about, as `npm audit` names it), `reason` (why it is safe
  to wait: how the package is reached and why it doesn't ship) and `expires`
  (`YYYY-MM-DD`, a real day). A missing field or a bad date fails the run.
- **30 days at most.** Set `expires` 30 days from the day the entry is added.
  The entry covers the advisory through that day; after it, the advisory fails
  CI again. To extend, re-check that there is still no fix, then change the
  date in a PR the owner approves.
- **Remove an entry as soon as a fixed version exists.** Dependabot brings the
  fix; delete the entry in the same PR. The script's output lists an entry that
  matches no current advisory, so a stale one is visible.
- **Only high and critical need an entry.** Lower severities never fail the
  build. Moderate and low are for the monthly review.
- **The output says what happened:** each allowed advisory with its reason and
  expiry, each failing one with the direct dependencies that pull it in, and an expired entry by name.
