# Voice

How for.me sounds, across verdicts, onboarding, and every empty, error and
permission state (`FOR_ME_MVP.md`, "Matching and content, in both tiers":
"One voice across verdicts, onboarding and entries").

## This document loses to the claims policy

`docs/claims-policy.md` is a hard constraint, enforced by
`__tests__/claims-policy.test.ts`. Nothing here overrides it. Warmth is not
an exception: "helps your barrier recover" is warmer than "supports the
skin barrier", and it is also exactly the kind of phrasing the claims
policy forbids (a repair/regeneration claim). If a warmer version of a
sentence would make a new efficacy, comparative, quantitative or
regulator-related claim, the colder version ships. The claims policy's own
closing line is the standard this document inherits: *"If copy makes a new
efficacy, comparative, quantitative or regulator-related claim, stop and
review its evidence even when no denylist pattern fires."*

## Principles

Each principle is a real sentence already shipping in this app, held up as
the standard, next to a plausible version this app does **not** write —
the register these principles rule out, not a real regression.

### 1. Say what happens, not that something went wrong in general

> **What we ship:** "Answer a few questions and we can tell you how this
> suits you." (`lib/matching.ts`, `verdictHeadline`)
>
> **What we don't write:** "Unable to generate a compatibility score at
> this time."

The first sentence tells the person what to do next. The second reports a
system state and stops. Every unknown/failure/empty string in this app
names the next action or the reason in plain terms — never just that
something didn't happen.

### 2. Name what's true about the photo or the connection, not a guess

