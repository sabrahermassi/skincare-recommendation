---
name: work-next
description: Pick the next ready task from TASKS.md and drive it start to finish — implementation, staging DB writes, tests, PR, review loop — without merging. Use when the user says "work the queue," "/work-next", or asks what to do next from TASKS.md.
---

# Work Next

Autonomous task execution against `TASKS.md`. Runs as a **chain that does
not stop until the whole `code-ready` queue is implemented** — not a batch
of five, not a count the user has to set. Every remaining ticket gets built
and stacked on the one before it, each branching off the previous ticket's
branch rather than a freshly-fetched `main`, so the chain never waits for a
merge that only happens the next morning. Never merge. Never touch
production.

There is exactly one finish line: **no `code-ready` ticket is left that
isn't already in flight.** Nothing else ends the run — not a stuck PR, not
a ticket that turns out to need a decision, not a review loop that hits its
round cap. Each of those is handled in place and the chain moves to the
next ticket (steps 2, 7 and 8 say how).

## 0. Session setup — once per chain, not per ticket

Before the first ticket:

- `git fetch origin main` and confirm the working tree is on latest `main`.
  This happens once, at the start of the chain — not before every ticket.
- Read Tier 1 (below) once. Keep it in context for the rest of the chain;
  do not re-read it per ticket.
- Note how many `code-ready` tickets there are to begin with, so the final
  summary can account for every one of them. This is a count to report
  against, not a limit to stop at.

### Tier 1 — once per chain

Cheap and scope-defining; skipping these is how a well-scoped ticket still
ships something outside the MVP.

- `CLAUDE.md` / `AGENTS.md` — already loaded automatically, but the
  guardrails in them (DB writes, routing, scoring constants) still have to
  actually be followed in step 4 for every ticket, not just skimmed once.
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

**Use the `gh` CLI for every GitHub read/write in this skill, not an MCP
tool.** No GitHub MCP server is configured in this repo (no `.mcp.json`, no
`mcpServers` entry anywhere in the settings cascade) — `gh` is the only
GitHub access this session actually has, and it's what every other workflow
in this repo already uses.

Query:

```bash
gh issue list --repo <owner>/<repo> --state open --label code-ready \
  --json number,title,labels,createdAt
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
references its number — `gh pr list --repo <owner>/<repo> --state open
--json number,title,headRefName` — skip it if one exists and it isn't this
chain's own). If the list is empty — either at the start or between
tickets — that's the finish line: say so, report the chain's summary, stop.
Do not invent a task or fall back to an unlabeled issue.

Comment on the issue noting you're starting it now, so a concurrent run
doesn't duplicate it: `gh issue comment <n> --repo <owner>/<repo> --body
"Starting this now via /work-next."`

**Branch point — this is what makes it a chain, not N separate runs:**
- **First ticket in the chain:** branch from `main` (`git checkout -b
  task/<short-slug> main`).
- **Every ticket after the first:** branch from the *previous ticket's
  branch tip*, not from `main` (`git checkout -b task/<short-slug>`, staying
  on the previous branch first). State this explicitly in the new PR's body:
  "Stacked on #<previous PR number> — do not merge before it."

## 2. Read the real scope

Read the issue body in full: `gh issue view <n> --repo <owner>/<repo> --json
body,title,labels`. If it links an artifact section (an anchor into MVP
Scope / Feeding the Catalogue / Launch Checklist), read that too via
`Artifact`, `action: "read"` — the issue body is the entry point, the
artifact section is often the fuller spec.

If the scope turns out ambiguous, or needs an architecture/schema/product
decision the artifacts mark as open: stop this ticket, relabel it
(`gh issue edit <n> --repo <owner>/<repo> --add-label blocked-on-decision
--remove-label code-ready`), report why rather than guessing, and move on
to the next ticket in the chain.

**A Definition of Done that needs a real device or another manual check is
not a reason to block the ticket.** Some tickets can be fully implemented
here but not fully *verified* here — #180's "real-iPhone cold start" is the
standing example, and a production-database step is another. Build it,
open the PR, and put the unverifiable part in part 4 of the report ("what I
need from you") in step 8. Don't relabel it `blocked-on-decision`, don't
skip it, and don't claim in the PR that the check passed. Say plainly in
the PR body which part of the Definition of Done is met by the code and
which part is still waiting on the user's check.

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

## 3. Deep-dive pass — only for architecture/schema/data-model-critical tickets

`ultrathink` and plan mode are both triggered by something the user types —
neither can be switched on from inside a skill, and the session's own model
can't be changed from here either (`/model` is a user-side CLI command).
What *is* available: the `Agent` tool takes a `model` parameter, so a
Sonnet-driven chain can hand this one step to Opus and carry on. That's the
intended setup — **Sonnet for the session, Opus for this step** — because
most tickets are mechanical and fast on Sonnet, while the ones this step
fires on are exactly where model judgment changes the outcome.

**Do this pass if the ticket matches any of:**
- Touches or adds a file under `supabase/migrations/`.
- Changes a constant or the arithmetic in `lib/matching.ts` (`ANCHOR`,
  `FIT_LEVER`, any `*_SATURATION`, the score formula itself) or restructures
  `lib/rules.ts`.
- Is labeled `needs-scope` specifically because it's an architecture
  decision (e.g. catalogue-plan step 12's "server sort key" fork), not
  because its Definition of Done merely needs re-checking.
- Tier 1 flagged it as touching something the MVP Scope artifact or
  `FOR_ME_MVP.md` treats as a frozen/architectural boundary.

**Skip it for everything else** — most `code-ready` tickets are small and
well-defined precisely so this pass isn't needed; running it on every
ticket would slow the chain for no benefit on the tickets that don't need
it.

**When it applies — delegate the thinking to Opus, then implement it
yourself:**

```
Agent(
  subagent_type: "Plan",
  model: "opus",
  run_in_background: false,
  description: "Deep-dive <ticket>",
  prompt: "<self-contained brief — see below>"
)
```

`Plan` is the right agent type: it's the architect agent, and its toolset
is read-only, so it physically cannot edit code while it thinks.
`run_in_background: false` because the next thing that happens depends on
its answer — there is nothing useful to do in parallel.

**The prompt has to be self-contained.** The subagent has none of this
conversation, none of Tier 1, none of the issue body. Write it as a brief
to a smart engineer who just walked in, including:
- The ticket: number, title, its Definition of Done, and the relevant part
  of the issue body or artifact section read in step 2.
- Which of the four trigger conditions above matched, since that says what
  kind of risk to look for.
- The repo facts that constrain the answer: `CLAUDE.md`'s rules for the
  area (scoring constants, the `data/api.ts` seam, `migratePersisted`, the
  DB write guard), and any Tier 2 doc already read for this ticket.
- What to come back with (below).

**Ask it for exactly this:**
1. Every place the change reaches — direct callers and consumers, not just
   the file named in the ticket. For a migration: every query, RLS policy
   and Edge Function touching that table. For a scoring constant:
   everywhere it's read plus the tests pinning its current value. For a
   data-model change: every screen and script that builds or reads that
   shape.
2. At least two real implementation approaches where more than one exists,
   with the trade-off between them stated plainly — not just the first one
   that comes to mind.
3. A recommendation, with the reason it beats the alternative.
4. What would make this change go wrong — the failure mode a reviewer
   would catch, or worse, wouldn't.

**Then:**
- Read its answer critically rather than adopting it wholesale. It saw a
  snapshot of the repo and none of this chain's history; if its
  recommendation contradicts something you know from Tier 1 or from an
  earlier ticket in this stack, you are the one who is right and its plan
  needs adjusting.
- Keep the resulting plan — what changes, why this approach over the
  alternative, what it touches. It becomes the PR body's design rationale
  in step 6, not a throwaway note.
- Only then go to step 4 and implement it.

If the `Agent` tool isn't available in the session, don't skip the step —
do the same four things directly, just without the model change.

## 4. Implement — no commit yet

- Already on the right branch from step 1 (from `main` for ticket 1, from
  the previous ticket's branch for every ticket after).
- Follow `CLAUDE.md` and `AGENTS.md`.
- Any DB write goes through `connect({ write })` in `scripts/lib/db.mjs`,
  with `SUPABASE_ENV=staging` — never `--prod`, never production. If the
  task needs a schema change, write the migration file under
  `supabase/migrations/`, staged for the commit in step 6 like everything
  else; `staging-migrate.yml` applies it to staging once that commit is
  pushed. Do not try to run migrations from this session directly — it
  cannot reach Postgres.
- `npm run typecheck && npm run lint && npm test` before moving on.
- If a route changed, regenerate types per the `CLAUDE.md` "no TTY" section.
- Do not commit or push yet — hygiene and self-review (step 5) run against
  this same uncommitted diff first, so the first thing pushed to GitHub is
  already past both passes.

## 5. Hygiene, then self-review — still no push

**Both are user-level skills (`~/.claude/skills/hygiene`,
`~/.claude/skills/self-review`), not part of this repo** — `.claude/skills/`
here only has `ingredient-data-audits` and `pr-review`. That's why this
works from a local session and not from a cloud one, which has no access to
the operator's `~/.claude/`. If a session gets here and either skill isn't
available: don't skip the pass silently — do it directly instead, the same
way step 3 falls back when the `Agent` tool isn't available. For hygiene,
that means the manual checks its own definition covers (knip/tsc unused-code
flags, dead components, orphaned imports); for self-review, a fresh
skeptical read of the diff for correctness, dead code, and missing tests,
in the diff's own words if the skill's isn't loaded. Note in the PR body
that the pass ran manually rather than via the named skill, so a reader
knows the coverage may differ slightly.

Two passes, in this order, against the working-tree diff from step 4
(re-diffed each time as fixes land, not the accumulated stack — the
previous ticket already went through its own pass):

1. **Hygiene.** Run it if the task touched anything that could leave dead
   code behind (removed a code path, replaced a component). Fix what it
   finds that's unused and introduced by this change; leave pre-existing
   dead code alone unless the task already touches it.
2. **Self-review.** Run the `self-review` skill against the diff (now
   including hygiene's fixes). For each finding: fix it now if it doesn't
   require a schema/architecture/product decision. If a finding does need
   a decision, leave it and note it — it becomes the PR's `## Open
   questions` section in step 6, since the PR doesn't exist yet.

Still no commit. Once both passes are done, `npm run typecheck && npm run
lint && npm test` one more time against the combined result, then move to
step 6 — implementation, hygiene's fixes and self-review's fixes all go up
together as the PR's first commit.

This same two-step sequence (hygiene, then self-review) runs again inside
the review loop below, on the diff each round produces — there it's after
a commit already exists, so each pass gets its own push; here there's
still nothing pushed at all until step 6.

## 6. Commit, push, open the PR

First commit for this ticket: implementation, hygiene's fixes and
self-review's fixes go up together, in one push. Open the PR now — base set
to `main` for ticket 1 or to the *previous ticket's branch* for every ticket
after (matching step 1's branch point):

```bash
gh pr create --repo <owner>/<repo> --base <base> --head <this-ticket-branch> \
  --title "<title>" --body-file <path>
