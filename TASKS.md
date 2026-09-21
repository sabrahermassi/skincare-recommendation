# Task Queue

`/work-next` (see `.claude/skills/work-next/SKILL.md`) works this queue: pick
one task, implement it start to finish — including staging DB — open a PR,
loop review tools until clean, stop without merging.

**The live queue is GitHub issues, filtered by label — not a list in this
file.** A static list here went stale immediately (two issues hand-copied
into an earlier draft of this file had already been closed days before). A
label on the issue is the one place that can't silently disagree with GitHub.

```
gh-equivalent: issues, state=open, label=code-ready
```

## Labels that drive the queue

- **`code-ready`** — well-defined, no owner decision needed, pure
  implementation. `/work-next` only ever picks from this set.
- **`needs-scope`** — real work, but the Definition of Done needs a pass
  first (e.g. re-checked against current screens after a nav rebuild).
  Not pickable until re-scoped and relabeled `code-ready`.
- **`blocked-on-decision`** — waiting on a product/legal/architecture call
  only the repo owner makes. Never pickable.
- No label at all — not triaged yet, or not code (manual testing,
  marketing, store listings, analytics setup). Not pickable.

## Source docs (context, not enumeration)

Issue bodies link to whichever of these actually defines the task's scope.
`/work-next` reads that link before touching code.

- **MVP Scope** — https://claude.ai/artifact/2HSNkc3QUZPxMBREhWFhT2
- **Feeding the Catalogue** — https://claude.ai/artifact/35abnwiaqnKhpBWnWJTJkV
  — steps without their own issue yet get one filed (with the step's anchor
  link in the body) before they're `code-ready` — see step 17 → #171, step
  18 → #172 for the pattern.
- **Launch Checklist** — https://claude.ai/artifact/4oqtQu1QQLJT4K3aXSCwcH —
  most rows here are non-code (manual testing, store listings, legal). Only
  the rows that already carry a `code-ready`-labeled issue are queue work;
  the rest stay reference.

## Keeping it honest

Whenever a Launch Checklist or catalogue-plan pass identifies a new
concrete, decision-free task: file an issue (or relabel an existing one)
`code-ready` rather than adding a row here. Whenever one turns out to need
a decision or rescoping after starting, relabel it instead of leaving it
`code-ready` and hoping `/work-next` notices.
