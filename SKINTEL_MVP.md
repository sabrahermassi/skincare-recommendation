# Skintel — MVP Source of Truth

**Status:** Locked product decisions  
**Purpose:** This document defines the Skintel MVP and is the source of truth for launch scope.

> The existing GitHub repository may contain functionality beyond this MVP. Existing functionality does not automatically belong to the MVP. Working non-MVP functionality does not need to be deleted; it should simply not receive additional scope or priority before launch.

---

# 1. Product Definition

## What Skintel does

Skintel helps people quickly understand whether a skincare product **appears compatible with their skin** by analyzing its ingredients.

## Core question

> How compatible is this product with my skin, and are there any ingredient-related reasons I should be cautious?

## Core outcome

The user should be able to:

1. Identify a skincare product.
2. Analyze its ingredients.
3. Understand how compatible it appears with their skin.
4. See the main ingredient-related reasons behind that assessment.
5. Make their own decision about the product.

Skintel informs the user's decision. It does **not** decide whether the user should buy or use a product.

## What Skintel is not

Skintel does not:

- diagnose skin conditions;
- diagnose allergies;
- prescribe treatments;
- guarantee that a product will or will not work;
- guarantee that a product is safe for an individual;
- determine whether someone should buy or use a product;
- act as an AI dermatologist.

---

# 2. Target User

Skintel is for people who buy skincare products and want to quickly determine whether a product appears to be a good fit for their skin before buying or using it.

The MVP particularly helps users understand whether ingredients may be relevant to:

- acne and blemishes;
- irritation/sensitivity;
- their selected skin concerns;
- their skin type.

---

# 3. Problem

Choosing skincare often requires researching ingredients across multiple websites and sources.

The problem Skintel solves is the fragmented manual research process:

**Product → copy ingredients → research multiple websites → compare information → decide**

Skintel aims to simplify this into:

**Product → Scan → Analyze → Understand**

---

# 4. Differentiation

Skintel's key differentiation is:

> **Streamlining scattered manual skincare ingredient research into one quick scan and personalized ingredient-compatibility analysis.**

The product is focused on helping users quickly understand a product rather than becoming a skincare social network, shopping platform, routine builder, or AI dermatologist.

---

# 5. Core MVP User Journey

The central MVP experience is:

**Open → Quick Scan or Personalize → Scanner → Scan Product → Analyze → Results**

For returning users:

**Open → Scanner → Scan → Results**

Everything in the MVP should support this core experience.

---

# 6. First App Open

The first-ever app open starts with a short welcome/value-proposition screen.

Immediately after the welcome screen, the user chooses:

- **Quick Scan**
- **Personalize My Results**

## Quick Scan

Quick Scan is prominent because a user may be shopping and want the fastest possible scan.

Flow:

**Welcome → Quick Scan → Scanner**

No personalization questionnaire is required before scanning.

## Personalize My Results

Flow:

**Welcome → Personalize My Results → Age → Skin Concerns → Skin Type → Sensitivity → Scanner**

The scanner opens **immediately after the Sensitivity page**.

There is:

- no "You're all set" screen;
- no summary/confirmation screen;
- no extra educational screen.

A subtle progress indicator is allowed during onboarding.

---

# 7. Personalization / Skin Profile

Personalized onboarding collects exactly:

1. Age
2. Skin concerns
3. Skin type
4. Skin sensitivity

## Age

Age remains in the MVP.

The exact input format and exact way age affects scoring are **TBD until the existing code and scoring algorithm are audited**.

Do not invent an age-scoring rule before reviewing the implementation.

## Skin type

Available options:

- Oily
- Dry
- Normal
- Combination
- I don't know

## Skin concerns

Multiple selection is allowed.

Maximum: **3 concerns**.

Available options:

1. Acne & blemishes
2. Dark spots / pigmentation
3. Dry / dehydrated skin
4. Dullness
5. Redness
6. Sensitivity
7. Enlarged pores
8. Fine lines & wrinkles

**Uneven texture is excluded.**

