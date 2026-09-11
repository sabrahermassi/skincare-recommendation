# Handoff: Manassa — three-screen onboarding

## The prompt to give Claude Code

> Read `design/onboarding/README.md` and implement the Manassa three-screen onboarding
> flow in this codebase. Copy `design/onboarding/assets/` into the app's asset folder.
> Follow the codebase's existing component and styling patterns — the HTML file is a design
> reference, not code to paste. Match every value in the Design Tokens and Layout sections
> exactly, and read the "Do not simplify these" section before changing any of them.

That is the whole prompt. Everything below is written for an implementer with no other
context.

Two optional additions:

- On an unfamiliar codebase — *"Before writing code, tell me which files you'll create or
  change and how you'll structure the three screens in this stack."*
- On a fresh repo with no patterns yet — *"There are no existing patterns to follow — set
  the screens up in a way that suits the rest of the app."*

---

## Overview

Manassa is a Korean-skincare ingredient scanner. The user scans a product's barcode or
ingredient list and gets a match score for their own skin, based on a short skin-profile
quiz. It is an intelligence tool, not a shop — no prices, no buy buttons.

This package is the **three-screen first-launch onboarding carousel**. Its job is to
explain the app in three beats — scan, analyze, know — and hand the user to the app.

| # | Headline | Supporting copy | Primary action |
|---|---|---|---|
| 1 | Scan any product | Point your camera at a barcode or ingredient list | Next |
| 2 | We check every ingredient | Matched against your skin profile | Next |
| 3 | Know what suits you | Clear answers in seconds, wherever you're shopping | Get started |

All three also carry a **Skip** in the top right.

## About this package

`onboarding.html` is a **design reference created in HTML** — a prototype showing intended
appearance, not production code. There is no build step and no component structure worth
preserving; the inline styles exist so it renders instantly in a browser.

Recreate it in the target codebase's own environment (React Native / Expo, React, SwiftUI,
native Android — whatever the project uses), following its established patterns. If no
environment exists yet, pick the appropriate one.

**The three PNGs in `assets/` are the exception** — those are final production artwork.
Copy them in as-is. Do not regenerate, redraw, recolour, crop or substitute them.

For context: the app was previously scoped against `sabrahermassi/skincare-recommendation`
(React Native / Expo), with `expo-camera` + `expo-barcode-scanner` for the two scan modes.

## Fidelity

**High-fidelity.** Every colour, size, weight, letter-spacing, radius and gap below is
final and deliberate. Where a value looks oddly specific (`14.5px`, `-.018em`, `flex:1.9`,
`height:68px`), it was measured and chosen — keep it.

Reference viewport: **375 × 812 px** (1× CSS px). Design in points/dp at these numbers.

---

## Layout

The three screens share **one layout**. Only the illustration, the two copy lines, the
active dot and the button label differ.

Single full-screen column: `display:flex; flex-direction:column`, background `#FBF4EE`.

| # | Element | Sizing |
|---|---------|--------|
| 1 | Skip row | intrinsic, `padding:54px 16px 0`, right-aligned |
| 2 | Illustration block | **`height:430px; flex:none`**, contents centred |
| 3 | Elastic spacer A | **`flex:1.9; min-height:18px`** |
| 4 | Text group | intrinsic, `padding:0 22px`, internal `gap:10px` |
| 5 | Elastic spacer B | **`flex:1; min-height:12px`** |
| 6 | Button row | intrinsic, `padding:0 24px 32px` |

The text group (4) contains, in order:

| Element | Sizing |
|---|---|
| Headline | **`height:68px`**, flex-centred both axes |
| Supporting copy | **`height:44px`**, flex `justify-content:center; align-items:flex-start` |
| Progress dots | intrinsic, `gap:7px` |

Measured positions at 375×812, for verification:

```
skip row       y   0 →  98
illustration   y  98 → 528   (430 tall, flex:none)
spacer A       y 528 → 569   (41px  — flex:1.9)
text group     y 569 → 707   (138 total)
  headline       y 569 → 637   (fixed 68)
  gap            y 637 → 647   (10)
  copy           y 647 → 691   (fixed 44)
  gap            y 691 → 701   (10)
  dots           y 701 → 707   (6)
spacer B       y 707 → 728   (21px  — flex:1)
button         y 728 → 780   (52 tall)
bottom pad     y 780 → 812   (32)
```

### Do not simplify these

Four values look arbitrary and are not. Each fixes a specific bug found during design.

**1 · The headline box is a fixed 68px, and the copy box a fixed 44px.**
Screen 2's headline wraps to two lines; screens 1 and 3 are one line. Screen 3's
supporting copy wraps to two lines; 1 and 2 are one. With auto heights, the dots and the
button land at a **different y on each screen**, so they visibly jump as the user swipes
through the carousel. The fixed boxes are what pin them. **Do not convert these to auto
height or padding.** If you change the copy, check it still fits: 68px holds two lines of
30px Playfair at 1.08, and 44px holds two lines of 14.5px at 1.5.

**2 · The spacers are weighted 1.9 : 1, not equal.**
The air above the text group is deliberately about twice the air below it, so the gap
between the illustration and the headline is the largest space on the screen and the
button sits closer to the copy it belongs to. Equal spacers make the button float.

**3 · The illustration block is a fixed 430px, and the three images are sized differently
inside it.** See Assets — this is the one that most invites "tidying" and must not be.

**4 · The buttons are sized, not padded.** `min-height` + flex centring, not vertical
padding. With `line-height:normal` the content box is font-derived, so equal padding
produces *unequal* heights across different font sizes. The `Skip` target at 13.5px would
land at 33.6px from padding that gives the primary button 52px — i.e. under the 44px
minimum. This exact bug appeared twice during design. Use `min-height`.

---

## Components

**1 · Skip**
- Text `Skip`, system sans **13.5px / 500**, colour `#6B5A54`
- `min-height:44px; min-width:56px`, flex-centred — no background, no border
- Right-aligned in a row with `padding:54px 16px 0`
- Present on all three screens, including the last

**2 · Illustration block**
- `height:430px; flex:none; display:flex; align-items:center; justify-content:center`
- Screen 1 also needs `box-sizing:border-box; overflow:hidden` — it bleeds (see Assets)
- Decorative → empty alt text on all three

**3 · Headline**
- **Playfair Display**, weight **500**, size **30px**, `line-height:1.08`,
  `letter-spacing:-.018em`, colour `#5A342C`, centred, `text-wrap:pretty`
- In the fixed 68px box, vertically centred

**4 · Supporting copy**
- System sans **14.5px / 400**, `line-height:1.5`, colour `#6B5A54`, centred,
  `text-wrap:pretty`
- In the fixed 44px box, **top-aligned** (`align-items:flex-start`) — so a one-line and a
  two-line version both start at the same y
- Screen 3's copy contains a typographic apostrophe in "you're" (U+2019), not a straight
  quote

**5 · Progress dots**
- Row, `gap:7px`
- Active: `20 × 6`, `border-radius:3px`, `background:#5A342C`
- Inactive: `6 × 6`, `border-radius:6px`, `background:#E4D3C8`
- Position 1, 2, 3 active on screens 1, 2, 3 respectively

**6 · Primary button**
- Fill `#F2BFA6`, text `#5A342C`, `border-radius:26px` (pill)
- `padding:15px 20px`, `min-height:52px`, `font-size:15px`, `font-weight:500`
- `box-shadow: 0 3px 12px rgba(90,52,44,.13)`
- Full width inside the 24px gutter → 327 × 52
- Label: `Next` on screens 1 and 2, **`Get started`** on screen 3

The shadow is load-bearing, not decoration — see Accessibility.

---

## Interactions & Behavior

