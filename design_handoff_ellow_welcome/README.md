# Handoff: Ellow — Welcome / onboarding screen

## The prompt to give Claude Code

Paste this, from your repo root:

> Read `design/ellow-welcome/README.md` and implement the Ellow Welcome / onboarding screen
> in this codebase, following the project's existing component and styling patterns. Copy
> `design/ellow-welcome/assets/` into the app's asset folder. Open
> `design/ellow-welcome/welcome.html` in a browser to see the intended result — the three-step
> strip cycles, the bottle is scanned by a sweeping beam, and the match score counts up from
> red to green; the "Toggle animation" button shows the resting state. Match the spec exactly:
> it is high-fidelity, and every value in it was measured. Do not port the `.device` wrapper
> or the `.panel` — those are presentation scaffolding.

If a Welcome screen already exists from an earlier handoff, add this:

> This replaces the previous Welcome screen. **The app is now called Ellow, not SkinTell or
> SkinTel** — update the name everywhere, including the App Store metadata. The logo is new
> too: delete the old ST monogram marks (`logo-mark.svg`, `logo-icon.svg`, `logo-mark.png`)
> and use only `assets/ellow-*.svg`.

---

## Overview

Ellow is a Korean-skincare **product** scanner. The user answers a few questions about their
skin, then scans a product's barcode or ingredient list and gets a match score out of 100
plus every ingredient flagged good / watch / avoid for them specifically. It is an
intelligence tool, not a shop — no prices, no buy buttons.

This is the **first screen on first launch**. It has one job beyond branding: make it
unmistakable that **you scan products, not your face.** Earlier versions failed at this, and
almost every decision below exists because of it — read "Why the screen is built this way"
before changing anything.

## About the design files

`welcome.html` is a **design reference created in HTML** — a prototype showing intended look
and behaviour, **not production code to copy**. There is no build step and no component
structure worth preserving; the inline styles exist so it renders instantly in a browser.

Recreate it in the target codebase's existing environment (React Native / Expo, per
`sabrahermassi/skincare-recommendation`) following its established patterns.

**The files in `assets/` are the exception** — final production artwork. Copy as-is.

## Fidelity

**High-fidelity.** Every colour, size, weight, tracking, radius, gap, rotation and keyframe
percentage below is final. Where a value looks oddly specific (`13.5px`, `-.016em`,
`stroke-width 6.5`, `79 94`), it was measured and chosen.

Reference viewport: **427 × 944** CSS px.

---

## Why the screen is built this way

Three decisions that will look arbitrary and are not:

**1. The avatar is 150px, not 164px, and she is not the whole hero.** A human face is the
single strongest attractor on a screen. At 164px, centred, above the fold, users concluded
the app scans faces before reading a word. She is still first — she is the brand — but the
three-step strip below now carries comparable weight.

**2. The three-step strip exists to answer "what does this app do".** Scan a product → get a
match score → see every ingredient. It is the app's whole loop in three tiles, and it is
animated because a static strip gets skipped.

**3. The copy names the object and the action.** An earlier version read "Find the right
product for your skin", which is a shopping promise and never mentions pointing a camera.
The CTA is "Scan my first product", not "Get started" — a generic CTA wastes the most-read
words on the screen.

---

## Layout

Single full-screen column, `display:flex; flex-direction:column`, background `#FAF7F3`,
`position:relative; overflow:hidden`.

| # | Element | Sizing |
|---|---|---|
| 0a | Bottle + ribbon background layer | `position:absolute; inset:0; pointer-events:none` |
| 0b | Bubble layer | `position:absolute; top:0; left:0; right:0; height:300px; pointer-events:none` |
| 1 | Elastic spacer A | `flex:1; min-height:52px` |
| 2 | Avatar row | intrinsic (150px) |
| 3 | Lockup + copy group | `padding:22px 24px 0`, internal `gap:22px` |
| 4 | Three-step strip | `padding:30px 24px 0`, `gap:14px` |
| 5 | Elastic spacer B | `flex:1; min-height:26px` |
| 6 | Action group | `padding:0 24px 40px`, internal `gap:14px` |

**Horizontal gutter is 24px everywhere.** An earlier revision had the copy at 24 and the
buttons at 20, and that 4px mismatch read as a broken layout even though everything was
centred.

The two elastic spacers centre the block vertically and must stay free to collapse to their
floors on a shorter device. Every foreground group carries `position:relative` so it stacks
above the two absolute background layers without z-index.