## Sensitivity

Available options:

- Not sensitive
- Somewhat sensitive
- Very sensitive

Sensitivity **affects the personalized score**.

## Information explicitly removed

Do not add:

- Gender
- "Bad reactions to any product?"
- Reaction-type questionnaire

---

# 8. Returning Users

Onboarding is first-time only.

Every subsequent app open goes directly to the **Scanner**, regardless of whether the user has a personalized profile.

A returning user without a profile can still use Quick Scan and can personalize later.

Returning-user flow:

**Open → Scanner**

---

# 9. Scanner

The scanner opens immediately after onboarding.

## Default mode

**Barcode mode is the default.**

## Barcode scanning

Barcode detection should be:

- automatic;
- immediate;
- full-screen/live-camera based;
- minimal;
- fast;
- without a manual Scan button.

There is **no barcode confirmation screen**.

The intended UX reference is Yuka's general scanning pattern:

- full-screen live camera;
- minimal UI;
- automatic detection;
- fast/simple interaction.

Do not assume a specific barcode SDK without auditing the existing implementation.

The existing barcode implementation should be audited for:

- reliable detection;
- stable detection;
- centered/scan-area preference where appropriate;
- avoiding duplicate detections;
- avoiding accidental scans;
- correct behavior immediately after detection.

## Scanner controls

The scanner has:

- Back/Close in the top-left;
- a control to switch between barcode mode and ingredient-list photo mode.

There is **no dedicated flash button for MVP**.

---

# 10. Camera Permissions

If camera access is unavailable, the scanner shows a simple permission state.

Suggested content:

**Camera access needed**

Allow camera access to scan products.

Button:

**Open Camera Settings**

If permission can still be requested, request it.

If permission has been permanently denied, provide an action to open the phone's Settings.

Do not create an additional permission-education screen.

The Back/Close control remains available.

---

# 11. Ingredient-List Photo Scanning

The user can switch from barcode mode to ingredient-list photo mode using the image/photo control.

Flow:

**Switch Mode → Camera → Take One Photo → Tap Scan → OCR + Ingredient Analysis → Results**

For MVP:

- one clear photo only;
- no multi-photo ingredient scanning;
- no multi-step photo collection.

If the ingredient list is long, the user should attempt to fit the complete list into one photo.

If the image is unreadable, ask the user to take another photo.

---

# 12. Analysis Flow

After scanning:

**Scan → Short Loading → Results**

The analysis experience should be:

- short;
- simple;
- direct.

Do not add:

- long AI-analysis animations;
- intermediate analysis screens;
- educational waiting screens;
- multi-step analysis sequences;
- "AI is thinking" screens;
- percentage/progress indicators.

Barcode scanning may show a very brief loading state while product information is looked up.

Ingredient-photo scanning may show a brief loading state while OCR and analysis occur.

---

# 13. Product Identification

Results identify the scanned product using, where available:

- brand;
- product name;
- product image.

Product identification is part of the MVP.

If a barcode/product cannot be found, the user must have a clear path to ingredient-list scanning.

---

# 14. Personalized Match Score

The MVP uses a score from **0–100**.

The score represents:

> **Personalized ingredient compatibility**

The score does **not** represent:

- overall product quality;
- overall product safety;
- a medical assessment;
- a guarantee of results;
- whether the product will definitely work;
- whether the user will definitely react;
- whether the user should buy/use the product.

## Score labels

| Score  | Label           |
| ------ | --------------- |
| 90–100 | Excellent Match |
| 75–89  | Good Match      |
| 60–74  | Fair Match      |
| 0–59   | Poor Match      |

These labels are UX labels.

The actual algorithm must be audited against the existing code before changing or validating the calculation.

## Score requirements

The score must:

- be explainable;
- use clearly defined factors/rules;
- apply factors consistently;
- avoid arbitrary or unsupported rules;
- reflect the user's selected skin profile where applicable;
- safely handle unknown/incomplete ingredient information.

The scoring algorithm is a **core MVP quality requirement**.

---