- **`Next`** (screens 1, 2) → advance to the next screen.
- **`Get started`** (screen 3) → leave onboarding and route to the **skin-profile
  quiz**, always — regardless of whether a profile already exists.
- **`Skip`** (all three) → leave onboarding and go straight to the **scanner**,
  always — regardless of whether a profile exists. If the user reaches the scanner
  with no profile, degrade gracefully: show the ingredient breakdown but suppress the
  personal match score rather than inventing one.
- **First-launch only.** Persist a `hasSeenOnboarding` flag and skip the flow on later
  launches.
- **Swipe** left/right between screens if the platform's carousel idiom expects it; the
  dots then double as the page indicator. The fixed-height boxes above exist precisely so
  that swiping does not make the dots and button jump.
- **Back** from screen 2 or 3 should return to the previous screen, not exit the flow.
- **Press states are not specified.** Suggested: primary darkens to `#E8AC8E`; `Skip`
  drops to 60% opacity. Do not add a border on press — the flat fill plus shadow is the
  design.
- **No animation specified** for the carousel itself. A standard horizontal slide is fine.
  If you add an entrance, a 250–300ms staggered fade-and-rise (illustration → headline →
  copy → button) suits the brand; keep the total under 600ms.
- No loading or error states — these screens have no data dependency.
- **Responsive:** single centred column; the two elastic spacers absorb height
  differences. Test at 375×667, where both hit their `min-height` floors — at that height
  the 430px illustration block is the first thing you may need to reduce. Nothing uses
  viewport units.

## State Management

Two values:

- `hasSeenOnboarding: boolean` — set true on `Get started` or `Skip`
- `onboardingIndex: 0 | 1 | 2` — current screen, drives the dots

Downstream, for context only: the quiz collects `skinType`
(oily / combination / dry / sensitive / not sure), `concerns[]`, `gender`, `ageRange` and a
`sensitive` flag; the match engine consumes those.

---

## Design Tokens

### Colour

| Token | Hex | Used for |
|---|---|---|
| Canvas | `#FBF4EE` | screen background (flat, no pattern, no panels) |
| Ink | `#5A342C` | headline, button text, active dot |
| Muted | `#6B5A54` | supporting copy, Skip |
| Peach (button) | `#F2BFA6` | primary button fill |
| Dot inactive | `#E4D3C8` | inactive progress dots |
| Button shadow | `rgba(90,52,44,.13)` | `0 3px 12px` under the primary button |

The illustrations carry their own peach, blush, sage and lilac shapes. **Those colours are
deliberately not repeated as UI**, and there are deliberately **no tinted panels** behind
the artwork — an earlier revision had them, and the illustrations' own colour shapes
competed with the panel (worst on screen 2, where sage and lilac sat on a lavender field,
and screen 1, where peach blobs nearly vanished on a peach panel). Keep the canvas flat.

### Typography

- **Playfair Display** (500) — headlines only.
- **System sans** (`-apple-system, "SF Pro Text", system-ui`) — everything else.

| Role | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| Headline | 30 | 500 | 1.08 | −.018em |
| Supporting copy | 14.5 | 400 | 1.5 | — |
| Button label | 15 | 500 | normal | — |
| Skip | 13.5 | 500 | normal | — |

Bundle Playfair Display 500 locally; the reference file loads it from Google Fonts.

### Spacing

Gutters: 16 (Skip row), 22 (text group), 24 (button). Gaps: 7 (dots), 10 (text group).
Fixed blocks: 430 (illustration), 68 (headline), 44 (copy). Spacer floors 18 / 12,
weights 1.9 / 1. Top padding 54, bottom padding 32.

### Radius

26 (primary button, pill), 3 / 6 (dots). Nothing else is rounded.

### Elevation

One shadow only: `0 3px 12px rgba(90,52,44,.13)` on the primary button. The `.device`
wrapper's shadow in the reference file is presentation only — do not port it.