---

## Components

### 1 · Avatar

`assets/v2/avatar.png` at **150 × 150**, fully round, centred. Decorative → empty alt.

Behind it, in the same `position:relative` 150px wrapper, a breathing halo:

```
position:absolute; left:-22px; top:-22px;
width:194px; height:194px; border-radius:194px;
background:radial-gradient(circle, rgba(206,229,214,.62) 0%, rgba(206,229,214,0) 68%);
opacity:.34;   /* resting state */
```

The artwork is an illustrated woman **in a lab coat** — deliberate: she reads as a
dermatologist rather than a customer, which is what "intelligence tool, not a shop" needs.
Holds down to ~44px; below that the linework crowds.

There is **no scan bracket around the avatar.** It was tried and rejected.

### 2 · Logo lockup

Row: `display:flex; align-items:center; gap:13px`

- Mark: `assets/ellow-mark.svg` at **44 × 44**, `flex:none`
- Wordmark: `Ellow`, Playfair Display **500**, **42px**, `line-height:1`,
  `letter-spacing:-.016em`, colour `#463F57`

### 3 · Tagline — a sequence, not a list

Flex row, `align-items:center; gap:9px`: three `<span>`s separated by two **drawn** arrows.
IBM Plex Mono **500**, **8.5px**, `letter-spacing:.19em`, colour `#8C8592`.

`SCAN` → `ANALYZE` → `KNOW`

Arrow is inline SVG, 11 × 7, `viewBox="0 0 12 8"`, `flex:none`:

```
<path d="M1 4h9M7.4 1 10.8 4 7.4 7" stroke="#B3A9DC" stroke-width="1.3"
      stroke-linecap="round" stroke-linejoin="round" />
```

Draw them; **do not use the `→` character** — its weight and baseline will not match the
mono at 8.5px. (This regressed twice during design; it is the detail most likely to be lost
in translation.)

### 4 · Copy group — `gap:9px`

- Headline: `Scan any skincare product`
  System sans, **15px / 600**, `line-height:1.5`, `letter-spacing:-.005em`, `#5B5366`
- Body: `Answer four questions about your skin, then scan a barcode or ingredient list to see how well that product suits you.`
  System sans, **15px / 400**, `line-height:1.55`, `#8C8592`

Both centred, `text-wrap:pretty`. **The headline is deliberately the same size as the body** —
it ranks below the avatar and lockup, distinguished only by weight and a darker plum.

### 5 · Three-step strip

Row: `display:flex; align-items:flex-start; justify-content:center; gap:14px`.
Three equal `flex:1` tiles, each `display:flex; flex-direction:column; align-items:center;
gap:10px; padding:2px 6px 0`.

**No card backgrounds, no borders** — the tiles sit directly on the paper. (They had white
cards; removing them is why the row gap and icon sizes are what they are.)

Every tile's icon sits in a shared **`height:78px`** flex slot, centred. That equal slot is
what keeps the three labels on the same line — without it they drift.

Labels: system sans **13px / 600**, `letter-spacing:-.006em`, `#463F57`, centred, with an
explicit line break:

| Tile | Icon | Label |
|---|---|---|
| 1 | Bottle inside the mark's brackets, beam sweeping | `Scan the` / `product` |
| 2 | Score ring, counts up red → green | `Get a match` / `score` |
| 3 | Ingredient list with status dots | `See every` / `ingredient` |

**Tile 1 — the scanned bottle.** A `position:relative` 78 × 78 box containing three layers:

1. The brand mark's brackets as inline SVG, `position:absolute; inset:0`, `viewBox="0 0 110 110"`.
   **Use `assets/ellow-mark.svg`'s exact geometry** — `stroke="#8B7FB6"`, `stroke-width="6.5"`,
   `stroke-linecap="round"`, and the four paths:
   `M6 28V16a10 10 0 0 1 10-10h12` · `M82 6h12a10 10 0 0 1 10 10v12` ·
   `M104 82v12a10 10 0 0 1-10 10H82` · `M28 104H16a10 10 0 0 1-10-10V82`
   Do not re-author them. An earlier version used inset 8 / radius 12 / stroke 8, which at
   this size sat visibly heavier than the 44px mark in the lockup directly above.
2. `assets/v2/btl-serum.png` at `height:53px`, `position:relative`.
3. The beam: `position:absolute; left:13px; right:13px; top:38px; height:3px;
   border-radius:2px; background:#8B7FB6; box-shadow:0 0 7px rgba(139,127,182,.75)`.

