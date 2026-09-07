# Handoff: Manassa — Onboarding screen

## The prompt to give Claude Code

> Read `design/onboarding/README.md` and implement the Manassa onboarding screen in this
> codebase. Copy `design/onboarding/assets/` into the app's asset folder. Follow the
> codebase's existing component and styling patterns — the HTML file is a design reference,
> not code to paste. Match every value in the Design Tokens, Layout and Animation sections
> exactly.

That is all it needs. Everything below is written for an implementer with no other context.

---

## Overview

Manassa is a Korean-skincare ingredient scanner. The user scans a product's barcode or
ingredient list and gets a match score for their own skin, based on a short profile quiz.
It is an intelligence tool, not a shop — no prices, no buy buttons.

This package is **one screen**: first-launch onboarding. Its job is to establish the brand,
explain the app in three words, and route the user into either a first scan or the quiz.

## About this package

`onboarding.html` is a **design reference created in HTML** — a prototype showing intended
appearance and motion, not production code. There is no build step and no component
structure worth preserving; the inline styles exist so it renders instantly in a browser.

Recreate it in the target codebase's own environment (React Native / Expo, React, SwiftUI,
native Android — whatever the project uses), following its established patterns.

**The eleven PNGs in `assets/` are the exception** — final production artwork. Copy them
in as-is. Do not regenerate, redraw, recolour or substitute.

The animation CSS in the reference file is marked with a `PORT EVERYTHING BELOW THIS LINE`
comment. On a CSS platform it can be lifted verbatim; on React Native see the Reanimated
notes at the end.

For context: the app was previously scoped against `sabrahermassi/skincare-recommendation`
(React Native / Expo), with `expo-camera` + `expo-barcode-scanner` for the two scan modes.

## Fidelity

**High-fidelity.** Every colour, size, weight, tracking, radius, gap, duration and delay
below is final and deliberate. Where a value looks oddly specific (`13.5px`, `-.018em`,
`flex:1.4`, `98.5px`, `6.4s`), it was measured and chosen — keep it.

Reference viewport: **375 × 812 px** (1× CSS px). Design in points/dp at these numbers.

---

## Layout

Single full-screen column: `display:flex; flex-direction:column`, background `#FBF4EE`,
`position:relative; overflow:hidden`.

| # | Element | Sizing |
|---|---------|--------|
| 1 | Elastic spacer A | `flex:1; min-height:20px` |
| 2 | Hero | intrinsic — stack `max-width:300px`, `aspect-ratio:637/541` |
| 3 | Wordmark + tagline | `padding:22px 24px 0`, internal `gap:12px` |
| 4 | **Fixed** gap | `height:54px; flex:none` |
| 5 | Three-icon row | `padding:0 24px`, `justify-content:space-between` |
| 6 | Elastic spacer B | `flex:1.4; min-height:28px` |
| 7 | Action group | `padding:0 24px 32px`, internal `gap:4px` |

**Horizontal gutter is 24px everywhere.** No exceptions.

**The two elastic spacers are weighted 1 : 1.4, and the asymmetry is intentional.** The CTA
gets more air beneath the icon row than the hero gets above it. At 375×812 they resolve to
roughly 80px and 104px.

**The 54px gap at step 4 must stay fixed, not elastic.** An earlier revision used three
equal `flex:1` spacers; the leftover height then split evenly and opened a ~170px void
between the tagline and the icon row — wider than the hero-to-name gap, which read as a
bug. Pairing the identity block with the feature row at a fixed 54px, and putting all the
elastic air at top and bottom, is what fixes it. **Do not convert this to a flex gap.**

Measured positions at 375×812, for verification:

```
spacer A      y   0 →  80
hero          y  80 → 335    (255 tall at 300 wide)
wordmark      y 346 → 386
tagline       y 398 → 420
fixed gap     y 420 → 474
icon row      y 474 → 578    (icons centred at y 517, labels at y 569)
spacer B      y 578 → 682
actions       y 682 → 812    (button 682→732, link 736→780, 32px bottom pad)
```

The wordmark is exactly horizontally centred (111.89px clear each side) and deliberately
**39.75px above** the vertical midpoint — it is the second item in a top-down stack, not a
centred element.

