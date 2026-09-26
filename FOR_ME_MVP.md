# for.me — MVP Source of Truth

**Status:** Locked product decisions  
**Purpose:** This document defines the for.me MVP and is the source of truth for launch scope.

> The existing GitHub repository may contain functionality beyond this MVP. Existing functionality does not automatically belong to the MVP. Working non-MVP functionality does not need to be deleted; it should simply not receive additional scope or priority before launch.

---

# 1. Product Definition

## What for.me does

for.me helps people quickly understand whether a skincare product **appears compatible with their skin** by analyzing its ingredients.

## Core question

> How compatible is this product with my skin, and are there any ingredient-related reasons I should be cautious?

## Core outcome

The user should be able to:

1. Identify a skincare product.
2. Analyze its ingredients.
3. Understand how compatible it appears with their skin.
4. See the main ingredient-related reasons behind that assessment.
5. Make their own decision about the product.

for.me informs the user's decision. It does **not** decide whether the user should buy or use a product.

## What for.me is not

for.me does not:

- diagnose skin conditions;
- diagnose allergies;
- prescribe treatments;
- guarantee that a product will or will not work;
- guarantee that a product is safe for an individual;
- determine whether someone should buy or use a product;
- act as an AI dermatologist.

---

# 2. Target User

for.me is for people who buy skincare products and want to quickly determine whether a product appears to be a good fit for their skin before buying or using it.

The MVP particularly helps users understand whether ingredients may be relevant to:

- acne and blemishes;
- irritation/sensitivity;
- their selected skin concerns;
- their skin type.

---

# 3. Problem

Choosing skincare often requires researching ingredients across multiple websites and sources.

The problem for.me solves is the fragmented manual research process:

**Product → copy ingredients → research multiple websites → compare information → decide**

for.me aims to simplify this into:

**Product → Scan → Analyze → Understand**

---

# 4. Differentiation

for.me's key differentiation is:

> **Streamlining scattered manual skincare ingredient research into one quick scan and personalized ingredient-compatibility analysis.**

The product is focused on helping users quickly understand a product rather than becoming a skincare social network, shopping platform, routine builder, or AI dermatologist.

---

# 5. Core MVP User Journey

The central MVP experience is:

**Open → Quick Scan or Personalize → Home → Scan → Scan Product → Analyze → Results**

For returning users:

**Open → Home → Scan → Results**

`Home` (`app/(tabs)/index.tsx`, route `/`) is the landing screen after onboarding
and on every return — not the scanner directly. `Scan` opens from a raised
floating button on Home, not from a scanner tab. See §8 and §9.

`Scan Product` means photographing the ingredient list by default and scanning
a barcode as the shortcut, per #214 — decided, not yet built. See §9.

Everything in the MVP should support this core experience.

---

# 6. First App Open

The first-ever app open starts with a 3-screen welcome/value-proposition
carousel (`app/onboarding/index.tsx`).