**Tile 2 — the score ring.** `<svg width="62" height="62" viewBox="0 0 40 40">`:

- Track: `circle` 20,20 r 15, `stroke="#DDEAE2"`, `stroke-width="5"`, no fill
- Arc: `circle` 20,20 r 15, `stroke-width="5"`, `stroke-linecap="round"`,
  `transform="rotate(-90 20 20)"`, resting `stroke-dasharray="79 94"` `stroke="#79A98A"`
- Numbers: three `<text>` at 20, 24.5, `text-anchor="middle"`, system sans **12px / 600** —
  `18` fill `#B4566B` opacity 0, `56` fill `#A9713C` opacity 0, `84` fill `#463F57` visible

Circumference is ~94.25, so the dash length **is** the percentage: 9 ≈ 9%, 79 ≈ 84%.

**Tile 3 — the ingredient list.** `<svg width="60" height="60" viewBox="0 0 40 40">`: three
rules `M14 12h18M14 20h18M14 28h12` in `#463F57` at 2.4 with round caps, plus status dots
r 3 at (7,12) `#6FA783`, (7,20) `#6FA783`, (7,28) `#E2A45E`. Two good, one watch — matches
the real result screen's colour language.

### 6 · Primary button — `Scan my first product`

Height **56px**, `border-radius:11px`, background `#8B7FB6`, label 15px / 600 `#FFFFFF`, full
width inside the gutter. Radius is intentionally tight; 14px read as too soft.

### 7 · Secondary action — `Set up my skin profile first`

Text only, **13.5px / 500**, `#8C8592`, `padding:8px 0`, centred.

Tap height with padding is ~34px. **Below the 44px minimum** — expand the touch target
without changing the visible text metrics.

---

## Background layer (0a)

Two inert sub-layers (`pointer-events:none`, `aria-hidden`).

**Ribbons** — one `<svg viewBox="0 0 427 944">` stretched to fill, `stroke-linecap:round`:

| Path | Colour | Width | Opacity |
|---|---|---|---|
| `M-30 300C80 252 158 344 252 300S404 220 470 266` | `#DDEAE2` | 12 | .62 |
| `M-30 344C92 298 152 388 260 344S418 274 470 310` | `#E8E2F3` | 8 | .70 |
| `M-20 712C96 672 154 754 264 712S414 650 460 684` | `#E4EDE7` | 10 | .60 |

**Six washed-out bottles**, all bleeding off an edge:

| Asset | Position | Width | Rotation | Opacity |
|---|---|---|---|---|
| `btl-essence-pale.png` | top 44, left −42 | 112 | −12° | 1 |
| `btl-serum-pale.png` | top 126, right −30 | 96 | 14° | 1 |
| `btl-cream-pale.png` | top 330, left −34 | 104 | 8° | .55 |
| `btl-toner-pale.png` | bottom 236, right −36 | 100 | −10° | .60 |
| `btl-cleanser-pale.png` | bottom 118, left −38 | 118 | 11° | 1 |
| `btl-sun-pale.png` | bottom 34, right −34 | 104 | 13° | .85 |

Two rules if you reposition them: **everything bleeds off an edge** (that is what makes it a
scattered pattern rather than a row of icons), and **opacity drops in the middle band** where
the copy sits, returning top and bottom.

## Bubble layer (0b)

Four bubbles in the **top 300px only**, each with a matching burst ring. Positioned by
percentage of the 300px layer, centred with `translate(-50%,-50%)`.

| x % | y % | size | delay | duration | tint | rim |
|---|---|---|---|---|---|---|
| 14 | 58 | 26 | 0.4s | 4.6s | `#BFDCE8` | `#9FC6D6` |
| 46 | 20 | 32 | 0.9s | 5.4s | `#CFE3EC` | `#A8CCDA` |
| 78 | 34 | 22 | 1.9s | 5.0s | `#D8D2EE` | `#B3A9DC` |
| 90 | 62 | 14 | 3.1s | 4.2s | `#C7E2E0` | `#9CC8C4` |

Sizes, delays and durations are all mutually different — uniform timing makes them pulse as
one object, which reads as a loading spinner rather than soap.

**Bubble** — `viewBox="0 0 40 40"`: body `circle` 20,20 r 17.5 (fill = tint at `.5`, stroke =
rim at 2.2); main highlight `ellipse` 14,13.5 rx 5 ry 3.6 `rotate(-28 14 13.5)` white at
`.85`; small highlight `circle` 26.5,25.5 r 2 white at `.5`. Two highlights are what make a
flat circle read as a bubble; one reads as a button.

