Produce one comprehensive report covering the six areas below. Write it to `REPORT.md` at the project root, updating the file incrementally after each section so partial progress is saved if this run is interrupted.

Do not implement anything. Do not modify any code files. Research, design, and write findings only. This report will be reviewed by me and handed back to you separately for implementation — do not skip ahead to building anything now.

Start from what already exists. This is an audit of a working app, not a greenfield design: it already has `data/api.ts` (the only data seam), a scoring engine in `lib/`, Supabase migrations in `supabase/migrations/`, and deployed scan Edge Functions in `supabase/functions/` (`product-lookup`, `label-ocr`, `resolve-scan`). Every section below must begin from the current implementation, say what to keep and what to change, and only propose something new where you found a real gap. Read the repository first (Section 1), then work through the sections in order, since each one builds on the last.

## Report structure

Start `REPORT.md` with:

```
# for.me — Full Technical Audit
Generated: [date]

## Executive Summary
[2-3 paragraphs: overall state of the project, the biggest gaps, what should happen first]
```

Then one section per area below, in this exact order.

---

### 1. Codebase Review

Read the actual current state of the repository — onboarding screens, quiz screens, the scan flow, the scoring engine, the data layer, the migrations and Edge Functions, and any components or logic already built. For each area found:

- What's implemented and working
- What's incomplete, inconsistent, or has bugs (check specifically for the kind of drift we've hit before — multiple screens implementing the same thing differently)
- Architectural concerns worth addressing before building further
- Do not review visual/design polish — focus on code structure, logic correctness, and consistency

### 2. Data Architecture

Describe how product and ingredient data reaches the app today (the importers in `scripts/`, the lookup cascade in `supabase/functions/product-lookup`, the fallbacks in `data/api.ts`, and any caching), then evaluate it and recommend changes:

- Compare the sources the repo already uses with the Korean Cosmetic Ingredients API and TheBeautyAPI's dataset — coverage, licensing, rate limits, data quality, specifically for Korean and Japanese skincare brands
- Assess sync-into-our-database vs. live-API-per-request as it is used today, with reasoning
- Assess the current merge of product data (name, brand, image) with ingredient data (INCI names, function, safety flags) from different sources, and propose changes only where it falls short
- Flag where coverage is thin and what the fallback for products not found should be

### 3. Recommendation / Scoring Logic

Document and assess the algorithm that exists (`lib/matching.ts`, `lib/rules.ts`, `lib/safety.ts`, `lib/profile.ts`):

- How the four quiz answers (skin concerns, base skin type, sensitivity, pregnancy/breastfeeding — see `SkinProfile` in `data/types.ts`) combine into a skin profile
- How that profile scores a scanned product's ingredient list
- How safety flags (the hazard cap and the graduated irritant cautions, including the pregnancy caution in `lib/pregnancy-caution.ts`, which is deliberately a caution rather than a hard exclusion because an ingredient list carries no concentration) are kept separate from the soft fit (concerns, skin type, sensitivity), how each is calculated, and how each is presented. Say whether that separation and those choices are right; do not replace them with hard exclusions unless you show a concrete failure
- Verify the "unknown" case: any skipped or declined question is `null` and must never default to a value that could produce a false-safe result
- Give the current formula as concrete pseudocode, and propose a change only where you find a flaw

### 4. Security Threat Model

Build one from the current system for:

- The label-photo flow (`label-ocr` is built and deployed) — treat this as the highest-sensitivity data in the app
- User accounts and authentication (not built yet — say what will be needed before they are)
- Third-party product/ingredient data feeds as an untrusted-input boundary
- Read `.claude/claude-security-guidance.md` and note where it is out of date or missing coverage

### 5. Database Schema Design

Review the tables that exist in `supabase/migrations/`, then propose changes only where the design falls short:

- Products, ingredients, user profiles, scan history, saved items — which exist, which don't
- Relationships between them (foreign keys, many-to-many where needed)
- Where Row Level Security is required and what the policy should be for each table
- Call out any table that needs to support the "unknown" field states from Section 3

### 6. API Endpoint Design

Document the scan flow as it works today, then assess it:

- What happens when a barcode is scanned, step by step (`resolve-scan`, `product-lookup`)
- When it queries cached/synced data vs. falls back to a live external API call
- The response shape returned to the app (include an example JSON payload)
- Error and not-found cases, including the failure states the client distinguishes (`FetchFailure` in `data/api.ts`)
- What should change, and why

---

### Closing section

End the report with:

```
## Summary of Recommended Changes
```

A prioritized list (High / Medium / Low) of concrete next actions across all six areas, written so it can be handed back as a task list.
