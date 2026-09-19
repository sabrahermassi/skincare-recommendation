Produce one comprehensive report covering the six areas below. Write it to `REPORT.md` at the project root, updating the file incrementally after each section so partial progress is saved if this run is interrupted.

Do not implement anything. Do not modify any code files. Research, design, and write findings only. This report will be reviewed by me and handed back to you separately for implementation — do not skip ahead to building anything now.

Work through the sections in order, since each one builds on the last.

## Report structure

Start `REPORT.md` with:

```
# Manassa — Full Technical Audit
Generated: [date]

## Executive Summary
[2-3 paragraphs: overall state of the project, the biggest gaps, what should happen first]
```

Then one section per area below, in this exact order.

---

### 1. Data Architecture Proposal

Evaluate and recommend a data sourcing strategy:

- Compare Open Beauty Facts, the Korean Cosmetic Ingredients API, and TheBeautyAPI's dataset — coverage, licensing, rate limits, data quality, specifically for Korean and Japanese skincare brands
- Recommend sync-into-our-database vs. live-API-per-request, with reasoning
- Propose a merge strategy for combining product data (name, brand, image) with ingredient data (INCI names, function, safety flags) from different sources
- Flag where coverage will likely be thin and what the fallback should be for products not found

### 2. Recommendation / Scoring Logic

Design the actual algorithm:

- How the five quiz answers (skin concerns, skin type, sensitivity, reactions, pregnancy/breastfeeding) combine into a skin profile
- How that profile scores a scanned product's ingredient list
- Keep hard exclusions (from reactions and pregnancy) architecturally separate from soft preferences (concerns, skin type, sensitivity) — define exactly how each is calculated and how they're presented differently
- Explicitly design the "unknown" case: any skipped or declined question must never default to a value that could produce a false-safe result
- Give concrete pseudocode or a scoring formula, not just prose description

### 3. Security Threat Model

Build one from scratch for:

- Photo upload flow (if/when built) — treat this as the highest-sensitivity data in the app
- User accounts and authentication
- Third-party product/ingredient data feeds as an untrusted-input boundary
- Reference `.claude/claude-security-guidance.md` if it exists; note if it doesn't and should be created

### 4. Database Schema Design

Based on the data architecture from Section 1, design the actual Supabase tables:

- Products, ingredients, user profiles, scan history, saved items
- Relationships between them (foreign keys, many-to-many where needed)
- Note where Row Level Security is required and what the policy should be for each table
- Call out any table that needs to support the "unknown" field states from Section 2

### 5. API Endpoint Design

Design the scan flow specifically:

- What happens when a barcode is scanned, step by step
- When it queries cached/synced data vs. falls back to a live external API call
- The response shape returned to the app (include an example JSON payload)
- Error and not-found cases

### 6. Codebase Review

Read the actual current state of the repository — onboarding screens, quiz screens, any components or logic already built. For each area found:

- What's implemented and working
- What's incomplete, inconsistent, or has bugs (check specifically for the kind of drift we've hit before — multiple screens implementing the same thing differently)
- Architectural concerns worth addressing before building further
- Do not review visual/design polish — focus on code structure, logic correctness, and consistency

---

### Closing section

End the report with:

```
## Summary of Recommended Changes
```

A prioritized list (High / Medium / Low) of concrete next actions across all six areas, written so it can be handed back as a task list.