**Burst** — `viewBox="0 0 60 60"` at **1.5×** its bubble's size, same position: ring `circle`
30,30 r 16, `stroke-dasharray:"5 7"`, round caps, rim at 2.4, no fill; droplets at (30,8) r
2.6, (52,30) r 2.2, (30,52) r 2.6, (8,30) r 2.2. Dashes plus droplets read as a pop; a solid
expanding ring reads as a ripple.

---

## Motion

### The one rule that matters

Every animated element's **resting CSS is its finished visible state**, and looping keyframes
both start *and* end on that state. Animations apply only inside
`@media (prefers-reduced-motion: no-preference)`, via `data-anim` attributes.

A paused timeline, a screenshot, a print export, or a reduced-motion user all resolve to
resting CSS. If the hidden state sits at 0% — the obvious way to write it — every one of
those shows a **blank screen**. Authored this way they all degrade to the completed design:
all three steps visible, score green at 84, bubbles sitting around her. Press "Toggle
animation" in `welcome.html` to confirm.

Burst rings are the one exception — a pop is inherently transient, and that only works
because the steady bubbles carry the design.

### Entrance

| Element | Animation | Duration | Delay | Easing |
|---|---|---|---|---|
| Avatar | `cl-pop` | .7s | 0 | `cubic-bezier(.34,1.32,.64,1)` |
| Lockup | `cl-rise` | .6s | .38s | ease-out |
| Copy + strip | `cl-rise` | .6s | .50s | ease-out |
| Actions | `cl-rise` | .6s | .62s | ease-out |

```css
@keyframes cl-pop  { 0%{opacity:0;transform:scale(.88)} 60%{opacity:1;transform:scale(1.03)} 100%{opacity:1;transform:scale(1)} }
@keyframes cl-rise { 0%{opacity:0;transform:translateY(14px)} 100%{opacity:1;transform:translateY(0)} }
```

The avatar's overshoot easing (the `1.32`) gives the pop its bounce; plain `ease-out` reads
as a fade.

**Apply the actions' entrance transform to an inner wrapper, not the group that owns the
bottom padding.** The screen is `overflow:hidden`; if the padded group holds
`translateY(14px)` at rest, its bottom edge lands 14px past the frame and the CTA is clipped.

### The 7.5s step cycle — one clock for the whole strip

Steps arrive in order, hold together, clear, repeat. **The score ring's sweep is phased to
start the moment step 2 lands** — on an independent loop it drifted, so the tile often
arrived already green, and a count-up only means something if it starts when you first look.

```css
@keyframes cl-s1{0%{opacity:0;transform:translateY(10px)}5%,84%{opacity:1;transform:translateY(0)}93%,100%{opacity:0;transform:translateY(-6px)}}
@keyframes cl-s2{0%,14%{opacity:0;transform:translateY(10px)}20%,86%{opacity:1;transform:translateY(0)}95%,100%{opacity:0;transform:translateY(-6px)}}
@keyframes cl-s3{0%,32%{opacity:0;transform:translateY(10px)}38%,88%{opacity:1;transform:translateY(0)}97%,100%{opacity:0;transform:translateY(-6px)}}

@keyframes cl-ring{0%,20%{stroke-dasharray:9 94;stroke:#DE7E93}32%{stroke-dasharray:23 94;stroke:#DE7E93}46%{stroke-dasharray:53 94;stroke:#E2A45E}60%,100%{stroke-dasharray:79 94;stroke:#79A98A}}
@keyframes cl-n1{0%,26%{opacity:1}33%,100%{opacity:0}}
@keyframes cl-n2{0%,32%{opacity:0}38%,50%{opacity:1}56%,100%{opacity:0}}
@keyframes cl-n3{0%,54%{opacity:0}60%,100%{opacity:1}}
```

All seven run at **7.5s, ease-in-out, infinite**. Reading it: step 1 in at 5%, step 2 at 20%
(ring starts sweeping), step 3 at 38%, all held to ~84%, cleared by 97%, brief empty beat,
repeat. The numbers cross-fade 18 → 56 → 84 in lockstep with the arc's colour.

### Continuous loops

