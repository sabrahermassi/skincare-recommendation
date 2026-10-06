---
name: review-prs
description: Go through every open pull request, work out the order they should be merged in, bring each one up to date with main, and drive it to mergeable — hygiene, self-review, Claude/Codex/CodeRabbit reviews, fixing every valid finding — without merging. Only stops to ask the owner about real decisions. Use when the user says "/review-prs", "review the open PRs", or "get the open PRs ready to merge".
---

# Review PRs

`/work-next` builds new tickets. This skill finishes **pull requests that
already exist**: it takes every open PR, decides the merge order, brings
each one onto current `main`, and loops fix → review until it is mergeable.

**Never merge. Never write to production. Never close a PR.** The owner
merges. Read `CLAUDE.md` once at the start; its rules (staging only, the
scoring invariants, route types, render tests) apply to every fix here.

**Talk to the owner only for decisions** — a product, scoring, wording,
schema or architecture call, or two reviewers contradicting each other.
Everything else, fix it.

## 1. Inventory and merge order

```bash
gh api repos/<owner>/<repo>/pulls?state=open --paginate
```

For each PR record: number, title, head branch, **base branch**, author,
draft or not, mergeable state, CI state, linked issue (`Closes #N`).

Then build the order:

1. **Stacks.** A PR whose base is another PR's head branch is stacked on
   it. The parent comes first.
2. **Stranded bases.** If a PR's base branch is **not `main` and has no
   open PR of its own**, check `git log origin/main..origin/<base>`. If it
   has commits that aren't on `main`, that work never landed (it was merged
   into a branch instead of `main`, or its PR was closed). **Stop and tell
   the owner** which commits are stranded and on which branch, and propose
   opening a PR from it to `main`. Don't retarget the child until the owner
   decides — retargeting would drop the stranded work from its diff
   silently.
3. **Merged parents.** If a PR's base branch belongs to a PR that is
   already merged, the PR must move onto `main` (step 2 below).
4. **Among PRs on `main`:** queue priority first (the linked issue's
   `priority:P<n>` label, lowest number first), then oldest first. A PR
   that others depend on (by stack or by an explicit "merge #X first" in
   its body) goes before them.
5. **Skip drafts** and PRs the owner didn't open or ask for (Dependabot PRs
   are fine to include: the same loop, usually just CI).

