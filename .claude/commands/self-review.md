# Skeptical Self-Review

Perform a fresh, skeptical review of the current diff, branch changes, or specified PR.

Assume the code was written by someone else. Do not assume the implementation is correct because you or another agent wrote it.

Do not modify files, commit, push, comment, resolve review threads, or trigger external review tools.

## Review

First inspect:

- the complete diff against the relevant base branch
- the files in the diff, plus one hop of direct callers/consumers - do not survey the codebase
- relevant tests and whether they actually exercise the changed behavior
- documentation relevant to the changed area; skip unrelated documentation
- relevant database schema/models, API contracts, and frontend consumers when affected
  <!-- UPDATE THESE PATHS to match your actual stack, e.g.:
       - Supabase schema (supabase/migrations/*.sql or your schema file)
       - API routes (backend/src/routes.js or your equivalent)
       - Frontend API/service layer (frontend/services/api.ts or your equivalent) -->
- existing GitHub issues when a pre-existing problem is relevant

Do NOT read `CLAUDE.md`. It is already in context on every request.

Read any document at most once per session. For docs under `docs/`, grep for the relevant section and
read only that line range rather than the whole file.

If you want more context than this allows, ask me instead of exploring.

Review for:

- correctness, edge cases, and error handling
- failure, retry, ordering, concurrency, and resource behavior
- test coverage and test quality
- security and user-level data isolation — this is the highest-priority category in this codebase; see `.claude/claude-security-guidance.md`
- database/API compatibility
- production and performance risks
- architectural consistency
- regressions and unintended side effects
- recommendation-logic correctness — if this change touches quiz scoring, skin-type classification, or the product-matching logic, verify the mapping from inputs to recommended products is sound and doesn't silently mis-classify a user's skin type or surface an unsuitable product
- AI/RAG/safety behavior when relevant (not currently applicable — this codebase has no AI/LLM features yet)

### Maintainability and Design

When relevant to the changed area, also check:

- unclear or misleading naming
- dead or unused code and imports
- duplicated abstractions or sources of truth
- unclear ownership of state or side effects
- functions or modules with multiple unrelated responsibilities
- unnecessary complexity, coupling, or abstraction
- whether another engineer could understand the important "why" behind the implementation

Do not recommend splitting or refactoring code merely because it could be structured differently. Only flag maintainability or design concerns when they create a meaningful problem for correctness, maintainability, or future changes.

Do not invent hypothetical problems or recommend changes merely because another implementation is possible. Verify concerns against the actual code.

For each concern, determine whether it is:

1. introduced by this change
2. pre-existing but relevant
3. unrelated/pre-existing
4. not actually a problem

Do not blame the change for unrelated pre-existing issues.

If a relevant pre-existing issue is found, check whether it is already tracked before suggesting a new one.

## Findings

Classify every finding as exactly one of:

- **Clearly Correct** — implementation is solid; briefly explain why.
- **Judgment Call** — genuine concern or tradeoff; explain the evidence and recommend an action without making the change.
- **Disagree** — apparent problem is not actually a problem or is unrelated/pre-existing; explain why.
- **Nitpick** — minor, non-blocking improvement.

For Judgment Call and Nitpick, assign:

- HIGH — could cause data loss, security issues, incorrect behavior, major production failure, or serious regression
- MEDIUM — meaningful correctness, reliability, maintainability, or testing concern
- LOW — minor improvement or low-probability issue

Do not assign severity to Clearly Correct or Disagree findings.

For every Judgment Call provide:

- Location
- Finding
- Why it matters
- Concrete scenario
- Recommendation

For every pre-existing but relevant concern, state whether it is already tracked by an existing GitHub issue.

## Review Discipline

Be skeptical but evidence-based.

Do not manufacture hypothetical problems simply to produce findings.

Do not recommend changes merely because another implementation is possible.

Prefer the simplest explanation supported by the actual code.

Do not treat architecture documentation as proof that something is implemented. Verify behavior against the source code.

Follow important data and control flows into surrounding code rather than reviewing only the changed lines.

## Output

Start with:

### Review Summary

- Change/PR reviewed
- Base branch
- Overall assessment
- Finding counts by category

Then provide the findings.

For each Judgment Call or Nitpick use:

**[Category] — [Severity] — [short title]**

- Location:
- Finding:
- Why it matters:
- Concrete scenario:
- Recommendation:

For Clearly Correct findings, keep them brief.

For Disagree findings, explain the evidence and whether the issue is already tracked.

Finish with:

### Bottom Line

State whether the change is:

- ready to merge
- ready with minor changes
- requires changes before merge

Do not fix anything.

Wait for direction before taking any action.