---

## Components

### 1 · Hero — a three-layer stack

A `position:relative` box, `width:100%; max-width:300px; aspect-ratio:637 / 541`, with
`transform-origin:50% 96%`. Each layer is `position:absolute; inset:0; width:100%;
height:100%`.

| Layer | Asset | Motion |
|---|---|---|
| 1 (back) | `hero-base.png` | none — the figure and phone are deliberately still |
| 2 | `hero-arm.png` | `hr-arm`, `transform-origin:67.5% 98%` |
| 3 (front) | `hero-sparkles.png` | `hr-spark` |

The **stack container** carries `hr-lean`. Layer order matters: the arm must sit above the
base so it can rotate independently, and the sparkles above both.

### 2 · Wordmark

`Manassa` — **Playfair Display**, weight **500**, **40px**, `line-height:1`,
`letter-spacing:-.018em`, colour `#5A342C`.

Centred by `align-items:center` on its container, **not** by `text-align` — so it stays
centred whatever the string length.

### 3 · Tagline

`Find your skin's perfect match` — system sans, **15px / 400**, `line-height:1.5`, colour
`#9B665B`, centred, `text-wrap:pretty`. **No terminal punctuation.** The apostrophe is
typographic (U+2019), not a straight quote.

### 4 · Three-icon row

Container: `display:flex; justify-content:space-between; align-items:flex-start;
padding:0 24px`. Each column: flex column, `align-items:center`, `gap:10px`, `min-width:0`.

Each icon sits in a **fixed 84px-tall box**, `width:100%`,
`display:flex; align-items:center; justify-content:center`, holding a fixed-size
`position:relative` stack:

| Order | Stack size | Layers | Label |
|---|---|---|---|
| 1 | 98.5 × 82.4 | `scan-base` · `scan-barcode` · sweep bar · `scan-sparkle` | Scan |
| 2 | 78 × 70.9 | `analyze-paper` · `analyze-magnifier` | Analyze |
| 3 | 56 × 58.7 | `know-base` · `know-checkmark` · `know-sparkle` | Know |

**Two things here are load-bearing, not styling flourish:**

*Sizes are matched on subject, not on box.* Scan and Know both contain a phone. Sized by
box they looked wrong, because Scan's artwork has far more around its phone. The ratio
98.5 / 56 = 1.76 is derived from their phone widths (51px vs 29px in the source art), so
both phones render at ~28.6px. Analyze has no phone and is matched on subject mass at 78px.

*The box is `align-items:center`, not `flex-end`.* All three artworks have their ink
centred in their own canvas (49.88% each), so centring aligns their visual middles exactly
— measured spread 0.00px. Bottom-aligning three different heights pushed Scan's centre
~12px above Know's, which was visible. **Do not switch this back to bottom alignment.**

Labels: system sans, **12px / 600**, `letter-spacing:-.004em`, colour `#5A342C`, centred.

**Scan's sweep bar** (the scanning glow): `position:absolute; left:40%; right:35.5%;
top:21%; height:8%; border-radius:50%; transform:rotate(10deg); filter:blur(1.4px);
pointer-events:none`, background
`linear-gradient(to bottom, rgba(242,191,166,0), rgba(242,191,166,.85) 50%, rgba(242,191,166,0))`.
It is a soft gradient bar, not a hard line — transparent at both edges, tilted 10° to sit
parallel with the barcode. A sharp-line version was tried and rejected.

Transform origins, measured from the artwork — these are not guesses, they are the pivot
points of the drawn objects:

```
hero-arm         67.5%  98%     (shoulder joint)
know-checkmark   50.1%  47.6%   (tick centre)
know-sparkle     87.3%  15%     (sparkle centre)
scan-sparkle     78.2%   8.9%   (sparkle centre)
```

### 5 · Primary button — `Scan my first product`

Fill `#F2BFA6`, text `#5A342C`, **no border, no shadow** (deliberate).
`border-radius:26px`, `padding:15px 20px`, `font-size:15px`, `font-weight:500`,
`min-height:50px`, flex-centred. Full width inside the gutter → 327 × 50.

### 6 · Secondary action — `Set up my skin profile first`

