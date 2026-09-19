Do a complete audit of the scan flow — barcode scanning and label-photo capture — covering every scenario, not just one or two. Also audit app performance and caching. Write findings to `REPORT.md`, updating incrementally. Do not implement anything yet — this is a report only, we'll hand it back to you separately for changes once I've reviewed it.

## Part 1: Scan flow — every scenario

Go through the actual current implementation (barcode scanner and label-photo capture) and map out what happens in each of these cases. For each one, tell me: what currently happens (walk the actual code path), what message or state the user sees, and whether that's clear or confusing.

**Barcode scanning:**

1. Barcode scanned, product found in our database
2. Barcode scanned, product not in our database but found via live fallback to an external API
3. Barcode scanned, product not found anywhere
4. Barcode is unreadable/blurry — scan fails to register
5. Barcode scanned but it's not a skincare product (e.g. a food item)
6. Camera permission not granted
7. No internet connection at the moment of scanning
8. Same barcode scanned twice in a row
9. User backs out or cancels mid-scan

**Label-photo capture:** 10. Photo taken, ingredient text successfully read (OCR succeeds) and matched to known ingredients 11. Photo taken, OCR reads text but some/all ingredients aren't recognized in our database 12. Photo taken, OCR fails to read any text (blurry, bad lighting, angle) 13. Photo taken of something that isn't an ingredient label at all 14. User retakes the photo after a failed attempt 15. Very long ingredient list that goes beyond what's visible in one photo

**Cross-cutting:** 16. What happens after any successful match — does it go straight to results, or is there an intermediate confirmation step? 17. Is the failure messaging consistent in tone and format across all the failure cases above, or does it currently vary? 18. How does the user recover from each failure case — is the path back to trying again obvious every time?

For each scenario, flag current behavior as: **working well**, **exists but confusing**, or **missing entirely**.

## Part 2: Simplify and unify

Based on the above, propose a **minimal, consistent set of states** the scan flow should have — the goal is fewer distinct behaviors, not more. Specifically:

- Can multiple failure scenarios above share one simple, calm failure state instead of each having different messaging?
- Propose the actual copy for each state (loading, success, not-found, retry) — warm, plain-language, consistent with the rest of the app's tone. No technical error language anywhere.
- Propose one clear, obvious next action for every failure state — never a dead end.
- Note anywhere the current implementation is more complicated than it needs to be, and what to remove.

## Part 3: App performance and caching

Audit how data flows through the app currently:

- Is scanned/fetched product data being cached locally at all right now? Where, and how?
- What gets re-fetched unnecessarily that could be cached?
- How is the transition between "scanning" → "loading" → "result" handled — is there unnecessary delay or flicker?
- Check image loading (bottle illustrations, any product photos) for unnecessary re-renders or missing memoization
- Any obvious performance issues in the quiz or onboarding screens from unnecessary re-renders or state management
- Propose a caching strategy: what should be cached, for how long, and invalidated when

## Output

End the relevant section with a **prioritized list** of specific changes to make — grouped as: Fix immediately (confusing or broken UX), Simplify (reduce states/complexity), Performance (caching and rendering), each with enough detail that it can be handed to you directly as an implementation task afterward.