**Scan first, quiz later (#346, 26 September 2026).** "Get started" on the
carousel's last screen and "Skip" on any of its 3 screens both go straight
to Home (`/`). No skin question is asked before the first scan. Home, not
the scanner, is where onboarding hands off — the scanner opens from Home's
raised floating button. See §8/§9.

## Quick Scan

The default. A result without a profile still answers straight away with the
Ingredient check (#345), the same for everyone, and offers **See your skin
match** in place of a personal score.

Flow:

**Welcome carousel → Home → Scan → Result (Ingredient check + See your skin match)**

No personalization questionnaire is required before scanning.

## Personalize My Results

The skin quiz (Concerns → Skin Type → Sensitivity → Pregnancy, `app/quiz/`)
opens as a modal over whatever asked for it: a result's "See your skin
match", Profile's "Skin profile" row, or the top of Search results
(`lib/open-quiz.ts`).

Flow:

**Result → See your skin match → Quiz → back to the same result, now scored**

Finishing the last step closes the quiz back onto that same screen. Skip, or
swiping it down, closes it early and keeps every answer given so far; if
they are enough to score, the score appears, otherwise the card stays.

There is:

- no "You're all set" screen;
- no summary/confirmation screen;
- no extra educational screen.

A subtle progress indicator is allowed in the quiz (its 4 dots,
`components/QuizScreen.tsx`).

---

# 7. Personalization / Skin Profile

Personalized onboarding collects exactly:

1. Skin concerns
2. Skin type
3. Skin sensitivity
4. Pregnancy / breastfeeding status

## Age

Age is **not** collected. It was evaluated and dropped: the field used to be
collected, stored, and read by nothing, so it implied a personalisation the
app never delivered. See `CLAUDE.md`'s "Personalization / Skin Profile"
section. Do not reintroduce an age question or an age-scoring rule.

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

Available options (`app/quiz/concerns.tsx`):

1. Dry / Dehydrated
2. Dullness
3. Acne or pimples
4. Dark spots
5. Enlarged pores
6. Fine lines and wrinkles
7. Redness or rosacea
8. Post-acne marks

**Uneven texture is excluded.** Sensitivity is not a concern option — it is
its own quiz step (see below). "Eczema-prone" (`atopic`) is not offered as a
selectable concern; its scoring rules stay intact for any profile that
already carries it from before that option was removed.

## Sensitivity

Available options:

- Not sensitive
- Somewhat sensitive
- Very sensitive

Sensitivity **affects the personalized score**.

## Pregnancy / breastfeeding

Available options:

- Pregnant
- Breastfeeding
- Neither
- Prefer not to say

This affects the personalized score: `lib/safety.ts` flags retinoids,
salicylic acid, hydroquinone, and essential oils as a caution when the
answer is "Pregnant" or "Breastfeeding" (`lib/pregnancy-caution.ts`).

## Information explicitly removed

Do not add:

- Gender
- "Bad reactions to any product?"
- Reaction-type questionnaire

---

# 8. Returning Users

Onboarding is first-time only.

Every subsequent app open goes directly to **Home** (`app/(tabs)/index.tsx`,
route `/`), regardless of whether the user has a personalized profile. The
scanner is one tap away via Home's raised floating Scan button, not the
landing screen itself.

A returning user without a profile can still use Quick Scan and can personalize later, from any result's "See your skin match".

Returning-user flow:

**Open → Home → Scan**

---

# 9. Scanner

After onboarding, the app opens Home (`/`). The scanner opens from Home's
raised floating Scan button.

## Default mode

**Decided 22 September 2026 (#214): the ingredient-list photo is the main scan
path. Barcode is the shortcut.**

The reasoning is coverage. The live catalogue holds roughly 851 products, so
most barcodes a real user scans in a shop will miss, and a miss costs a second
action. A printed ingredient list can be read off any product, anywhere, with
no catalogue coverage at all. Barcode keeps its place one tap away because it
wins where it wins: it is instant when it resolves, and it is the only way to
attach a scan to a catalogue product.

What this means concretely:

- a cold start opens the scanner in photo mode, with barcode one tap away;
- photographing a label produces a verdict **without** requiring a product
  name or a barcode;
- naming the product and adding it to the shared catalogue is an optional
  follow-up, not a gate;
- the barcode-miss copy points at the photo path as the normal route rather
  than as a fallback (copy work tracked in #204).

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

- a control to switch between barcode mode and ingredient-list photo mode.

There is no in-screen back/close control — the scanner opens from Home's
raised floating button rather than being a tab of its own, so leaving it
returns to Home.

> **Not built yet — tracked by #195.** A flash (torch) toggle for scanning in
> dim light, turning off when the user leaves the scanner, is planned as part
> of the scan-failure help in #195. This section used to say "no dedicated
> flash button for MVP"; that sentence is removed rather than left to
> contradict the toggle above, but the toggle itself doesn't exist in
> `app/scanner.tsx` yet — do not read this as a description of `main`
> until #195 merges.

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

---

# 11. Ingredient-List Photo Scanning

This is the main scan path (§9, #214). The scanner opens here; the mode
control switches to barcode rather than away from it.

Target flow:

**Camera (already in photo mode) → Take One Photo → Tap Scan → OCR → Confirm
the list → Ingredient Analysis → Results → optionally name the product**

The result comes before any contribution step. A user who only photographs a
label gets a full verdict and is never pushed through a naming or barcode
step to see it; adding the product to the shared catalogue is offered
afterwards as a choice. See "Confirming the list" below for the step between
OCR and analysis.

For MVP:

- one clear photo only;
- no multi-photo ingredient scanning;
- no multi-step photo collection.

## Confirming the list

After the photo is read, the user sees the ingredients the app recognized,
in the order printed on the package, before any analysis or saving.

The user can:

- confirm the list and continue to the results;
- retake the photo if the list is wrong.

This exists because a misread ingredient changes the verdict, and only the
person holding the bottle can catch it. It is one screen, one confirm
button — not an editor, and not a multi-step review.

Editing individual names is **not** MVP.

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

**We don't have this product yet**

Photograph its ingredient list and we'll add it.

Action:

**Photograph the ingredients**

## Ingredient photo unreadable

Message:

**We couldn't read the ingredients**

Get closer so the small print fills the frame, and tilt away from any glare.

Action:

**Try again**

## Analysis/network failure

Message:

**We couldn't check that just now**

It's us or the connection, not your scan.

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

# 25. MVP Features — two tiers

**The MVP has a guest tier and a signed-in tier.** Scanning and saving are
free forever and need no account; an account keeps what you save on every
phone. Nothing asks a guest to sign up: sign-in is offered, quietly, on the
Saved tab and in Account (#300, 26 September 2026, superseding #221's "the
Save action is the one place a guest is asked").

**This is a different axis from Quick Scan vs. Personalize (§6), and the two
do not interact.** Quick Scan vs. Personalize is about whether a *profile*
exists, and decides whether a score can be produced at all
(`isPersonalized` in `lib/profile.ts`). Guest vs. signed-in is about whether
an *account* exists, and decides whether anything can be kept. A signed-in
user with no profile still gets no score; a guest with a full profile still
gets the complete verdict. Neither gate stands in for the other.

## Guest — no signup

- Scan a product: **ingredient-list photo (the primary path)** or barcode
  (the fast path when it resolves). See §9.
- The full verdict and explanation, immediately.
- Local scan history — on the device, never synced, for guests and
  signed-in users alike.
- **Save products and star ingredients** — kept on this phone, and carried
  into the account at sign-in (#300).

## Signed-in — free account

Everything above, plus:

- **The saved shelf on every phone** — synced across devices (#223).
- **Journal notes** — an optional short note when saving (#228).
- **Routine-step tagging** — assign a saved product to a step, and filter
  the shelf by it (#227).

## Matching and content, in both tiers

- Personalized match score, and a plain-language explanation of it.
- Rule-based ingredient cleanup — no LLM anywhere in this MVP.
- Ingredient-level details; pore-clogging, acne and irritation concerns;
  beneficial properties.
- **One voice** across verdicts, onboarding and entries (#232).
- **AM/PM and active-pairing conflict flags**, per product and across the
  shelf (#233).
- **Hand-written UV and context nudges** — static content, no live API
  (#234).
- **Skincare School** — 15–20 curated beginner questions with pre-written
  answers; static, no AI (#235). Laid out as a chat (#352): tap a suggested
  question, or search the curated ones, and its pre-written answer appears
  as a reply. The search box never writes an answer; with no match it says
  so and offers questions it can answer.
- Product search, and the existing detailed result breakdown.

## Journal identity

- **Private by default, no sharing.** Not a default anyone may quietly
  change.
- The first save is *the first page of your journal* (#230).
- Notes render in a handwritten-style font (#229).

## Data foundation and infrastructure

- A clean products table — complete records only — with a **separate raw
  scan log** beside it (#236).
- An ingredient knowledge base seeded to **~500 ingredients** from
  INCI/CosIng, CIR and PubMed (#237). See §26.
- Open Beauty Facts as the product seed source.
- Supabase Auth (#218); analytics for guests and signed-in users (#225).
- **Sign-in is Sign in with Apple and Sign in with Google** (#217, decided
  23 September 2026). Both are native identity-token sign-ins, so there is
  no password to store or reset and no email to deliver. Two consequences
  are not optional and are part of the same shippable unit, not follow-ups:
  offering Google makes Sign in with Apple mandatory under App Store Review
  Guideline 4.8, and offering account creation at all makes **in-app
  account deletion** mandatory under Guideline 5.1.1(v) — which, with Apple
  sign-in, includes revoking the user's token through Apple's REST API
  (#224). No email/password and no magic link in this MVP.

Features already implemented should be preserved. Nothing here should be
expanded beyond what this section names.

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

**The launch target is ~500 ingredients carrying real evidence**, sourced
from INCI/CosIng, CIR and PubMed (#237).

Two different things are easy to confuse here. *Name coverage* — the
`ingredients` dictionary, ~36k names imported from CosIng and the Open
Beauty Facts taxonomy — is already broad, and is what decides whether a
scanned name is recognised at all. *Evidence* is `lib/rules.ts`, which
carries the sentence shown to the user, and today holds 61 curated rules.
The ~500 figure is the second one. Growing it is research, not an import.

---

# 27. Scoring Algorithm Review

Before launch, the existing scoring implementation must be reviewed.

Specifically inspect:

- scoring factors;
- weights;
- skin-type logic;
- concern logic;
- sensitivity logic;
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

Not applicable — age is not collected (see §7).

---

# 28. Safety & Claims

for.me's analysis is an:

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

## Where the journal stops, and the routine builder starts

Accounts are **in** the MVP (§25) — this list no longer excludes them.

Two MVP features sit deliberately close to two lines above, and the
distinction is the whole reason both lines survive:

- **Routine-step tagging (#227) is not a routine builder.** Tagging says
  *where a product belongs*. A routine builder says *when to use it* —
  morning and evening sequences, an order to follow, reminders,
  notifications, scheduling. None of that is in. If tagging starts growing a
  schedule, it has crossed the line.
- **Journal notes (#228–#230) are not a skin diary.** A note annotates a
  product you saved. A diary tracks your skin over time — daily check-ins,
  mood or weather logs, "on this day", monthly recaps, before/after photos.
  None of that is in.

**AM/PM conflict flags (#233) are not a schedule either.** Flagging that two
actives should not meet is a safety warning attached to a verdict. Telling
someone what to apply at 9pm is a routine builder.

---

# 32. MVP Finish Line

for.me is ready to move toward launch when a new user can reliably:

1. Open the app.
2. Choose Quick Scan or Personalize.
3. If personalizing, answer:
   - Skin concerns;
   - Skin type;
   - Sensitivity;
   - Pregnancy / breastfeeding status.
4. Reach the scanner immediately.
5. Photograph a product's ingredient list **or** scan its barcode — in that
   order of prominence once #214 lands; either order satisfies this line.
6. Successfully retrieve/read ingredient information.
7. Receive a clear analysis.
8. See a personalized 0–100 compatibility score when a profile is available.
9. Understand the main reasons behind the score.
10. Open detailed ingredient information.
11. Save/view the product where those MVP features are available.
12. Recover gracefully when scanning, OCR, lookup, network, or permissions fail.

A signed-in user must additionally be able to:

13. Create an account from the Saved tab or Account, and never be asked to
    at a Save; what was saved signed out is carried into the account.
14. Keep a saved shelf that survives a reinstall and appears on a second
    device.
15. Write, edit and delete a note on a saved product.
16. Tag a saved product with a routine step, and filter the shelf by it.
17. Delete the account and export the data, both reachable from the account
    screen.

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

## Barcode implementation

The exact barcode library/SDK must be determined by inspecting the existing codebase.

Do not assume or replace it without reason.

## OCR implementation

Audit the existing implementation before deciding whether changes are required.

## Ingredient data

Audit the current ingredient data sources and coverage before deciding what must be replaced or expanded.

## Scoring implementation

Audit the current algorithm before deciding exact factor weights.

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

## Deferred to v1.x / v2, named

Distinct from the list above: each of these was considered for this MVP and
deliberately left out, so none of them is an open question.

- **An AI chatbot** — "ask me anything" skincare assistant.
- **LLM or AI anywhere else.** The ingredient cleanup and the scoring are
  rule-based, and Skincare School's answers are pre-written. This MVP has no
  model in it.
- **Skin mood / weather daily check-in.**
- **Live or dynamic weather-API UV nudges.** The nudges that *are* in the
  MVP (#234) are hand-written and static; calling an API for them is this
  line.
- **Shelf-opening animation and motion polish.**
- **"On this day", seasons and chapters, monthly recap.**
- **A full routine builder** — reminders, notifications, scheduling.

## Out of MVP by explicit decision

- #194 — type the barcode by hand when the camera is off.
- #207 — the Beauty API and the Korean ingredient API wrapper. (Its third
  topic, user accounts, is now decided and in scope.)
- #215 — hybrid on-device OCR with a Google Vision fallback.

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

> **for.me lets a skincare shopper scan a product, analyze its ingredients, and quickly understand how compatible that product appears with their skin through an explainable personalized compatibility score and ingredient-level findings.**

The MVP's job is to do this **quickly, clearly, reliably, and safely**.

Anything that does not help deliver that experience should not delay launch.