Plain text, **no button chrome at all**: transparent, no border, no radius. System sans,
**13.5px / 500**, colour `#9B665B`, centred, `min-height:44px`, flex-centred.

**On both actions: size the box, do not pad the text.** `min-height` + flex centring, not
vertical padding. With `line-height:normal` the content box is font-derived, so equal
padding gives *unequal* heights — the 13.5px link would land at 33.6px from the padding
that gives the button 48px, i.e. under the 44px minimum. This bug appeared twice during
design. Use `min-height`.

---

## Animation

Two systems: a **first-launch entrance** that runs once, and **ambient motion** that loops
forever. They must never overlap.

### The one rule that governs all of it

**Resting CSS is the finished, visible state.** Nothing is hidden by default. Entrance
animations only apply while an `intro` class is on the root, and every ambient loop both
starts and ends on its resting keyframe. Consequences, all of them desirable:

- `prefers-reduced-motion` needs **no separate branch** — the rules simply never apply and
  everything renders in place.
- A screenshot, a print export or a paused timeline shows the assembled screen, never a
  blank one.
- If the JS fails to run, the screen still looks correct.

Do not invert this by putting the hidden state at 0% and relying on `fill-mode`.

### Entrance — first launch only

Elements arrive in reading order, each a **400ms ease-out** fade with a **12px upward
drift** (`translateY(12px) → 0`):

| Element | Hook | Delay |
|---|---|---|
| Hero | `data-en="hero"` | 0ms |
| Wordmark | `data-en="name"` | 250ms |
| Tagline | `data-en="tag"` | 350ms |
| Scan column | `data-en="i1"` | 500ms |
| Analyze column | `data-en="i2"` | 580ms |
| Know column | `data-en="i3"` | 660ms |
| Button | `data-en="btn"` | 800ms |
| Secondary link | `data-en="link"` | 900ms |

The icon stagger applies to the **whole column** (icon + label), not the icon alone.

Last element settles at **900 + 400 = 1300ms**.

### Ambient — starts only after the entrance completes

| Hook | Keyframe | Duration | Own delay | Motion |
|---|---|---|---|---|
| `data-hr="lean"` | `hr-lean` | 9s | — | whole figure rotates to −2° and back |
| `data-hr="arm"` | `hr-arm` | 6.4s | — | arm ±2.3° |
| `data-hr="spark"` | `hr-spark` | 8.1s | 1.1s | sparkles fade to 8% |
| `data-sc="sweep"` | `sc-sweep` | 4.5s | — | `top` 21% → 39% |
| `data-sc="spark"` | `sc-spark` | 6.2s | 1.4s | fade + scale to 55% |
| `data-an="lens"` | `an-lens` | 7.5s | — | magnifier traces an oval |
| `data-kn="tick"` | `kn-tick` | 2.4s | — | tick pulses to 1.5× with a lift |
| `data-kn="spark"` | `kn-spark` | 3.7s | 0.7s | fade + scale + rotate |

**How the handoff works — this is the part to get right.** Every ambient rule takes its
delay from one shared custom property:

```css
[data-hr="arm"]  { animation: hr-arm 6.4s ease-in-out var(--amb,0s) infinite }
[data-kn="spark"]{ animation: kn-spark 3.7s ease-in-out calc(var(--amb,0s) + .7s) infinite }
.intro           { --amb: 1.3s }
```

`--amb` is set **only while the entrance class is present**, so the two systems cannot
overlap by construction rather than by hand-matched numbers. When the entrance does not run
(returning user, reduced motion), `--amb` is unset and ambient starts immediately.

Verified: arm delay 1.3s, Know sparkle 2.0s (1.3 + 0.7).

### Three deliberate motion decisions

**The hero's base layer never moves.** Only the arm, the sparkles and the whole-figure lean
are animated. Animating the figure itself made it read as a puppet.

**The lean is subordinate to the arm** — smaller amplitude (2° vs 2.3°) *and* a slower
period (9s vs 6.4s). Amplitude alone was not enough; matched speeds made the figure and arm
swing in visible sympathy. The slower cycle is what makes the lean read as posture rather
than motion.

