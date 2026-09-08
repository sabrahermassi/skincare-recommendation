Do a dead-code audit of this codebase. This project has been through several rounds of redesign and I'm concerned old code is still hanging around.

Find and report (don't delete anything yet):

Files in assets/ and assets/illustrations/ that nothing imports
Components that are defined but never rendered
Exported functions, types and constants with no consumers
Unused imports and dependencies in package.json
Hardcoded colour values that bypass the design tokens — specifically any remaining
#5A342C,
#9B665B,
#F2BFA6, or old match-verdict colours
Duplicate or near-duplicate components where a newer version superseded an older one but the old file was never removed
Old screens or routes that are no longer reachable from any navigation path
Commented-out blocks left from previous iterations

Specific things to check, given what's changed recently: the onboarding went from a single screen to three; the quiz was restructured; the design tokens changed twice; illustrations were swapped for layered versions; and match verdict colours were replaced.

For each finding, tell me: what it is, where it lives, why you believe it's unused, and how confident you are. Group by confidence — certain, probable, and needs-my-judgment.

Do not delete or modify anything. I want the report first.
