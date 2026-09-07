# Handoff: Manassa — Onboarding screen

## The prompt to give Claude Code

> Read `design/onboarding/README.md` and implement the Manassa onboarding screen in this
> codebase. Copy `design/onboarding/assets/` into the app's asset folder. Follow the
> codebase's existing component and styling patterns — the HTML file is a design reference,
> not code to paste. Match every value in the Design Tokens and Layout sections exactly.

That is all it needs. Everything below is written to be read by an implementer with no
other context.

---

## Overview

Manassa is a Korean-skincare ingredient scanner. The user scans a product's barcode or
ingredient list and gets a match score for their own skin, based on a short skin-profile
quiz. It is an intelligence tool, not a shop — no prices, no buy buttons.

This package is **one screen**: the first-launch onboarding. Its job is to establish the
brand, explain the app in three words, and route the user either into a first scan or into
the skin-profile quiz.

## About this package

`onboarding.html` is a **design reference created in HTML** — a prototype showing intended
appearance, not production code. There is no build step and no component structure worth
preserving; the inline styles exist so it renders instantly in a browser.

Recreate it in the target codebase's own environment (React Native / Expo, React, SwiftUI,
native Android — whatever the project uses), following its established patterns. If no
environment exists yet, pick the appropriate one for the project.

**The four PNGs in `assets/` are the exception** — those are final production artwork.
Copy them in as-is. Do not regenerate, redraw, recolour or substitute them.

For context: the app was previously scoped against `sabrahermassi/skincare-recommendation`
(React Native / Expo), with `expo-camera` + `expo-barcode-scanner` for the two scan modes.

## Fidelity

**High-fidelity.** Every colour, size, weight, letter-spacing, radius and gap below is
final and deliberate. Where a value looks oddly specific (`13.5px`, `-.018em`, `flex:1.4`),
it was measured and chosen — keep it.

Reference viewport: **375 × 812 px** (1× CSS px). Design in points/dp at these numbers.

---

## Screen: Onboarding

**File:** `onboarding.html` — open in a browser. The `.device` wrapper is presentation only;
port the contents of `.screen`.

### Layout

Single full-screen column: `display:flex; flex-direction:column`, background `#FBF4EE`.

Children in order:

| # | Element | Sizing |
|---|---------|--------|
| 1 | Elastic spacer A | `flex:1; min-height:20px` |
| 2 | Hero row | intrinsic — image `max-width:300px` |
| 3 | Wordmark + tagline | intrinsic, `padding:22px 24px 0`, internal `gap:12px` |
| 4 | **Fixed** gap | `height:54px; flex:none` |
| 5 | Three-icon row | intrinsic, `padding:0 24px` |
| 6 | Elastic spacer B | `flex:1.4; min-height:28px` |
| 7 | Action group | intrinsic, `padding:0 24px 32px`, internal `gap:4px` |

**Horizontal gutter is 24px everywhere.** No exceptions.

**The two elastic spacers are weighted 1 : 1.4, and that asymmetry is intentional.** The
CTA gets more air beneath the icon row than the hero gets above it. At 375×812 they resolve
to roughly 80px and 112px.

**The 54px gap at step 4 must stay fixed, not elastic.** An earlier revision used three
equal `flex:1` spacers; the leftover height then split evenly and opened a ~170px void
between the tagline and the icon row — wider than the hero-to-name gap, which read as a
bug. Pairing the identity block with the feature row at a fixed 54px and putting all the
elastic air at the top and bottom is what fixes it. **Do not convert this to a flex gap.**

Measured positions at 375×812, for verification:

```
spacer A      y   0 → 80
hero          y  80 → 335   (255 tall at 300 wide)
wordmark+tag  y 335 → 420
fixed gap     y 420 → 474
icon row      y 474 → 578
spacer B      y 578 → 682
actions       y 682 → 812   (button 682→732, link 736→780, 32px bottom pad)
```

### Components

**1 · Hero illustration**
- `assets/illustration-22.png` — character holding a phone and a dropper bottle
- `width:100%; max-width:300px; height:auto`, centred
- Decorative → empty alt text
- Renders 300 × 255 (native 637 × 541, aspect 1.19)

**2 · Wordmark**
- The string `Manassa`
- **Playfair Display**, weight **500**, size **40px**, `line-height:1`,
  `letter-spacing:-.018em`, colour `#5A342C`