**There is no vertical float.** A translate on the hero was tried and removed — it made the
figure look detached from the page. Rotation only.

### First-launch gate

```js
var SEEN_KEY = 'manassa-onboarding-seen';
```

Read on mount; if unset, add the `intro` class and write the flag. Wrap both in `try/catch`
— private browsing throws on `localStorage`. **Never clear or overwrite other storage keys.**

Replay (used in the reference file, and useful in a dev build) requires a forced reflow
between removing and re-adding the class, or the animation will not restart:

```js
el.classList.remove('intro');
void el.offsetWidth;
el.classList.add('intro');
```

---

## Interactions & Behavior

- **`Scan my first product`** → camera scanner (barcode or ingredient-list mode). Primary path.
- **`Set up my skin profile first`** → the 4-question quiz (skin type, concerns, gender, age).
- **First launch only.** Persist `hasSeenOnboarding` and route straight to the scanner later.
- Scanning with **no profile** must degrade gracefully: show the ingredient breakdown but
  suppress the personal match score rather than inventing one.
- **Press states not specified.** Suggested: primary darkens to `#E8AC8E`; secondary drops
  to 60% opacity. Do not add a border or shadow on press — the flat fill is the design.
- No loading or error states — no data dependency.
- **Responsive:** single centred column, the two elastic spacers absorb height differences.
  Test at 375×667 (spacers hit their floors) and 430×932. Nothing uses viewport units.
  Note Scan's 98.5px icon sits in a ~102px column — only ~1.8px clearance each side, so it
  is the first thing that will clip if the gutter or gap grows.

## State Management

One persisted value: `hasSeenOnboarding: boolean`, plus the animation flag above.

Downstream, for context: the quiz collects `skinType`
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
| Sweep glow | `rgba(242,191,166,…)` | Scan's scanning bar |
| Card surface | `#FFFFFF` | **unused** — no cards on this screen |
| Peach | `#FCD6C6` | accent, unused as UI |
| Blush | `#FCE1DB` | accent, unused as UI |
| Rose | `#F6CAC9` | accent, unused as UI |
| Sage | `#CDD8BE` | accent, unused as UI |
| Lilac | `#D1B7DA` | accent, unused as UI |

The five accents are all present **inside the illustrations** — the screen already carries
nine soft colour shapes across the hero and three icons. They are deliberately not repeated
as UI, because a tenth soft shape competes with the artwork. Keep them for other screens.

### Typography

- **Playfair Display** (500) — the wordmark only on this screen.
- **System sans** (`-apple-system, "SF Pro Text", system-ui`) — everything else.

| Role | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| Wordmark | 40 | 500 | 1 | −.018em |
| Tagline | 15 | 400 | 1.5 | — |
| Icon label | 12 | 600 | normal | −.004em |
| Button label | 15 | 500 | normal | — |
| Secondary action | 13.5 | 500 | normal | — |

Bundle Playfair Display 500 locally; the reference loads it from Google Fonts.

### Spacing / radius / elevation

Gutter **24**. Gaps: 4, 10, 12, 22, 54. Spacer floors 20 / 28, weights 1 / 1.4.
Bottom padding **32**. Icon box **84** tall.

Radius **26** on the primary button; nothing else is rounded.

**Elevation: none.** No shadow, no border anywhere. The `.device` shadow in the reference
is presentation only — do not port it.

---

## Two accessibility findings — decide deliberately

Both follow from the specified palette. Disclosed rather than silently changed.

**1 · Muted text is marginally under threshold.** `#9B665B` on `#FBF4EE` measures
**4.34:1**, just under the 4.5:1 minimum for body text. It carries the tagline (15px) and
the secondary action (13.5px). `#96605A` measures **4.68:1**, is visually
indistinguishable, and clears it. One-line change.

**2 · The button's edge is faint.** The label is fine — `#5A342C` on `#F2BFA6` is
**6.51:1**. But the fill sits only **1.51:1** against the canvas, well under the 3:1 a
control boundary wants. With `border:0` and `box-shadow:none`, **the surrounding whitespace
is the only thing separating the CTA from the page.** That is why nothing encroaches on it,
and why the `flex:1.4` spacer above the actions must not be reduced. If it needs to read
more strongly, the smallest change is a `1.5px solid #5A342C` hairline (10.1:1) — but that
departs from the "no border" spec, so it is the designer's call.