```css
@keyframes cl-halo { 0%,100%{opacity:.34;transform:scale(1)} 50%{opacity:.62;transform:scale(1.05)} }
@keyframes cl-scan { 0%,100%{transform:translateY(-23px)} 50%{transform:translateY(23px)} }
@keyframes cl-float{ 0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)}
                     48%{opacity:1;transform:translate(-50%,calc(-50% - 26px)) scale(1.06)}
                     62%{opacity:1;transform:translate(-50%,calc(-50% - 34px)) scale(1.26)}
                     68%{opacity:0;transform:translate(-50%,calc(-50% - 37px)) scale(.3)}
                     80%{opacity:0;transform:translate(-50%,calc(-50% + 14px)) scale(.4)}
                     92%{opacity:1;transform:translate(-50%,-50%) scale(1)} }
@keyframes cl-burst{ 0%,60%{opacity:0;transform:translate(-50%,calc(-50% - 32px)) scale(.35)}
                     68%{opacity:.95;transform:translate(-50%,calc(-50% - 35px)) scale(1)}
                     80%,100%{opacity:0;transform:translate(-50%,calc(-50% - 46px)) scale(1.5)} }
```

- halo — 3.6s ease-in-out, 1s delay
- scan (the beam) — 2.4s ease-in-out. Rests at mid-sweep, so a frozen frame still shows a
  beam crossing the bottle.
- float / burst — per-bubble duration and delay passed as CSS custom properties, so one rule
  serves all four. `ease-in-out` for the drift, `ease-out` for the burst; the burst fires at
  68%, the exact frame the bubble vanishes.

### If the target is React Native

RN has no CSS keyframes. Use `react-native-reanimated`:

- **One shared clock for the strip.** A single `useSharedValue` progress on a 7500ms
  `withRepeat(withTiming(1), -1)`, and derive all seven animations from it with
  `interpolate` using the percentages above as input ranges. Do not give each tile its own
  timer — that is exactly the drift the phasing fixes.
- Separate loops for halo (3600ms), beam (2400ms) and each bubble (its own duration + delay).
- **Initial `useSharedValue` must be the resting visible state**, so the first frame shows
  the finished design rather than nothing.
- Honour `AccessibilityInfo.isReduceMotionEnabled()` — when true, skip starting the loops and
  leave the resting state in place.
- Bubbles, bursts, arrows, brackets, ring and list icons are SVG: `react-native-svg`. The
  ring animates `strokeDasharray` + `stroke`, both supported on `<Circle>`.
- The halo's radial gradient needs `<RadialGradient>`, or a pre-rendered PNG.

---

## Interactions & behaviour

- **`Scan my first product`** → the scanner (camera). Primary path.
- **`Set up my skin profile first`** → the quiz (question 1 of 8).
- **First launch only.** Persist `hasSeenOnboarding` and route straight to the scanner after.
- With no profile stored, match scores must degrade gracefully: show the ingredient breakdown
  but **suppress the personal match score** rather than showing a fake one.
- Press states are not in the mock. Suggested: primary darkens to `#7A6BB0`; secondary drops
  to 60% opacity.
- No loading or error states — no data dependency.
- Responsive: single centred column; the two spacers absorb height. Test at 375 × 667
  (spacers hit their floors) and 430 × 932.

**One product question worth settling before you build:** the screen leads with scanning, but
if the quiz is genuinely required before a scan is useful, the two CTAs should swap. Can
someone scan with no profile and still get value from the ingredient breakdown? If yes, this
order is right.

## State management

None local beyond navigation. One persisted value: `hasSeenOnboarding: boolean`.

Downstream, for context: the quiz collects `skinType` (oily / combination / dry / sensitive /
not sure), `concerns[]`, `gender`, `ageRange`.

---

## Design tokens

### Colour

| Token | Hex | Used for |
|---|---|---|
| Paper | `#FAF7F3` | screen background |
| Ink | `#332E3A` | default text |
| Ink / plum | `#463F57` | wordmark, step labels, barcode bars |
| Ink / muted | `#5B5366` | headline |
| Text / secondary | `#8C8592` | body, tagline, secondary action |
| Accent | `#8B7FB6` | primary button, brackets, scan beam |
| Accent / dark | `#7A6BB0` | suggested pressed state |
| Accent / soft | `#B3A9DC` | tagline arrows, beam on dark |
| Score / good | `#79A98A` | ring at high score |
| Score / mid | `#E2A45E` | ring at mid score, "watch" dot |
| Score / low | `#DE7E93` | ring at low score |
| Score track | `#DDEAE2` | ring background |
| Status / good | `#6FA783` | ingredient dots |
| Number / low | `#B4566B` | the "18" |
| Number / mid | `#A9713C` | the "56" |
| Halo | `rgba(206,229,214,.62)` | avatar halo gradient |
| Ribbon mint / lilac / sage | `#DDEAE2` · `#E8E2F3` · `#E4EDE7` | décor |

