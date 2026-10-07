---
name: design-pass
description: Run the whole Impeccable design loop on the app in one go — critique and audit, fix (typeset, layout, distill, quieter, delight, animate, polish), then critique and audit again — checking every screen in the iOS Simulator, and open one pull request. Never stops midway: it fixes what it can and lists everything that needs the owner at the end. Use when the user says "/design-pass", "run the design pass", or "run all the impeccable steps".
---

# Design pass

The owner used to run each Impeccable command by hand, read its report,
approve the fixes, and repeat. This skill runs the same commands in a fixed
order and does the approving itself. **It never stops midway.** Where a real
decision is needed it leaves that one thing undone, writes it down, and keeps
going; everything left for the owner is handed over once, at the end.

**Never merge. Never write to production. Never force-push, rebase or delete
a branch.** Read `CLAUDE.md` and `DESIGN.md` once at the start: `DESIGN.md`
is the record of what the owner already decided, and every fix here follows
it. The UX and UI rules for an iOS app (44pt touch targets, 4.5:1 text
contrast, Dynamic Type, Reduce Motion, Reduce Transparency, one clear action
a screen) apply to every step.

## The order

Run these eleven Impeccable commands, in this order, in one session. Do not
ask which to run, do not ask which screen to start with, and do not pause
between steps for approval: every command covers the whole app, and the run
ends only after step 11.

**Check**
1. `/impeccable critique`
2. `/impeccable audit`

**Fix**
3. `/impeccable typeset`
4. `/impeccable layout`
5. `/impeccable distill`
6. `/impeccable quieter`
7. `/impeccable delight`
8. `/impeccable animate`
9. `/impeccable polish`

**Check again**
10. `/impeccable critique`
11. `/impeccable audit`

Invoke each with the Skill tool (`impeccable:impeccable`, args = the command
word). If the Impeccable plugin isn't installed, stop and say so.

## Before step 1

- Work in a new git worktree on a new branch from current `origin/main`
  (`task/design-pass-<date>`). Other sessions may be running; never work in
  their checkout.
- If an earlier design-pass PR is still open, this is the one reason not to
  start: tell the owner which PR and end there. One run at a time, merged
  before the next; stacking ten small PRs is what made merging slow.
- Start this branch's own dev server on a free port with the staging
  environment loaded and a cleared cache
  (`npx expo start --port <port> --clear`, see the memory note "Simulator QA
  setup"), and open it on a simulator no other session is using.

## How to run each step

- **Check steps (1, 2, 10, 11): look at the app, not only the code.** Take a
  screenshot of every screen in one batch (onboarding, Home, scanner, result
  both tabs, ingredient sheet, Saved all three tabs, routine, Find your
  actives and a story, Profile, skin quiz, sign-in, the sheets and pop-ups),
  save them under `.impeccable/screens/`, and judge from those. Keep the
  score each command gives.
- **Fix steps (3 to 9): fix what the command finds, straight away.** Don't
  write a report and wait. After each step run
  `npm run typecheck && npm run lint && npm test`, then commit that step
  alone with a clear message.
- **Check every changed screen in the simulator once per step, all together**,
  not one screen at a time with a question after each.
- **Any screen you change gets its render test added or updated** (CLAUDE.md).
- **Use tokens.** A new colour, size, radius or spacing goes into
  `lib/tokens.ts` (and `tailwind.config.js` where mirrored) with its contrast
  computed, never a bare number. If no token fits, that is a decision.
- **Update `DESIGN.md` in the same commit** as the change it describes.
- **Steps 10 and 11 are the proof.** If they find something new that needs no
  decision, fix it and say so. Don't start the loop a second time.

## What to fix yourself, and what to leave for the owner

Fix without asking: contrast, spacing and type that break a rule already in
`DESIGN.md`; orphan words; touch targets; clipped or overlapping text;
values that bypass tokens; dead code; an animation that ignores Reduce
Motion; a duplicate line of copy that says what the line above already says.

**Leave for the owner** (don't do it, don't ask mid-run; write it down with
what you'd pick and why, so one word answers it) only:

- a choice between two looks: a colour, a typeface, an icon, an illustration
- removing, merging or reordering something the app does (a step, a card, a
  screen, a confirmation)
- new or changed copy that makes a claim about skin, safety or an ingredient
  (it goes through the claims audit), and any change to the app's name or
  voice
- a new animation or "delight" moment on a screen that has none: propose it
  with a screenshot of where it would go, don't ship it unasked
- a value in `DESIGN.md` marked as the owner's decision
- anything touching scoring, the database, accounts or the scanner's logic

Collect these as you go and carry on with everything else. Never use a
question to pause the run. They are handed over once, after step 11, in the
PR and in the final message. If one of them blocks part of a step, do the
rest of that step.

## Finish

1. Run the pre-merge check from `CLAUDE.md` (typecheck, lint, tests, the
   three-platform export).
2. Push and open **one** pull request for the whole run. Its body, in plain
   English and short bullets:
   - **Scores:** critique and audit, before and after
   - **What changed**, grouped by step
   - **Checked in the simulator:** which screens, which device
   - **Not checked:** honestly (a real phone, largest text, a state you
     couldn't reach)
   - **Decisions for you:** each open question with your recommendation
3. Stop the dev server and the simulator you started.
4. Tell the owner the PR number and the full list of what is left for them,
   nothing else. Their answers are a follow-up on the same PR; `/review-prs`
   takes it from there.

## When to run it

After a batch of feature work is merged, and once before each TestFlight
build. Not on a timer: the simulator needs the owner's Mac, and with no new
screens a run finds nothing.