# 15. Why This Score?

The results screen explains the score using the most important factors.

## Positive factors

Show the top **2–3** relevant positive factors.

Examples:

- suitable for the user's skin type;
- supports a selected skin concern;
- hydrating;
- soothing;
- barrier-supporting.

## Negative / concern factors

Show the top **1–3** relevant negative or cautionary factors.

Examples:

- potential pore-clogging concern;
- potential irritation;
- does not strongly support a selected concern.

The explanation must correspond to the actual score calculation and ingredient analysis.

---

# 16. Key Ingredient Findings

Results should surface important ingredient findings.

## Concerns

Relevant concerns can include:

- potential pore-clogging/comedogenic concerns;
- potential irritation;
- acne-related concerns where supported by ingredient data.

## Benefits / properties

Relevant beneficial properties may include:

- hydrating;
- moisturizing;
- soothing;
- oil-control;
- barrier-supporting;
- brightening;
- exfoliating;
- antioxidant;
- other relevant properties supported by the ingredient data.

Do not invent properties for unknown ingredients.

---

# 17. Existing Detailed Ingredient Analysis

The MVP retains the existing detailed ingredient-analysis experience.

The results screen includes:

**Open Ingredients**

This opens the existing detailed ingredient analysis.

The existing ingredient screen may contain categories/tabs such as:

- All;
- Irritant;
- Pore clogging;
- other existing relevant categories.

Do **not** automatically redesign or replace this screen.

Audit the existing implementation against the MVP first.

Individual ingredient details should remain accessible.

---

# 18. Results Screen

The results screen must contain, at minimum:

### 1. Product identification

- Brand
- Product name
- Product image if available

### 2. Personalized match

- Score out of 100
- Score label
- Short interpretation

### 3. Why this score?

- Top positive factors
- Top negative/concern factors

### 4. Key ingredient findings

- Relevant concerns
- Relevant benefits/properties

### 5. Open Ingredients

Access to the existing detailed ingredient analysis.

### 6. Full ingredient breakdown

Existing detailed ingredient information.

### 7. Brief context/disclaimer

The assessment is an ingredient-based compatibility analysis and is not a guarantee of an individual's skin reaction.

The user controls the visual/UI design. This document defines information and behavior, not a replacement visual design.

---

# 19. Results Interactions

The results experience should support:

- tapping the overall score → score explanation/relevant analysis;
- tapping a pore-clogging finding → Pore-Clogging analysis/tab;
- tapping another finding → relevant ingredient category/analysis;
- tapping Open Ingredients → existing detailed ingredient analysis;
- accessing individual ingredient details.

---

# 20. Recommendations

**No product recommendations are part of the MVP.**

Do not add:

- "You should buy this";
- "You should use this";
- healthier alternatives;
- better alternatives;
- product recommendations;
- recommendation feeds;
- product discovery;
- shopping suggestions.

Recommendations/alternatives are post-MVP.

A possible future concept is wording such as:

**"Better matches for your skin"**

rather than "healthier".

This is **not MVP functionality**.

---

# 21. After the First Result

There is **no special post-result flow**.

After seeing results, the user can use the existing navigation to:

- return to Home if applicable;
- scan again;
- use the scanner/barcode functionality;
- access other existing MVP sections.

Do not add:

- a special next-step screen;
- a forced recommendation flow;
- an educational sequence;
- a product-discovery flow.

---

# 22. Error States

Keep error handling lean.

## Product not found

Message:

**We couldn't find this product.**

Action:

**Scan ingredient list**

## Ingredient photo unreadable

Message:

**We couldn't read the ingredients.**

Action:

**Take another photo**

## Analysis/network failure

Message:

**Something went wrong.**

Action:

**Try again**

Camera permission is handled separately.

---

# 23. Empty States

## No scan history

Title:

**No scans yet**

Supporting text:

**Scan a product to see how it fits your skin.**

Action:

**Scan a product**

## No saved/favorite products

Title:

**No saved products yet**

Supporting text:

**Products you save will appear here.**