---

## Assets

Three transparent PNGs in `assets/`, hand-illustrated line art with soft colour shapes.
Each has transparent padding baked in — **do not crop it**, the sizing accounts for it.

| File | Screen | Native px | Aspect (w:h) | Rendered |
|---|---|---|---|---|
| `onb-scan.png` | 1 · Scan | 637 × 541 | 1.18 landscape | **400 wide** → 340 tall |
| `onb-think.png` | 2 · Analyze | ~650 × 1050 | 0.62 portrait | **404 tall** |
| `onb-face.png` | 3 · Know | ~920 × 1045 | 0.88 portrait | **404 tall** |

CSS used:

```
/* screen 1 — sized by WIDTH, bleeds past the frame */
width:400px; max-width:400px; display:block
/* block needs: box-sizing:border-box; overflow:hidden */

/* screens 2 and 3 — sized by HEIGHT */
height:404px; max-width:375px; max-height:430px; display:block
```

**The three images cannot share one size rule, and this is the thing most likely to get
"fixed" incorrectly.** Their aspect ratios are 1.18, 0.62 and 0.88 — one landscape, two
portrait. Screens 2 and 3 are sized by height and fill the block at 404px, about 50% of
the screen. Screen 1 is landscape: at that same height it would need roughly 478px of
width inside a 375px frame. It is therefore sized by width at 400px, which **deliberately
bleeds ~12px past each frame edge**, consuming the file's transparent margin, and lands at
340px tall (42% of the screen). Pushing it larger starts cutting her hair and the dropper
bottle.

Consequences for the implementer:

- Screen 1's illustration block **must** clip (`overflow:hidden`). A layout validator will
  report ~13px of the image cut off by its container — **that is intentional**, not a bug.
- Screen 1's figure reads slightly smaller than screens 2 and 3. That is a known, accepted
  trade-off. Making it match is an *illustration* change — re-composing the artwork to a
  portrait crop — not a layout one. Do not attempt it in code.

Native resolution is 1.6–2.5× the rendered size, so all three are sharp at 2× and
acceptable at 3× device pixel ratios without re-export.

---

## Accessibility — two findings, both deliberate

Disclosed rather than silently changed, because the values were chosen intentionally.

**1 · Muted text — resolved.** The original mockup colour, `#9B665B` on `#FBF4EE`,
measured **4.34:1**, just under the 4.5:1 minimum for body text (it carries the
supporting copy at 14.5px and `Skip` at 13.5px). The shipped app uses the existing
`MUTED` token, `#6B5A54`, which measures **6.0:1** and clears the threshold with
room to spare.

**2 · The button's edge is faint, which is why it has a shadow.** The label is fine —
`#5A342C` on `#F2BFA6` is **6.51:1**. But the fill sits only **1.51:1** against the
canvas, well under the 3:1 a control boundary normally wants. There is no border, so
`0 3px 12px rgba(90,52,44,.13)` plus the surrounding whitespace is the only thing
separating the CTA from the page. **Do not remove the shadow, and do not reduce the
`flex:1` spacer above the button.**

Also: warming the canvas past `#FBF4EE` makes both worse — at `#FAF1E9` the text drops to
4.23:1 and the button edge to 1.47:1. `#FBF4EE` is the chosen balance point.

---

## Files

| File | What it is |
|---|---|
| `README.md` | This spec. Self-sufficient. |
| `onboarding.html` | Design reference, all three screens. Open in a browser. Port the contents of each `.screen`. |
| `assets/*.png` | Final production artwork. Copy as-is. |

Source of truth in the design project: `Manassa Onboarding Sequence 3.dc.html`.

## Not included

The rest of the app exists as designs but is outside this handoff: scanner (live camera),
result / match score, ingredient list, ingredient detail, product, compare, saved, browse,
profile, and the multi-step skin-profile quiz. Ask if you want any of those packaged the
same way.