Post the order in the session as a short table before starting (PR, base,
why it's in this position). Don't wait for approval; start with the first.

## 2. Bring the PR onto current main

On the PR's head branch, in its own git worktree (several sessions may be
running; never work in another session's checkout):

- **Base is `main`, branch is behind:** `git rebase origin/main`.
- **Base is a merged PR's branch** (the usual case after a squash merge):
  rebase only this PR's own commits:
  `git rebase --onto origin/main <old-base-tip> <branch>`, then change the
  PR's base to `main`:
  `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -f base=main`.
- **Base is an open parent PR:** rebase onto the parent's current head, keep
  the base as the parent. It goes to `main` when the parent is merged.
- Push with `git push --force-with-lease`. Rebasing (not merging `main`
  in) keeps the history clean for the owner's squash merges. Only branches
  made by Claude sessions (`task/*`, `claude/*`, `fix/*`, `feat/*`,
  `docs/*`) are rewritten this way; for any other branch, merge
  `origin/main` into it instead and don't force-push.
- **Conflicts:** resolve them keeping both sides' intent. If both sides
  changed the same logic and keeping one loses behaviour the other needed,
  that is a decision: stop on this PR, tell the owner exactly which hunks,
  and move to the next PR.
- Regenerate lockfiles and generated files with the repo's tools, never by
  hand. If a route changed, regenerate route types (CLAUDE.md).

Then run `npm run typecheck && npm run lint && npm test`. Fix what broke
because of the rebase before anything else.

## 3. Hygiene, then self-review

Run the user-level `hygiene` skill, then `self-review`, on the PR's full diff
against its base. If either skill isn't available, do the pass by hand
(unused code and imports, dead components, stale comments; then a skeptical
read for correctness, missing tests, scope creep) and say so in the PR.

Fix every finding that doesn't need a decision. Run typecheck, lint and
tests, commit (one commit per pass, a clear message), push.

## 4. Review loop

Three reviewers:
- **Claude:** comment `@claude review`, or run the `pr-review` skill on the
  PR directly.
- **Codex:** comment `@codex review`. **Rationed** (the owner has a low
  Codex limit): see "When to ask again" below.
- **CodeRabbit:** reviews automatically on every push. Comment
  `@coderabbitai review` only if it hasn't posted after 15 minutes.

### Read findings where they actually are

Codex and CodeRabbit put their findings in **inline review comments**. The
PR conversation shows only banners. Every round, read all of:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/comments --paginate   # inline findings
gh api repos/<owner>/<repo>/pulls/<n>/reviews --paginate    # review bodies
gh api repos/<owner>/<repo>/issues/<n>/comments --paginate  # @claude review, summaries
```

and the unresolved review threads (GraphQL `pullRequest.reviewThreads`,
`isResolved: false`). Codex marks severity with a badge in the body
(`badge/P0` … `badge/P3`).

### Wait properly

After a push or a review request, poll every 2 minutes (Monitor tool or a
background until-loop, never a foreground `sleep`) for up to **15 minutes**
for Codex and CodeRabbit. Don't leave a PR while a requested review is
still inside that window.

### What to fix

- **Every valid P0, P1 and P2 from any reviewer.** Codex P2 is a real-defect
  tier, not a nit.
- **P3 and nitpicks:** fix if cheap and clearly right; otherwise reply why
  not.
- **Not valid** (wrong, already fixed, out of scope): reply with the reason
  and the evidence (file:line, a test), no code change.
- **Needs a decision:** reply in the thread saying it's waiting on the
  owner, add it to the PR's "Open questions", and add it to this run's
  decision list.

For **every** thread: reply ("Fixed in `<sha>`: …" or why not) **and
resolve it**. A finding is done only when its thread is resolved.

After a batch of fixes: re-run hygiene and self-review on the new diff (a
reviewer-prompted fix can introduce exactly what those catch), then
typecheck, lint, tests, push.

### When to ask again

- **Claude and CodeRabbit:** after every push, until a round brings no new
  valid findings.
- **Codex:** ask again only while its **most recent** review on this PR
  contained a **P0 or P1**. Once its latest review has nothing above P2 (or
  it didn't respond, or it's rate-limited), fix those findings and **don't
  ask Codex again on this PR**.

**There is no round cap.** The loop ends when a round brings nothing new
that's fixable without a decision. If it keeps producing real findings after
many rounds, finish the round, then say plainly in the PR why (the change is
too big, under-tested, under-scoped).

## 5. Mergeable check

A PR is ready only when **all** of these hold:
- CI green on the current head commit (re-read check runs after the last
  push; don't assume)
- no merge conflict; GitHub reports it mergeable
- no unresolved review thread, except ones explicitly waiting on the owner
- base is `main`, or the PR is stacked on an open parent that is itself
  ready (say "merge #X first")
- the linked issue's "Done when" is met (re-read it)
- for anything visible: checked in the iOS Simulator (work-next step 4b)
  if Argent is available, screenshots in the PR

Then post **one** comment on the PR:

```
## Ready to merge
- Merge order: <first | after #X>
- Rebased onto main at <sha>; CI green
- Reviews: Claude <n> rounds · Codex <n> (last: no P0/P1) · CodeRabbit <n>
- Fixed: <short list>
- Waiting on you: <decisions, or "None">
- Before merging (production steps for you): <migrations, secrets, or "None">
```

Then move to the next PR in the order.

## 6. Finish

Before stopping, re-read every PR you handled for review comments that
arrived after you left it, and handle them as in step 4.

Then give the owner one short summary, nothing else:
1. **Merge in this order:** PR numbers, top to bottom, each "ready" or
   "blocked by <reason>"
2. **Decisions for you:** every item that needs the owner, one line each,
   with the PR link
3. **Stranded work found:** branches with commits not on `main` (from
   step 1)
4. **Production steps:** anything listed under "Before merging"
