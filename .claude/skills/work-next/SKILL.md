---
name: work-next
description: Pick the next ready task from TASKS.md and drive it start to finish — implementation, staging DB writes, tests, PR, review loop — without merging. Use when the user says "work the queue," "/work-next", or asks what to do next from TASKS.md.
---

# Work Next

Autonomous single-task execution against `TASKS.md`. One task per run unless
told to loop. Never merge. Never touch production.

## 1. Pick the task

Read `TASKS.md`. Take the first row under **Ready** not already marked
`in-progress` or `done`, and not superseded by an already-open PR (check
`mcp__github__list_pull_requests` for a branch/title matching it first).

Skip anything under **Needs re-scoping**, **Blocked on a decision**, or **Not
code** — those are not this command's to start. If every Ready row is done or
in flight, say so and stop; do not invent a task.

Mark the chosen row `in-progress` in `TASKS.md`, commit that alone
(`docs: mark task N in-progress`), push directly to the base branch — this
is bookkeeping, not the task's own change.

## 2. Read the real scope

Follow the row's "Scope source" link before writing anything:
- An artifact URL → `Artifact` tool, `action: "read"`.
- A GitHub issue → `mcp__github__issue_read`.

The linked doc is the spec. `TASKS.md` is only the index. If the scope is
ambiguous or requires an architecture/schema/product decision the artifacts
mark as open, stop and report it rather than guessing — that decision goes
back to the user, per `TASKS.md`'s own "Blocked" section.

## 3. Implement

- Branch from the current base branch: `git checkout -b task/<short-slug>`.
- Follow `CLAUDE.md` and `AGENTS.md` — read them, they're already project
  instructions, not optional context.
- Any DB write goes through `connect({ write })` in `scripts/lib/db.mjs`,
  with `SUPABASE_ENV=staging` — never `--prod`, never production. If the
  task needs a schema change, write the migration file under
  `supabase/migrations/` and push it on its own commit; `staging-migrate.yml`
  applies it to staging automatically on push. Do not try to run migrations
  from this session directly — it cannot reach Postgres.
- `npm run typecheck && npm run lint && npm test` before every push, narrowed
  with `--` while iterating, full before the PR.
- If a route changed, regenerate types per the `CLAUDE.md` "no TTY" section.

## 4. Self-review and hygiene

Run the `self-review` skill against the diff. For each finding:
- Fix it now if it doesn't require a schema/architecture/product decision.
- If it does, leave it and note it for the end-of-task report — don't guess
  at a decision that isn't yours.

Run `hygiene` if the task touched anything that could leave dead code behind
(removed a code path, replaced a component). Delete what it finds unused and
introduced by this change; leave pre-existing dead code alone unless the task
already touches it.

## 5. Push and open the PR

Push the branch, open the PR with `mcp__github__create_pull_request`. Body:
what changed, the scope-source link, test/lint/typecheck results, and a
`## Open questions` section listing anything from step 4 that needs the
user's decision. Do not merge, do not enable auto-merge.

## 6. Review loop

Trigger both review tools on the PR:
- Comment `@claude review` (or invoke the `pr-review` skill directly against
  this PR — same contract, P0/P1 only).
- Comment `@codex review` if Codex is configured on this repo; skip silently
  if it isn't.

Wait for comments, then:
- Fix everything that doesn't need an architectural or schema decision; push.
- For anything that does, reply in-thread explaining why it's deferred, and
  add it to the PR's Open Questions.
- Re-trigger both reviewers on the new commit. Repeat until a round produces
  no new fixable findings.

Cap at 5 rounds. If still not clean after 5, stop and report what's left
rather than looping indefinitely.

## 7. Report and move on

Mark the `TASKS.md` row `done`, with the PR link, on its own commit pushed
directly to base (same as step 1's bookkeeping commit).

Give the user a short report: task, PR link, what got fixed across how many
review rounds, and — plainly separated — what could not be decided here and
needs their call. Then stop. Do not start the next task unless told to loop.