Bubble tints and rims are in the bubble table.

### Typography

- **Playfair Display** (500) — the wordmark, and section headings elsewhere in the app
- **IBM Plex Mono** (500) — tagline and all small uppercase labels. A signature of the system,
  not a fallback; it signals *data* rather than *spa*
- **System sans** (`-apple-system, "SF Pro Text", system-ui`) — all body and UI text

| Role | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| Wordmark | 42 | 500 | 1 | −.016em |
| Tagline | 8.5 | 500 | — | .19em |
| Headline | 15 | 600 | 1.5 | −.005em |
| Body | 15 | 400 | 1.55 | — |
| Step label | 13 | 600 | — | −.006em |
| Score number | 12 | 600 | — | — |
| Button label | 15 | 600 | — | — |
| Secondary action | 13.5 | 500 | — | — |

Bundle Playfair Display (400/500/600) and IBM Plex Mono (500/600) locally; the prototype
loads them from Google Fonts.

### Spacing

Gutter **24**. Gaps: 9, 10, 13, 14, 22. Spacer floors: 52 (top), 26 (bottom). Bottom padding
**40**. Icon slot height **78**.

### Radius

11 (primary button), 150 / full (avatar), 194 / full (halo), 2 (scan beam).

### Elevation

None in the app UI. The prototype's `.device` box-shadow only lifts the phone off the page.

---

## Assets

**Logo — `assets/`** (pure geometry, no text elements, so they render identically everywhere)

- `ellow-mark.svg` — the primary mark: five barcode bars and a scan beam inside four rounded
  scan brackets. **The bars are the rhythm traced from the user's own barcode photo** —
  2 / 1.33 / 2 / 1 / 2, spanning x 23.5→85 on a 110 board, with every gap wider than the
  thinnest bar so the glyph holds at 29px instead of merging into a block. If you redraw
  anything, do not redraw this.
- `ellow-mark-light.svg` — for dark backgrounds: white brackets and bars, lilac beam. Needed
  on the scanner's near-black camera view, where plum bars vanish.
- `ellow-icon.svg` — the mark on a dark `#17161B` rounded tile. **The app icon.** Dark is
  deliberate: almost every home-screen icon is light, and the near-black quotes the app's
  own camera view.
- `ellow-icon-light.svg` — light `#EDE9F6` tile variant.

The mark has no letters in it, which is intentional twice over: a barcode being scanned needs
no translation, and the mark survives any future name (Ellow Labs, Ellow Skin) without being
redrawn.

**Avatar** — `assets/v2/avatar.png` (580 × 568), illustrated woman in a lab coat on a mint
disc. Renders at 150px.

**Bottles** — `assets/v2/`, six product types × two weights:
`btl-cleanser` · `btl-toner` · `btl-serum` · `btl-cream` · `btl-sun` · `btl-essence`, each as
`<name>.png` and `<name>-pale.png`.

- Pale = same artwork desaturated and blended 70% toward the paper. **Never use pale in the
  foreground** — below text contrast by design.
- This screen uses all six pale (background) and `btl-serum.png` (step 1). The full-colour set
  is included because these are the same six bottles you will want as product thumbnails
  elsewhere in the app.
- **The bottle labels are baked-in pixels, not text** (CLEANSER, gentle daily wash…). They
  cannot be translated or restyled, and below ~60px wide they are texture rather than
  readable. Fine here; a problem if you localise.

---

## Files

| File | What it is |
|---|---|
| `welcome.html` | The screen. `.device` and `.panel` are scaffolding — port `.screen`. Toggle button shows the resting state. |
| `assets/*` | Final production artwork. Copy as-is. |

Source of truth in the design project: `Ellow Welcome Clarity.dc.html` (option C).

## Not included

The rest of the app exists as designs but is outside this handoff: scanner, result / match
score, ingredient list, ingredient detail, product, compare, saved, browse, profile, and the
multi-step quiz. **All of them still carry the old SkinTel name and the old ST logo** — they
will need the same rename and mark swap to stay consistent. Ask and I will package them.