> **What we ship:** "That doesn't look like an ingredient list."
> (`lib/read-label-photo.ts`) and "We couldn't reach our servers."
> (`failureCopy`'s copy for the `network_error` reason, #188)
>
> **What we don't write:** "Something went wrong. Please try again."

A generic retry message is honest about nothing. This app tells the
photo-side problem and the connection-side problem apart on purpose — the
status mapping in `data/api.ts`'s `readLabel` and `saveScannedProduct`
decides which it is, and `lib/read-label-photo.ts`'s `failureCopy` words
it — because the fix is different (retake vs. check your signal), and
#188 exists specifically because that distinction had gone missing in two
places. (`classifyFailure` is the barcode lookup's equivalent; the photo
path doesn't use it.)

The one deliberate exception: `components/LabelCamera.tsx` and
`components/ChoosePhotoInstead.tsx` each wrap the whole capture/read
sequence in a last-resort `catch` for a genuinely unexpected exception —
not a classified photo/network failure, which `readLabelPhoto`'s own
typed result already handles — and that catch falls back to "Something
went wrong reading that." There's no true statement about an
unanticipated exception's cause, so this is the one place the generic
form is honest rather than lazy.

### 3. The reader is not to blame, and the tone should never suggest it

> **What we ship:** "That's a lot of ingredient photos in a short time."
> (`lib/read-label-photo.ts`) — not "rate-limited", a word about *our*
> system, not theirs. `data/api.ts`'s `rate-limited` case states this
> directly: *"the person reading this is holding a bottle in a shop, and
> the word is ours, not theirs."*
>
> **What we don't write:** "You've exceeded the request limit."

An internal term (rate limit, 5xx, token) never reaches the screen. If a
sentence would only make sense to someone who has read the code that
produced it, it is not ready to ship.

### 4. Confidence without certainty

> **What we ship:** "We couldn't read enough of this formula to judge it"
> (`verdictHeadline`, `unknownReason: "low_coverage"`) rather than silently
> scoring a formula the app barely identified.
>
> **Written but not yet on screen:** "The assessment is an ingredient-based
> compatibility analysis and is not a guarantee of an individual's skin
> reaction." (`FOR_ME_MVP.md`, "Brief context/disclaimer") — the intended
> results-screen disclaimer. No component renders it yet (a repo-wide
> search turns up nothing), so treat it as the register that sentence
> should hit once it ships, not as already-shipped copy.
>
> **What we don't write:** "This product is a safe match for your skin."

The app states what it found and how sure it is, and stops there. It never
implies a guarantee the ingredient list can't support — this is the same
line the claims policy draws, from the copy side rather than the policy
side.

### 5. Warm means saying what just happened, not celebrating it

> **What we ship:** "The first page of your journal" / "Everything you save
> is kept here, on any phone you sign in on. Add a note when you like — how
> it wore, whether you'd buy it again." (`lib/first-page.ts`,
> `FIRST_PAGE_COPY`, #230 — shown once per account, on its first saved
> product)
>
> **What we don't write:** "Congratulations! You've started your skincare
> journey!"

The warm version names what happened and what it's for, in the reader's own
terms: a journal, a note, buying again. No exclamation point, no "journey",
and nothing about their skin — the note prompt's rule (#228) holds here too.
The string lives in the code; this is its example, not a second copy to keep
in step.

## What this voice is not

- **Not clinical.** No "the formula demonstrates", no passive-voice lab
  report. Second person, active voice: "we couldn't", "you can", not "it
  was unable to" or "an error occurred."
- **Not a diagnosis, a treatment plan, or a guarantee.** This is the same
  boundary `docs/claims-policy.md` enforces mechanically; here it also
  means the tone never *reads* more certain than the policy allows, even
  in a sentence that would pass the denylist scan on its own.
- **Not cute.** No exclamation points, no "Yay!", no forced enthusiasm
  about a barcode miss. Warm means direct and unembarrassed about
  limitations, not upbeat.
- **Not apologetic past the point of usefulness.** One acknowledgement,
  then the way forward — "We couldn't read that image. Try again with
  steadier hands or better light," not three sentences of sorry before the
  actual instruction.
- **Not a place to explain internals.** No status codes, no "the server
  returned", no mention of Supabase, Vision, or a read token by name. The
  one narrow exception already in the app: naming Google directly in the
  camera-permission copy ("we crop to the frame, send it to Google to read
  the text, and never store the image") — because that is a privacy
  disclosure, not an error, and disclosing exactly who receives an image is
  more honest than a vaguer "our servers."

## Conventions

- **Second person, always.** "Your skin", "you can", never "the user."
- **Contractions.** "We couldn't", "doesn't", "isn't" — not "we could not",
  "does not." The one place this app deliberately breaks its own pattern
  is the legal/medical disclaimer sentence (`FOR_ME_MVP.md`, "Brief
  context/disclaimer") — not yet rendered anywhere, but the intended
  exception once it is, where the slightly more formal register is the
  point.
- **Sentence case for titles and headlines**, not Title Case. "We don't
  have this product yet", not "We Don't Have This Product Yet."
- **One sentence of feeling, then the instruction.** A failure state names
  what happened in a half-sentence at most, then says what to do.
- **Never repeat an internal name back to the user** — no "read token",
  "Supabase", "Edge Function", "rate limit", "classifyFailure." If a
  screen needs to reference *why* honestly, it describes the effect
  ("that's a lot of photos in a short time"), not the mechanism.
- **The same action keeps the same words.** Both empty states in Saved
  that send you to the scanner end in "Scan a product"
  (`app/(tabs)/saved.tsx`, `EMPTY_COPY`) — not one "Scan a product" and
  one "Start scanning". When a new screen offers an action another screen
  already names, reuse that name rather than writing a fresh one that says
  the same thing slightly differently.

## Copy inventory

Where user-facing strings live, and whether the claims-policy audit
already sees them. A future ticket introducing a new collection here
should add it to `__tests__/claims-policy.test.ts` in the same PR — see
that file's own instruction at the top of `OWNED_CLAIMS`.

| Surface | File(s) | Claims-audited? |
|---|---|---|
| Verdict headline | `lib/matching.ts` (`verdictHeadline`) | Yes — added in #187, its own `HEADLINE_RESULTS` collection |
| Score explanation | `lib/matching.ts` (`scoreExplanation`) | Yes — `scoreExplanation[]` |
| Confidence label | `lib/matching.ts` (`confidenceLabel`) | No — three fixed words ("high"/"moderate"/"low"), not a sentence; nothing to audit |
| Ingredient rule reasons | `lib/rules.ts` (`INGREDIENT_RULES[].reason`) | Yes — **out of scope for this ticket**, see below |
| Pore-clogging reasons | `lib/pore-clogging.ts` (`PORE_CLOGGERS[].reason`) | Yes — **out of scope**, see below |
| Pregnancy-caution reasons | `lib/pregnancy-caution.ts` | Yes — `PREGNANCY_CAUTION.*.reason`, audited directly (the `contraindications[]` collection never reached them: it runs over the sample ingredients, which hold none of these names) |
| Contraindication reasons | `lib/safety.ts` (`contraindications`) | Yes — `contraindications[]` |
| Context nudges (sun/SPF) | `lib/context-nudges.ts` | Yes — `contextNudges[]`, every variant (#234) |
| Pairing notes (evening, layering, shelf) | `lib/active-pairings.ts` | Yes — `pairingNotes[]`, every variant (#233) |
| Skincare School | `data/school.ts` | Yes — every question and answer, `SCHOOL.*` (#235) |
| Skincare School chat lines | `lib/school-chat.ts` (`SCHOOL_CHAT_COPY`) | Yes — `SCHOOL_CHAT_COPY.*`: the greeting, prompt and no-answer reply (#352) |
| Sample ingredient notes | `data/ingredients.ts` (`.note`) | Yes — `INGREDIENTS.*.note` |
| Sample product copy | `data/products.ts` (`.description`, `.benefits`) | Yes — `PRODUCTS.*` |
| Onboarding carousel | `app/onboarding/index.tsx` (`SCREENS`) | No — not a claim surface (headline/supporting copy naming what the app does, not an ingredient/product claim) |
| Skin quiz steps | `app/quiz/*.tsx` (title/subtitle) | No, same reason |
| Skin profile screen | `app/skin-profile.tsx` | No, same reason |
| Scan failure copy (photo/network split) | `lib/read-label-photo.ts` (`failureCopy`) | No — operational copy, not an ingredient/product claim |
| Save failure copy | `app/add-product.tsx` (`SAVE_FAILURE_COPY`) | No, same reason |
| Barcode lookup failure | `data/api.ts` (`failureMessage`) | No, same reason |
| Scanner status panels | `app/scanner.tsx` (`BarcodeStage`, `IngredientsStage`) | No, same reason |
| Camera/permission intros | `app/scanner.tsx` (`CameraPermissionIntro` usages), `app/add-product.tsx` | No, same reason |
| Empty states, and the guest line | `app/(tabs)/saved.tsx` (`EMPTY_COPY`, `GUEST_SHELF_LINE`, #300) | No, same reason |
| Sign-in sheet and its failures | `app/sign-in.tsx`, `lib/auth.ts` (`signInFailureCopy`) | No — account copy, not an ingredient/product claim. Closing the provider's sheet deliberately has no copy at all (#220) |
| Account screen | `app/account.tsx` | No, same reason |
| Journal note — the app's prompt, placeholder, buttons and too-long message | `lib/journal.ts` (`NOTE_COPY`, `tooLongCopy`) | Yes — `NOTE_CLAIMS` (#228). The prompt asks about the product ("What did you think of it?"), never about skin |
| Journal note — the note itself | The person's own words, on the saved row | **No, deliberately** — `docs/claims-policy.md` governs app-authored copy; a note is never audited, rewritten or refused for wording (#228) |
| First-page moment | `lib/first-page.ts` (`FIRST_PAGE_COPY`) | Yes — `FIRST_PAGE_CLAIMS` (#230). Example under principle 5 |

**Out of scope, on purpose:** `INGREDIENT_RULES[].reason` and
`PORE_CLOGGERS[].reason` are each a specific evidence claim — `CLAUDE.md`
records that every rule carries "the sentence shown to the user." The
claims-policy denylist catches a forbidden word; it does not catch a
claim quietly softened or strengthened by a warmth pass. Rewriting that
many evidence sentences needs an evidence review per sentence, not a
voice pass, and is its own ticket if it happens at all. (Deliberately not
naming a count here: `CLAUDE.md` dropped its own hardcoded rule-count for
the same reason — `INGREDIENT_RULES` grows independently of this
document.)