```

Write the body to a scratchpad file first rather than passing it inline —
Body: what changed, the scope-source link, test/lint/typecheck results, a
`## Open questions` section for anything step 5 found that needed a
decision, and — for every ticket after the first — "**Stacked on #<previous
PR> — merge that first.**" Do not merge, do not enable auto-merge.

## 7. Review loop

Three reviewers, not two:
- Comment `@claude review` (or invoke the `pr-review` skill directly against
  this PR — same contract, P0/P1 only).
- Comment `@codex review` if Codex is configured on this repo; skip silently
  if it isn't.
- **CodeRabbit** — no repo config file exists for it, meaning it's installed
  as a GitHub App with defaults, which auto-reviews on PR open and on every
  push with no trigger comment needed. Don't comment `@coderabbitai review`
  unless it hasn't posted anything after a reasonable wait.

Wait for comments from all three, but **don't block a round on one that
never responds** — rate-limited or silent is normal for at least one of
these on any given round; act on whichever came back.

Each round:
1. Fix every finding that doesn't need an architectural or schema decision.
   Weigh severity the way the finding is actually marked, not by which tool
   raised it: a critical/P0-equivalent finding always gets fixed. A
   nitpick/cleanup-tier finding is optional — fix it if it's cheap and
   clearly right, otherwise leave it. A finding that isn't actually relevant
   (wrong, already handled, out of scope for this ticket) gets neither
   fixed nor deferred to Open Questions — just don't act on it.
