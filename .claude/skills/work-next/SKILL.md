---
name: work-next
description: Pick the next ready task from TASKS.md and drive it start to finish — implementation, staging DB writes, tests, PR, review loop — without merging. Use when the user says "work the queue," "/work-next", or asks what to do next from TASKS.md.
---

# Work Next

Autonomous task execution against `TASKS.md`. Runs as a **chain**: the user
gives a count (e.g. "scope me to five") or says "until the queue is empty";
each ticket in the chain builds on the previous one's branch, not on a
freshly-fetched `main`, so the chain never has to wait for a merge that only
happens the next morning. Never merge. Never touch production.

## 0. Session setup — once per chain, not per ticket

Before the first ticket:

- `git fetch origin main` and confirm the working tree is on latest `main`.
  This happens once, at the start of the chain — not before every ticket.
- Read Tier 1 (below) once. Keep it in context for the rest of the chain;
  do not re-read it per ticket.
- Confirm the chain's stopping condition with what the user actually said:
  a fixed count, or "until `code-ready` is empty." Track how many tickets
  are done against it.

### Tier 1 — once per chain

Cheap and scope-defining; skipping these is how a well-scoped ticket still
ships something outside the MVP.

- `CLAUDE.md` / `AGENTS.md` — already loaded automatically, but the
  guardrails in them (DB writes, routing, scoring constants) still have to
  actually be followed in step 3 for every ticket, not just skimmed once.
- `FOR_ME_MVP.md` and the **MVP Scope** artifact
  (https://claude.ai/artifact/2HSNkc3QUZPxMBREhWFhT2) — the NOT NOW list and
  the frozen product definition. A ticket that is well-defined in isolation
  can still expand something this page freezes (recommendations, social,
  routine builder, etc.) — check every ticket in the chain against what was
  read here once, since either doc can be the one that's current.
- `TASKS.md` — the queue mechanism itself.

If any ticket in the chain conflicts with the frozen scope or the NOT NOW
list, treat it the same as an ambiguous/undecided scope (step 2): stop that
ticket, relabel it `blocked-on-decision`, report why, don't implement around
it — but keep the chain going to the next ticket rather than aborting the
whole run.

## 1. Pick the next ticket

Query:

```
mcp__github__list_issues, state: OPEN, labels: ["code-ready"]
```

**Order by priority label, not issue number or age.** An issue may also
carry a `priority:P<N>` label (`priority:P0`, `priority:P1`, `priority:P50`,
any non-negative integer — the user sets these, not you). Lower N goes
first. `P0` beats `P1` beats `P2`, and gaps are fine and expected (the user
may use `P0`, `P10`, `P20` on purpose so a `P5` can be inserted later
without relabeling everything else) — sort numerically on N, never
lexicographically (`P2` before `P10`). An issue with no `priority:P<N>`
label sorts after every prioritized one, in `created_at` order among
themselves (the old default, now just the fallback for unprioritized
issues). Within the same priority number, also break ties by `created_at`.

Take the top of that ordering that isn't already done earlier in this chain
and isn't already in flight (check for an open PR whose branch/title
references its number via `mcp__github__list_pull_requests` — skip it if
one exists and it isn't this chain's own). If the list is empty — either at
the start or between tickets — that's the finish line: say so, report the
chain's summary, stop. Do not invent a task or fall back to an unlabeled
issue.

Comment on the issue noting you're starting it now, so a concurrent run
doesn't duplicate it.

**Branch point — this is what makes it a chain, not N separate runs:**
- **First ticket in the chain:** branch from `main` (`git checkout -b
  task/<short-slug> main`).
- **Every ticket after the first:** branch from the *previous ticket's
  branch tip*, not from `main` (`git checkout -b task/<short-slug>`, staying
  on the previous branch first). State this explicitly in the new PR's body:
  "Stacked on #<previous PR number> — do not merge before it."

## 2. Read the real scope

Read the issue body in full (`mcp__github__issue_read`). If it links an
artifact section (an anchor into MVP Scope / Feeding the Catalogue / Launch
Checklist), read that too via `Artifact`, `action: "read"` — the issue body
is the entry point, the artifact section is often the fuller spec.

If the scope turns out ambiguous, or needs an architecture/schema/product
decision the artifacts mark as open: stop this ticket, relabel it
`blocked-on-decision` (remove `code-ready`), report why rather than
guessing, and move on to the next ticket in the chain.

### Tier 2 — only when this ticket touches that area

