---
name: pr-review
description: Review a pull request for serious defects only — logic, security, privacy, data boundaries, concurrency, and tests that do not test what they claim. Posts each finding as an inline comment, with a short judgment-call block for decisions a human must make. Skips style, formatting, naming, and refactor suggestions. Use when reviewing a PR in this repository.
---

# PR Review

Review the pull request for defects a maintainer must act on before merging.

Assume the code was written by someone else, and that it is wrong until the
code shows otherwise. Confidence that an implementation is correct because it
looks deliberate is the failure mode this review exists to prevent.

## Severity gate

Post only P0 and P1 as inline comments. Everything below that is noise.

- **P0** — data loss or corruption, a security or privacy hole, user-level data
  leaking across accounts, a crash on a path a user reaches, a scoring result
  that is wrong in a way that misleads someone about a product's safety.
- **P1** — a real defect with a concrete failure path: an unhandled edge case,
  a broken invariant, a migration that cannot roll forward, a test that passes
  whether or not the code under it works.

## Every finding needs a concrete scenario

State the specific input or state that triggers the finding, and the specific
wrong outcome it produces. A finding you cannot make concrete is not a finding.

This is the gate that separates a real defect from a plausible-sounding one.
Apply it before posting, not after: read the surrounding code again and confirm
nothing already prevents the scenario. Discard anything that does not survive.
A wrong finding costs the reader more than the finding was worth.

## Say whether the change caused it

Classify each finding as one of:

- **introduced by this change** — post it.
- **pre-existing, but this change makes it reachable where it was not before**
  — post it, and say so in the comment.
- **pre-existing and untouched** — do not post it. Mention it in the judgment
  block only if it is P0, and check whether a GitHub issue already tracks it.

Never blame the diff for a problem it did not create.

## What to inspect

- The complete diff against the base branch.
- The changed files in full, plus their direct callers and consumers. Follow a
  data flow out of the diff when the diff alone cannot tell you whether it is
  safe. Do not survey the rest of the codebase.
- The tests covering the changed behavior, and whether they would fail if the
  implementation were wrong. A test that asserts an outcome reachable by
  another route proves nothing — check that the assertion actually depends on
  the code under it.
- `CLAUDE.md` and `AGENTS.md` for this repository's rules, and
  `docs/decisions.md` when the change touches an area whose history it records.
  A change that contradicts a recorded decision is a finding.
- Database migrations, Supabase RLS policies, and Edge Function boundaries when
  touched — user-level data isolation is the highest-priority category in this
  codebase, per `.claude/claude-security-guidance.md`.
- Scoring changes against the arithmetic `CLAUDE.md` documents: a changed
  weight, threshold, or band that the named constants do not also carry, a
  hardcoded cutoff where `SCORE_BANDS` should be read, or a comedogenic check
  re-inlined instead of imported from `lib/safety.ts`.
- `migratePersisted` and the store version on any profile shape change. This is
  the one path that can silently corrupt real user data.

## What to ignore

Formatting, lint, import order, naming, file layout, comment wording, type
annotations that are merely looser than ideal, and any refactor that does not
fix a defect. CI covers the mechanical checks; a human chose the names.

Do not recommend a different structure because one is possible. Do not invent a
hypothetical problem to have something to report. Finding nothing is a valid
outcome and must not be padded.

## Output

**Inline comments** — one per P0/P1 finding, on the line it concerns:

> **[P0|P1]** What breaks. The input or state that makes it break. The fix.
> (If pre-existing-but-now-reachable, say so in one clause.)

**Judgment calls** — at most one short comment at the end, only if there is
something real that is not a defect: a tradeoff with no right answer, a
decision that changes the product, a P0 the diff did not cause. Three bullets
maximum, one line each. Omit the block entirely when there is nothing.

Nothing else. No summary, no list of what is correct, no restatement of what
the change does, no praise. Do not approve, merge, or push commits.

If nothing survives verification and there are no judgment calls, reply
`No issues found.` and stop.
