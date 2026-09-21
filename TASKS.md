# Task Queue

One place to point an autonomous session at. Run `/work-next` (see
`.claude/skills/work-next/SKILL.md`) to pick the top ready task, implement it
start to finish — including any staging DB work — open a PR, loop review
tools until clean, and stop without merging.

## Source docs (read, don't duplicate here)

- **MVP Scope** — https://claude.ai/artifact/2HSNkc3QUZPxMBREhWFhT2 — frozen
  product definition, NOT NOW list, the two open scope decisions.
- **Feeding the Catalogue** — https://claude.ai/artifact/35abnwiaqnKhpBWnWJTJkV
  — 19-step data/backend plan, build order, done/not-done flags.
- **Launch Checklist** — https://claude.ai/artifact/4oqtQu1QQLJT4K3aXSCwcH —
  12-section rollout tracker, every box mapped to a GitHub issue or flagged
  "no issue."

Each queue item below links to whichever of these actually defines its
scope. `/work-next` reads that link before touching code — this file is the
index, not the spec.

## Ready — well-defined, no owner decision needed

Pick top to bottom unless one is explicitly blocked below.

| # | Task | Scope source | Notes |
|---|------|---------------|-------|
| 1 | Fix CI Jest config (`jsr:` Deno-only imports break the run) | issue #128 | Small, unblocks trusting CI on everything after it — do first. |
| 2 | Catalogue step 17 — calibrate irritation charge, gentle-form rules, A-to-Z list bug, benzoyl-peroxide fixture type | [step 17](https://claude.ai/artifact/35abnwiaqnKhpBWnWJTJkV#step-17), issue #136 | Follows merged step 16 (PR #142). |
| 3 | Catalogue step 18 — sparse hydration formula under-scoring `CONCERN_SATURATION.dehydrated` | [step 18](https://claude.ai/artifact/35abnwiaqnKhpBWnWJTJkV#step-18), issue #136 | Independent of step 17. |
| 4 | Catalogue step 19 — close remaining 3.6% of unmatched ingredient names | [step 19](https://claude.ai/artifact/35abnwiaqnKhpBWnWJTJkV#step-19), issue #101 | PR #159 opened against this already — check its state before starting a duplicate. |
| 5 | Issue #137 — ensure scores/explanations stay consistent | issue #137 | Scoped in the issue itself. |
| 6 | Issue #138 — unknown/missing ingredients handled safely | issue #138 | Mostly regression-test coverage per the checklist's own note. |
| 7 | Issue #139 — review safety/medical claims in copy | issue #139 | Content + code check against `docs/threat-model.md` framing. |
| 8 | Issue #105 — ingredient normalization gaps | issue #105 | Overlaps step 19 — read both before starting, don't duplicate. |

## Needs re-scoping before it's queue-ready

- **Issues #146–#153** (§3 Core Product, one per screen). Launch Checklist
  flags these as stale since the nav rebuild (Home tab, floating Scan
  button, Profile-as-menu). First task here is re-scoping each issue's
  Definition of Done against current `app/` routes — not code. Do this as
  its own task before treating any of #146–153 as ready.

## Blocked on a decision only the repo owner makes — do not start

- Issue #14 — GDPR/regulatory determination (blocks §8 Privacy & Legal, and
  part of §5).
- Monetization (no issue — Launch Checklist §1).
- Account requirement (no issue — blocks issues #19, #20).
- Issue #39 — should probably be closed/relabeled against the NOT NOW list,
  not implemented. Flag it, don't build it.

## Not code — skip in `/work-next`

Launch Checklist §6 (analytics), §7 (marketing), §9–§12 (beta/store/launch/
post-launch), and §5's non-code rows (secrets setup, backups config).
