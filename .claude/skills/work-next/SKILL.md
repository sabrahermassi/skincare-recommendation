---
name: work-next
description: Pick the next ready task from TASKS.md and drive it start to finish — implementation, staging DB writes, tests, PR, review loop — without merging. Use when the user says "work the queue," "/work-next", or asks what to do next from TASKS.md.
---

# Work Next

Autonomous single-task execution against `TASKS.md`. One task per run unless
told to loop. Never merge. Never touch production.

## 1. Pick the task

Read `TASKS.md` for the mechanism (labels, not a static list). Query:

```
mcp__github__list_issues, state: OPEN, labels: ["code-ready"]
```

Take the oldest one not already assigned/in-progress (check for an open PR
whose branch/title references its number via
`mcp__github__list_pull_requests` first — skip it if one exists). If the
list is empty, say so and stop; do not invent a task or fall back to an
unlabeled issue.

Assign yourself is not available — instead comment on the issue
(`mcp__github__issue_write` isn't for comments; use the issue-comment tool)
noting you're starting it now, so a concurrent run doesn't duplicate it.

## 2. Read the real scope

Read the issue body in full (`mcp__github__issue_read`). If it links an
artifact section (an anchor into MVP Scope / Feeding the Catalogue / Launch
Checklist), read that too via `Artifact`, `action: "read"` — the issue body
is the entry point, the artifact section is often the fuller spec.

If the scope turns out ambiguous, or needs an architecture/schema/product
decision the artifacts mark as open: stop, relabel the issue
`blocked-on-decision` (remove `code-ready`), and report why rather than
guessing. Do not implement around an undecided question.

### Tier 1 — every ticket, before implementing

Cheap and scope-defining; skipping these is how a well-scoped ticket still
ships something outside the MVP.

- `CLAUDE.md` / `AGENTS.md` — already loaded automatically, but the
  guardrails in them (DB writes, routing, scoring constants) still have to
  actually be followed in step 3, not just skimmed here.
- `FOR_ME_MVP.md` and the **MVP Scope** artifact
  (https://claude.ai/artifact/2HSNkc3QUZPxMBREhWFhT2) — the NOT NOW list and
  the frozen product definition. A ticket that is well-defined in isolation
  can still expand something this page freezes (recommendations, social,
  routine builder, etc.) — check against both, since either can be the one
  that's current.
- `TASKS.md` — the queue mechanism itself, in case it's changed.

If the ticket conflicts with the frozen scope or the NOT NOW list, treat it
the same as an ambiguous/undecided scope above: stop, relabel
`blocked-on-decision`, report why, don't implement around it.

### Tier 2 — only when the ticket touches that area

Topic-triggered, the same way `CLAUDE.md` already treats `docs/decisions.md`
("read it for why, not before every task"). Match the ticket's area to the
doc before implementing:

| Ticket touches | Read |
|---|---|
| An area with a recorded incident or reversal | `docs/decisions.md` |
| Scoring (`lib/matching.ts`, `lib/rules.ts`, weights, bands) | `docs/scoring-validation-gaps.md` — so a known, already-accepted model disagreement isn't "rediscovered" as a bug and re-fixed |
| Ingredient data / the dictionary / coverage | `docs/ingredient-coverage.md` |
| `AsyncStorage`, the catalogue cache, anything under `data/catalogue-cache.ts` | `docs/device-storage-policy.md` |
| User data handling, anything user-facing about privacy | `docs/privacy-disclosures.md` |
| Auth, data isolation, anything security-adjacent | `docs/threat-model.md` |
| A Launch Checklist §3/§4 issue (`#146`–`#153` etc.) | The **Launch Checklist** artifact's own row for it (https://claude.ai/artifact/4oqtQu1QQLJT4K3aXSCwcH) — the row often carries context (staleness notes, superseding issues) the issue body doesn't |

Skip a row entirely if the ticket doesn't touch that area — reading all of
these on every ticket is exactly the noise Tier 1 is trying to stay out of.

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

Comment on the issue with the PR link (closing issues automatically via the
PR body's `Closes #N` is fine — the PR stays unmerged until the user acts,
so the issue only actually closes once they merge).

Give the user a short report: task, PR link, what got fixed across how many
review rounds, and — plainly separated — what could not be decided here and
needs their call. Then stop. Do not start the next task unless told to loop.