2. For anything needing a decision, reply in-thread explaining why it's
   deferred, and add it to the PR's Open Questions.
3. Re-run hygiene, then self-review (step 5's sequence, including its
   fallback if either skill isn't available) on the resulting
   diff — a reviewer-prompted fix can introduce exactly the kind of thing
   those two catch.
4. Push. Re-trigger `@claude review` and `@codex review`; CodeRabbit
   re-reviews on the push automatically.

Repeat until a round produces no new fixable (relevant, non-nitpick, or
cheap-nitpick) findings — that's convergence, not necessarily silence from
every tool. Cap at 5 rounds regardless. If still not clean after 5, stop
this ticket and report what's left rather than looping indefinitely — then
continue the chain to the next ticket regardless (don't let one stuck PR
block the rest of the stack from being built; it can be fixed once the user
reaches it).

## 8. Report this PR, then continue the chain

### The per-PR report — write it now, not at the end

Write this **immediately after the PR's review loop finishes, before
picking up the next ticket**, while this ticket's context is still fresh.
Batching all the reports until the end of the chain mixes tickets up and
loses detail — that's the reason for doing it here.

Post it as a comment on the PR (that's where the user is standing when they
need it, walking the stack in the morning) and print the same text in the
session.

Exactly four parts, in this order:

```
## The issue
- <what was wrong / what was missing, 2-4 bullets>

## The fix
- <what changed, 2-5 bullets>

## Gaps — need your decision
- <anything not implemented because it needs a human call, or "None">

## Before merging the next PR — what I need from you
- <migration to run, script to run, phone check, anything manual, or "None">
```

Rules for writing it — these matter as much as the four headings:

- **Plain, easy English. Very short bullets.** A bullet is a line, not a
  paragraph.
- **Only what's true.** Nothing invented, nothing assumed, nothing padded
  to make a section look fuller. If a section has nothing in it, the bullet
  is `None` — that is a complete and correct answer.
- **Stay inside this PR.** Don't discuss other tickets, the chain's
  progress, the queue, or what's coming next. The one allowed exception: if
  a gap or a change here genuinely affects the PR before or after this one
  in the stack, say so in one line.
- **No suggestions that weren't part of the work.** No "you might also want
  to…", no ideas for future improvements, no commentary on the codebase at
  large.
- **Part 4 is sequencing.** It answers only: between merging *this* PR and
  merging the next one, what does the user have to do by hand? A migration
  to run against production, a script to run, a check on a real phone, a
  value to set somewhere. Rebasing the next branch is mine (step 9), so it
  does not belong in this list.

### Then continue

Comment on the issue with the PR link (`gh issue comment <n> --repo
<owner>/<repo> --body "PR: <url>"`; closing issues automatically via the PR
body's `Closes #N` is fine — the PR stays unmerged until the user acts, so
the issue only actually closes once they merge).

Then, without waiting for the user and without asking whether to continue:
- **Re-query `code-ready`. If a single ticket remains that isn't already in
  flight, go straight back to step 1** for it, branching from *this*
  ticket's branch. Do this however many times it takes — ten tickets, twenty,
  whatever the queue holds. Finishing one ticket is not a stopping point,
  and neither is finishing five; the only thing that ends the run is an
  empty queue. Do not pause to report progress between tickets or to ask
  whether to keep going.
- Note that the queue can grow mid-run: re-querying each time (rather than
  working from the list read at step 0) means a ticket labeled `code-ready`
  while the chain is running gets picked up too.
- **Only when nothing is left** is it the finish line: stop, and give one
  short closing index — not a re-run of the per-PR reports, which are
  already written and posted on each PR. The index is just: every PR in
  stack order (number, title, one line each, merge them bottom-up), plus
  any ticket that was relabeled `blocked-on-decision` instead of
  implemented, so every ticket counted at step 0 is accounted for. Keep it
  to a screen.

## 9. After the user merges a PR from the stack (squash merges)

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