Note: warming the canvas makes **both** worse. At `#FAF1E9` the text drops to 4.23:1 and
the button edge to 1.47:1. `#FBF4EE` is the chosen balance point — do not warm it further
without revisiting these numbers.

---

## Assets

Eleven transparent PNGs in `assets/`, hand-illustrated line art with soft colour blobs.
Each has ~12px of uniform transparent padding baked in — do not crop it, the layout accounts
for it, and the layers only register because they share identical canvases.

| File | Content | Native px | Rendered |
|---|---|---|---|
| `hero-base.png` | Figure with phone (still) | 637 × 541 | 300 × 255 |
| `hero-arm.png` | Raised arm holding dropper | 637 × 541 | 300 × 255 |
| `hero-sparkles.png` | Two sparkles | 637 × 541 | 300 × 255 |
| `scan-base.png` | Hands + phone | 533 × 446 | 98.5 × 82.4 |
| `scan-barcode.png` | Barcode on the phone | 533 × 446 | 98.5 × 82.4 |
| `scan-sparkle.png` | Sparkle | 533 × 446 | 98.5 × 82.4 |
| `analyze-paper.png` | Ingredient list | 460 × 418 | 78 × 70.9 |
| `analyze-magnifier.png` | Magnifier | 460 × 418 | 78 × 70.9 |
| `know-base.png` | Phone | 391 × 410 | 56 × 58.7 |
| `know-checkmark.png` | Tick | 391 × 410 | 56 × 58.7 |
| `know-sparkle.png` | Sparkle | 391 × 410 | 56 × 58.7 |

**Layers within a group share one canvas size**, which is what makes `inset:0` on all of
them line up. If you re-export any layer, keep the full canvas — do not trim to content.

**Use these exact files.** Do not regenerate, redraw, recolour or substitute.

---

## If the target is React Native

RN has no CSS keyframes or custom properties. Use `react-native-reanimated`:

- One `useSharedValue` per animated layer, driven by
  `withRepeat(withTiming(1, {duration}), -1, true)` after a `withDelay`.
- Map progress → `rotate` / `translateY` / `scale` / `opacity` with `interpolate`, using
  the keyframe percentages in the table above as the input range.
- **Initial `useSharedValue` must be the resting visible state**, so the first frame before
  animation starts shows the assembled screen — the same rule as the CSS.
- Replace `--amb` with a single `entranceDone` boolean in the screen's state: start the
  ambient loops in a `useEffect` that fires on `entranceDone`, or pass `1300` as the delay
  when the entrance ran and `0` when it did not.
- Honour `AccessibilityInfo.isReduceMotionEnabled()` — when true, skip both the entrance
  and the ambient loops and leave the resting state in place.
- `transform-origin` has no direct equivalent. Emulate it with
  `translate(−origin) → rotate → translate(+origin)`, or wrap the layer in a container
  offset so the pivot lands correctly. The four measured origins are in the Animation
  section — they matter, especially the arm's shoulder joint at 67.5% / 98%.
- Layer stacks are absolute-positioned `<Image>`s with `resizeMode="contain"` inside a
  fixed-size `<View>`.
- Scan's sweep bar is a `LinearGradient` (from `expo-linear-gradient`) with a rotation; RN
  has no `filter: blur`, so either accept a hard-edged gradient or pre-render the glow as a
  PNG layer.

---

## Files

| File | What it is |
|---|---|
| `README.md` | This spec. Self-sufficient. |
| `onboarding.html` | Design reference. Open in a browser. Port the contents of `.screen`; the animation CSS is fenced with a `PORT EVERYTHING BELOW THIS LINE` comment. Includes a Replay button. |
| `assets/*.png` | Final production artwork, 11 files. Copy as-is. |

Source of truth in the design project: `Manassa Onboarding 3a.dc.html`.

## Not included

The rest of the app exists as designs but is outside this handoff: scanner (live camera),
result / match score, ingredient list, ingredient detail, product, compare, saved, browse,
profile, and the multi-step quiz. Ask if you want any of those packaged the same way.