Topic-triggered, the same way `CLAUDE.md` already treats `docs/decisions.md`
("read it for why, not before every task"). Match this ticket's area to the
doc before implementing — re-evaluate per ticket, since different tickets in
the same chain touch different areas:

| Ticket touches | Read |
|---|---|
| An area with a recorded incident or reversal | `docs/decisions.md` |
| Scoring (`lib/matching.ts`, `lib/rules.ts`, weights, bands) | `docs/scoring-validation-gaps.md` — so a known, already-accepted model disagreement isn't "rediscovered" as a bug and re-fixed |
| Ingredient data / the dictionary / coverage | `docs/ingredient-coverage.md` |
| `AsyncStorage`, the catalogue cache, anything under `data/catalogue-cache.ts` | `docs/device-storage-policy.md` |
| User data handling, anything user-facing about privacy | `docs/privacy-disclosures.md` |
| Auth, data isolation, anything security-adjacent | `docs/threat-model.md` |
| A Launch Checklist §3/§4 issue (`#146`–`#153` etc.) | The **Launch Checklist** artifact's own row for it (https://claude.ai/artifact/4oqtQu1QQLJT4K3aXSCwcH) — the row often carries context (staleness notes, superseding issues) the issue body doesn't |

Skip a row entirely if this ticket doesn't touch that area.

## 3. Implement

- Already on the right branch from step 1 (from `main` for ticket 1, from
  the previous ticket's branch for every ticket after).
- Follow `CLAUDE.md` and `AGENTS.md`.
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

Run the `self-review` skill against the diff — the diff for *this ticket
only*, not the accumulated stack (the previous ticket already went through
its own pass). For each finding:
- Fix it now if it doesn't require a schema/architecture/product decision.
- If it does, leave it and note it for the end-of-task report — don't guess
  at a decision that isn't yours.

Run `hygiene` if the task touched anything that could leave dead code behind
(removed a code path, replaced a component). Delete what it finds unused and
introduced by this change; leave pre-existing dead code alone unless the task
already touches it.

## 5. Push and open the PR

Push the branch, open the PR with `mcp__github__create_pull_request`, base
set to `main` for ticket 1 or to the *previous ticket's branch* for every
ticket after (matching step 1's branch point). Body: what changed, the
scope-source link, test/lint/typecheck results, a `## Open questions`
section listing anything from step 4 that needs the user's decision, and —
for every ticket after the first — "**Stacked on #<previous PR> — merge
that first.**" Do not merge, do not enable auto-merge.

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

Cap at 5 rounds. If still not clean after 5, stop this ticket and report
what's left rather than looping indefinitely — then continue the chain to
the next ticket regardless (don't let one stuck PR block the rest of the
stack from being built; it can be fixed once the user reaches it).

## 7. Report and continue the chain

Comment on the issue with the PR link (closing issues automatically via the
PR body's `Closes #N` is fine — the PR stays unmerged until the user acts,
so the issue only actually closes once they merge).

Then, without waiting for the user:
- If the chain's stopping condition isn't met yet (count not reached, or
  `code-ready` queue not empty), go back to step 1 for the next ticket,
  branching from *this* ticket's branch.
- If it is met, that's the finish line: stop, and give the user one summary
  covering the whole chain — every PR opened, in stack order, what got fixed
  in each across how many review rounds, and — plainly separated per PR —
  what could not be decided and needs their call.

## 8. After the user merges a PR from the stack (squash merges)

The user merges by squashing each PR into `main` one at a time, from the
bottom of the stack up, retargeting each next PR's base to `main` as they
go. A squash merge does not preserve the original commits, so the next
branch in the stack still thinks it needs the just-merged PR's commits —
simply retargeting its base is not enough on its own; it will show a
duplicate/stale diff until rebased.

When told a PR merged (or a subscribed PR event reports it), for the *next*
branch still in the stack:

1. `git fetch origin main`.
2. `git rebase origin/main` on that branch (resolve conflicts if the merged
   PR's review changes touched the same lines this branch also touches —
   unlikely between independent tickets, but possible).
3. Run `npm run typecheck && npm run lint && npm test` again after the
   rebase — a rebase can silently break something the pre-rebase run didn't
   catch.
4. Force-push: `git push --force-with-lease`.
5. Confirm the PR's base is `main` (the user may have already retargeted it;
   if not, do it) and that GitHub now shows only this ticket's own diff.

Do this for the next branch only — do not cascade-rebase the rest of the
stack preemptively; each one rebases in turn as the user reaches it, since
rebasing a branch that itself still has unmerged PRs stacked on it would
just have to happen again when *those* merge too.
