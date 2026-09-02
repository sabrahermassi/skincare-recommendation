I want to propose (not implement yet) a data/API architecture for this skincare recommendation app.

My reference points are Skinsort and INCIDecoder — I want the product experience to feel as close as possible to those two apps: a real product image, product name and brand, a short description, and underneath it a full, well-organized ingredient list with per-ingredient function/purpose and any notable safety or irritancy flags. Skinsort also does ingredient-based "dupe" matching (finding similar products by shared ingredients) and skin-type/concern filtering — take that into account as a possible feature direction, not necessarily something to build immediately.

Do not implement anything and do not modify any files yet. Research and propose only.

Please:

1. Propose which data source(s) to use for product data (name, brand, image, description) and which to use for ingredient-level data (INCI names, function, safety/irritancy info), given that:
   - We are targeting the Korean skincare market primarily, with Japanese market support also planned.
   - We do not have rights to scrape Skinsort or INCIDecoder directly — their content is copyrighted. Use them only as a reference for the _shape_ of the experience, not as a data source.
   - Options already identified as worth evaluating: Open Beauty Facts (open license, has images), the Korean Cosmetic Ingredients API (deep Korean ingredient/regulatory data, ingredient-level only, via RapidAPI), and TheBeautyAPI's Hugging Face dataset (large bulk dataset). Evaluate these plus anything else you think is relevant.

2. Propose how to combine product-level data and ingredient-level data into one coherent API layer for this app — e.g. one unified internal endpoint that merges both sources, cached/synced into our own Supabase database, versus calling both live on each request. Explain the tradeoffs.

3. Flag any gaps: which Korean/Japanese brands or products are likely to have poor coverage in the sources you propose, and what a fallback should be (e.g. manual entry, user-contributed data) for products not found.

4. Propose a rough data model (tables/fields) for how product + ingredient data would be stored in our Supabase database, consistent with `.claude/claude-security-guidance.md`'s note that third-party product data is untrusted input and should be sanitized before rendering.

5. Note any licensing, attribution, or rate-limit constraints for each data source you propose, since this affects whether we can actually ship with it long-term versus only prototype with it.

Give me your recommendation clearly at the end under a heading `## Recommendation`, with your reasoning, before I decide anything or ask you to implement.