**3 · Tagline**
- `Find your skin's perfect match`
- System sans, **15px / 400**, `line-height:1.5`, colour `#9B665B`, centred,
  `text-wrap:pretty`
- **No terminal punctuation.** The apostrophe is a typographic one (U+2019), not a straight
  quote.

**4 · Three-icon row**

A 3-column grid: `grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px`. Each column is
a flex column, `align-items:center`, `gap:10px`, `min-width:0`.

| Order | Asset | Label |
|---|---|---|
| 1 | `illustration-25.png` | Scan |
| 2 | `illustration-40.png` | Analyze |
| 3 | `illustration-30.png` | Know |

Each icon sits in a **fixed 72px-tall box**, `width:100%`,
`display:flex; align-items:flex-end; justify-content:center`, with the image at
`max-width:100%; max-height:72px; width:auto; height:auto; object-fit:contain`.

**This fixed bottom-aligned box is load-bearing, not styling flourish.** The three
illustrations have *different aspect ratios* — 1.21, 1.11 and 0.95. Sized by width they
come out three different heights and the three labels land on three different lines. The
fixed box gives them a shared baseline; all three labels measure at y 556. **If you
reimplement this row, verify the labels are on one line before moving on.**

Labels: system sans, **12px / 600**, `letter-spacing:-.004em`, colour `#5A342C`, centred.

**5 · Primary button** — `Scan my first product`
- Fill `#F2BFA6`, text `#5A342C`, **no border, no shadow** (deliberate)
- `border-radius:26px` (pill), `padding:15px 20px`, `font-size:15px`, `font-weight:500`
- `min-height:50px` with `display:flex; align-items:center; justify-content:center`
- Full width inside the 24px gutter → 327 × 50

**6 · Secondary action** — `Set up my skin profile first`
- Plain text, **no button chrome at all**: transparent background, no border, no radius
- System sans, **13.5px / 500**, colour `#9B665B`, centred
- `min-height:44px` with flex centring

**On both actions: size the box, do not pad the text.** `min-height` + flex centring, not
vertical padding. With `line-height:normal` the content box is font-derived, so equal
padding produces *unequal* heights across different font sizes — the secondary link at
13.5px would land at 33.6px from the same padding that gives the button 48px, i.e. under
the 44px minimum. This exact bug appeared twice during design. Use `min-height`.

---

## Interactions & Behavior

Two actions, no local state.

- **`Scan my first product`** → the camera scanner (barcode or ingredient-list mode). This
  is the primary path.
- **`Set up my skin profile first`** → the skin-profile quiz (4 questions: skin type,
  concerns, gender, age range).
- **First-launch only.** Persist a `hasSeenOnboarding` flag and route straight to the
  scanner on later launches.
- If the user scans with **no profile**, degrade gracefully: show the ingredient breakdown
  but suppress the personal match score rather than inventing one.
- **Press states are not specified.** Suggested: primary darkens to `#E8AC8E`; secondary
  drops to 60% opacity. Do not add a border or shadow on press — the flat fill is the design.
- **No animation specified.** If you add one, a 250–300ms staggered fade-and-rise
  (hero → wordmark → icon row → actions) suits the brand. Keep the total under 600ms.
- No loading or error states — the screen has no data dependency.
- **Responsive:** single centred column; the two elastic spacers absorb height differences.
  Test at 375×667 (spacers hit their `min-height` floors) and 430×932. Nothing uses viewport
  units.

## State Management

One persisted value: `hasSeenOnboarding: boolean`, set true on either action.

Downstream, for context only: the quiz collects `skinType`
(oily / combination / dry / sensitive / not sure), `concerns[]`, `gender`, `ageRange` and a
`sensitive` flag; the match engine consumes those.

---

## Design Tokens

### Colour

| Token | Hex | Used for |
|---|---|---|
| Canvas | `#FBF4EE` | screen background (flat, no pattern) |
| Ink | `#5A342C` | wordmark, icon labels, button text |
| Muted | `#9B665B` | tagline, secondary action |
| Peach (button) | `#F2BFA6` | primary button fill |
| Card surface | `#FFFFFF` | **unused on this screen** — no cards |
| Peach | `#FCD6C6` | accent, unused as UI |
| Blush | `#FCE1DB` | accent, unused as UI |
| Rose | `#F6CAC9` | accent, unused as UI |
| Sage | `#CDD8BE` | accent, unused as UI |
| Lilac | `#D1B7DA` | accent, unused as UI |

