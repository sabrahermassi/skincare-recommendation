Set up and run dead-code detection for this project.

**1. Check tsconfig.** Apply the unused-code compiler flags from my global CLAUDE.md if this is a TypeScript project and they are missing.

**2. Run knip.** Execute `npx knip`. If it reports an overwhelming number of false positives, create a `knip.json` at the project root scoped to this project's actual structure, ignoring any directory of static assets referenced by string path (images, fonts, icons), then re-run.

**3. Run the type check.** Execute `npx tsc --noEmit` and collect what the new compiler flags surface.

**4. Additionally scan for** things the tools miss:
- Components defined but never rendered
- Old screens or routes unreachable from any navigation path
- Duplicate or near-duplicate components where a newer version superseded an older one
- Hardcoded values that bypass design tokens or config constants
- Commented-out blocks left from previous iterations

**5. Project-specific regression check.** This app has replaced its text/CTA colors once already for contrast reasons (see `design/DESIGN_SYSTEM.md`). Grep for any hardcoded use of the superseded values outside `lib/tokens.ts`'s own history comment and `design/DESIGN_SYSTEM.md`'s writeup — both are expected to mention them, nothing else is:
- `#5A342C` (old Ink text) — should be `#241F1E`
- `#9B665B` (old Muted text) — should be `#6B5A54`
- `#F2BFA6` (old CTA/primary button fill) — should be `#E09070`

Also flag any old match-verdict colors still hardcoded instead of read from the current score-band tokens.

**Report only — delete nothing.** Steps 1 and 2 may add the compiler flags and a
`knip.json`, since those are what make the scan possible; nothing else in the
project gets touched. For each finding give: what it is, where it lives, why you
believe it's unused, and your confidence. Group into **certain**, **probable**,
and **needs my judgment**.

Be especially cautious with static assets. "Nothing imports this" is often wrong for files loaded by string path or dynamic require — put those in *needs my judgment*, never in *certain*.

Wait for my direction before deleting anything.