Action:

**Scan a product**

Keep empty states simple.

Do not add unnecessary features or explanations.

---

# 24. Loading States

## Barcode

**Automatic detection → Very brief product lookup → Results**

## Ingredient photo

**Tap Scan → Brief OCR + analysis → Results**

Do not use:

- percentages;
- multi-step loading messages;
- long educational loading screens;
- "AI is thinking" messaging.

---

# 25. MVP Supporting Features

The following are part of the MVP because they support the core product/shopping experience:

- Barcode scanning
- Ingredient-list photo/OCR scanning
- Skin profile
- Personalized match score
- General Quick Scan without a profile
- Ingredient-level details
- Potential pore-clogging/comedogenic concerns
- Potential acne-related concerns
- Potential irritation
- Relevant beneficial ingredient properties
- Reliable ingredient/chemical library
- Explainable scoring algorithm
- Clear results
- Favorites/saved products
- Scan history
- Product search
- Manual ingredient entry
- Existing detailed result breakdown

These features should be preserved where already implemented.

They should not automatically be expanded.

---

# 26. Ingredient / Chemical Knowledge Base

The ingredient/chemical library is a core quality requirement.

Where supported, it should provide:

- standardized ingredient names;
- synonyms/alternative names;
- ingredient functions;
- relevant properties;
- skin-type relevance;
- concern relevance;
- potential pore-clogging information;
- irritation information;
- other characteristics needed to explain analysis.

The system must safely handle:

- unknown ingredients;
- incomplete ingredient data;
- incomplete ingredient lists.

The system must **not invent ingredient information**.

The database should be broad and reliable enough for representative real-world skincare products.

---

# 27. Scoring Algorithm Review

Before launch, the existing scoring implementation must be reviewed.

Specifically inspect:

- scoring factors;
- weights;
- skin-type logic;
- concern logic;
- sensitivity logic;
- age handling;
- positive ingredient handling;
- negative ingredient handling;
- pore-clogging logic;
- irritation logic;
- unknown ingredient handling;
- incomplete-data handling;
- score/explanation consistency.

The score must be:

- explainable;
- deterministic/consistent for the same inputs;
- grounded in available ingredient data;
- free from arbitrary unsupported rules;
- appropriately cautious where information is unknown.

### Age

The exact effect of age on the score is **TBD until the existing implementation is reviewed**.

---

# 28. Safety & Claims

Skintel's analysis is an:

> **Ingredient-based compatibility assessment**

The product must avoid presenting the score as:

- a medical diagnosis;
- an allergy test;
- a safety guarantee;
- a treatment recommendation;
- a guaranteed outcome.

Avoid claims such as:

> "This product is definitely safe for you."

or:

> "This product will definitely work for you."

The language should communicate that the analysis identifies ingredient-related compatibility factors and potential concerns while individual skin reactions can vary.

---

# 29. Existing GitHub Repository

The existing GitHub repository may contain substantially more functionality than the MVP.

This is acceptable.

### Critical rule

**The existence of a feature in the repository does not make that feature part of the MVP.**

Do not delete existing functionality merely because it is outside the MVP.

When auditing the repository, existing functionality should conceptually be classified as:

### MVP

Required for launch.

### Supporting / Leave Alone

Already implemented and useful, but does not require additional scope or development for launch.

### Not Now

Outside the MVP.

Do not expand, improve, or prioritize it for launch unless it is required to make the core MVP work correctly.

Working code should be reused where appropriate.

Do not unnecessarily rebuild working functionality.

---

# 30. Scope-Control Rules

For MVP work:

- Do not add new product features simply because they are useful.
- Do not expand personalization unnecessarily.
- Do not add recommendation/discovery systems.
- Do not add social/community functionality.
- Do not add an AI chatbot/dermatologist.
- Do not redesign working screens without a concrete MVP reason.
- Do not rewrite working code unnecessarily.
- Do not remove existing code solely because it is outside the MVP.
- Do not treat every existing feature as a launch requirement.
- Core bugs are launch work.
- Incorrect analysis is launch work.
- Scoring problems are launch work.
- Unreliable scanning is launch work.
- Broken core flows are launch work.
- Unsafe data handling is launch work.
- Poor ingredient data is launch work.