The five accents are all present **inside the illustrations** — the screen already carries
nine soft colour shapes across the hero and three icons. They are deliberately not repeated
as UI, because a tenth soft shape competes with the artwork. Keep them available for other
screens.

### Typography

- **Playfair Display** (500) — the wordmark only on this screen; section headings elsewhere.
- **System sans** (`-apple-system, "SF Pro Text", system-ui`) — everything else.

| Role | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| Wordmark | 40 | 500 | 1 | −.018em |
| Tagline | 15 | 400 | 1.5 | — |
| Icon label | 12 | 600 | normal | −.004em |
| Button label | 15 | 500 | normal | — |
| Secondary action | 13.5 | 500 | normal | — |

Bundle Playfair Display 500 locally; the reference file loads it from Google Fonts.

### Spacing

Gutter **24**. Gaps: 4, 10, 12, 22, 54. Spacer floors 20 / 28, weights 1 / 1.4.
Bottom padding **32**.

### Radius

26 (primary button, pill). Nothing else is rounded.

### Elevation

**None.** The button has no shadow and no border by design. The `.device` wrapper's shadow
in the reference file is presentation only — do not port it.

---

## Two accessibility findings — decide deliberately

Both are consequences of the specified palette. They are disclosed rather than silently
changed, because the values were chosen intentionally.

**1 · Muted text is marginally under threshold.** `#9B665B` on `#FBF4EE` measures
**4.34:1**, just under the 4.5:1 minimum for body text. It carries both the tagline (15px)
and the secondary action (13.5px). `#96605A` measures **4.68:1**, is visually
indistinguishable, and clears it. Swapping is a one-line change.

**2 · The button's edge is faint.** The label is fine — `#5A342C` on `#F2BFA6` is
**6.51:1**. But the fill sits only **1.51:1** against the canvas, well under the 3:1 a
control boundary normally wants. With `border:0` and `box-shadow:none`, **the surrounding
whitespace is the only thing separating the CTA from the page.** That is why nothing on
this screen encroaches on it, and why the `flex:1.4` spacer above the actions must not be
reduced. If the button needs to read more strongly, the smallest change is a
`1.5px solid #5A342C` hairline (10.1:1 against the canvas) — but that departs from the
"no border" spec, so it is the designer's call, not the implementer's.

Note also: warming the canvas makes **both** worse. At `#FAF1E9` the text drops to 4.23:1
and the button edge to 1.47:1. `#FBF4EE` is the chosen balance point — do not warm it
further without revisiting these two numbers.

---

## Assets

Four transparent PNGs in `assets/`, all hand-illustrated line art with soft colour blobs.
Each has ~12px of uniform transparent padding baked in — do not crop it, the layout
accounts for it.

| File | Content | Native px | Aspect | Rendered |
|---|---|---|---|---|
| `illustration-22.png` | Character with phone + dropper bottle | 637 × 541 | 1.19 | 300 × 255 |
| `illustration-25.png` | Two hands scanning a barcode on a phone | 533 × 446 | 1.21 | ≤72 tall |
| `illustration-40.png` | Magnifier over an ingredient list | 460 × 418 | 1.11 | ≤72 tall |
| `illustration-30.png` | Phone with a checkmark | 391 × 410 | 0.95 | ≤72 tall |

**Use these exact files.** Do not regenerate, redraw, recolour or substitute. The row order
is 25 → 40 → 30, matching Scan → Analyze → Know.

Native resolution is roughly 2× the rendered size for the hero and ~6× for the row icons,
so they are sharp at 2× and 3× device pixel ratios without re-export.

---

## Files

| File | What it is |
|---|---|
| `README.md` | This spec. Self-sufficient. |
| `onboarding.html` | Design reference. Open in a browser. Port the contents of `.screen`. |
| `assets/*.png` | Final production artwork. Copy as-is. |

Source of truth in the design project: `Manassa Onboarding Backgrounds.dc.html`, variant
`3a`.

## Not included

The rest of the app exists as designs but is outside this handoff: scanner (live camera),
result / match score, ingredient list, ingredient detail, product, compare, saved, browse,
profile, and the multi-step quiz. Ask if you want any of those packaged the same way.