New ideas that are not required for the core experience belong in the post-launch backlog.

---

# 31. Explicitly NOT in MVP

The MVP does **not** include:

- social/community;
- user reviews;
- influencer features;
- e-commerce/in-app purchasing;
- product discovery feeds;
- routine builder;
- skin diary;
- before/after tracking;
- AI dermatologist/chatbot;
- diagnosis;
- treatment recommendations;
- gamification;
- unnecessary advanced personalization;
- product recommendations;
- alternative-product recommendations.

These should not delay MVP launch.

---

# 32. MVP Finish Line

Skintel is ready to move toward launch when a new user can reliably:

1. Open the app.
2. Choose Quick Scan or Personalize.
3. If personalizing, answer:
   - Age;
   - Skin concerns;
   - Skin type;
   - Sensitivity.
4. Reach the scanner immediately.
5. Scan a product by barcode **or** photograph its ingredient list.
6. Successfully retrieve/read ingredient information.
7. Receive a clear analysis.
8. See a personalized 0–100 compatibility score when a profile is available.
9. Understand the main reasons behind the score.
10. Open detailed ingredient information.
11. Save/view the product where those MVP features are available.
12. Recover gracefully when scanning, OCR, lookup, network, or permissions fail.

The core experience must be reliable enough for real users.

The analysis must be sufficiently trustworthy and explainable.

---

# 33. Launch Quality Priorities

Before launch, prioritize quality in this order:

## 1. Scoring algorithm

Review, refine, validate, and make it explainable.

## 2. Ingredient / chemical library

Ensure reliable, sufficiently broad ingredient data and safe unknown-data handling.

## 3. Core scanning experience

Ensure barcode detection and ingredient-photo/OCR scanning work reliably.

## 4. Core user journey

Ensure:

**Open → Scan → Analyze → Results**

works reliably.

## 5. Safety / privacy / data handling

Ensure the product handles user data appropriately and does not make unsupported medical or guaranteed claims.

---

# 34. Decisions Still TBD

Only implementation/code-review questions remain open.

## Age

- Exact input format: TBD if not already finalized in the implementation.
- Exact effect on scoring: TBD until scoring is audited.

## Barcode implementation

The exact barcode library/SDK must be determined by inspecting the existing codebase.

Do not assume or replace it without reason.

## OCR implementation

Audit the existing implementation before deciding whether changes are required.

## Ingredient data

Audit the current ingredient data sources and coverage before deciding what must be replaced or expanded.

## Scoring implementation

Audit the current algorithm before deciding exact factor weights or age behavior.

These are audit questions, not invitations to expand product scope.

---

# 35. Post-MVP Backlog

The following ideas are intentionally deferred:

- product recommendations;
- better alternatives;
- product discovery;
- social/community;
- reviews;
- e-commerce;
- routine builder;
- AI dermatologist/chatbot;
- skin diary;
- before/after tracking;
- gamification;
- advanced personalization;
- influencer features;
- complex growth features.

These should be evaluated after launch using real user behavior and feedback.

---

# 36. Source-of-Truth Rule

When there is a conflict between:

- an existing feature in the repository;
- an old product idea;
- an old implementation;
- a new feature suggestion;

the **locked MVP decisions in this document determine launch scope**.

The existing GitHub repository is the **reference implementation**.

This document is the **MVP product boundary**.

A feature existing in the repository does not mean it needs to be completed, expanded, redesigned, or promoted into the MVP.

---

# 37. Final MVP Definition

> **Skintel lets a skincare shopper scan a product, analyze its ingredients, and quickly understand how compatible that product appears with their skin through an explainable personalized compatibility score and ingredient-level findings.**

The MVP's job is to do this **quickly, clearly, reliably, and safely**.

Anything that does not help deliver that experience should not delay launch.
