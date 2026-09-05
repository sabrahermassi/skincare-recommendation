# Handoff: SkinTel — bubble motion layer (ADDITIVE)

## Read this first

**This is not a new screen.** The Welcome / onboarding screen already exists in the
codebase — built from the earlier `design_handoff_skintel_onboarding` package (avatar,
logo + wordmark lockup, tagline, copy, "Get started" / "Skip for now", scattered pale
bottles on `#FAF7F3`).

**Your task is to add one decorative motion layer to that existing screen and change
nothing else.** No layout changes, no restructuring, no re-implementing the screen. If
the diff touches the lockup, the copy, the buttons, the spacers, the gutters or the
bottle background, it has gone too far.

### What to add

1. **Eight soap bubbles** around the avatar — they drift up, swell, pop, and refill.
2. **A breathing halo** behind the avatar (cool water tint, replaces nothing — it sits
   underneath the existing avatar image).
3. **The entrance sequence**, only if the existing screen doesn't already animate on
   mount: avatar pops in, then lockup, copy and buttons rise in sequence.

### What NOT to change

- Avatar source, size (152px) or position
- Lockup, tagline, headline, body copy, buttons — all metrics stay exactly as shipped
- The pale bottle background scatter and the SVG ribbons/bubbles behind it
- Gutters (24px), spacer floors (72 / 36), bottom padding (40)
- Any colour or type token

---

## Fidelity

**High-fidelity.** The keyframe percentages, durations and per-bubble delays are tuned so
that roughly one bubble pops per second and no two pop together. Port the numbers as given.

## Reference file

`bubble-motion.html` — open in a browser. It shows the motion layer around the real
avatar on the real background colour, with a **Toggle animation** button so you can see
the resting state. The page's own card layout is scaffolding; ignore it. The parts to port
are the `@keyframes` block marked `THE MOTION LAYER` and the `BUBBLES` array plus the
element construction in the inline `<script>`.

---

## The one rule that matters

Each bubble's **resting state is its visible steady state** — `opacity: 1`,
`transform: translate(-50%,-50%) scale(1)` — and `bb-float` both *starts and ends* on
that same keyframe. The drift, swell, pop and refill all happen in the middle of the
cycle.

Why this is non-negotiable: a paused timeline, a screenshot capture, a print/PDF export,
or a user with `prefers-reduced-motion` all resolve to the element's resting CSS. If the
hidden state sits at 0% (the obvious way to write it), every one of those contexts shows
an **empty screen**. Authored this way, they all degrade to "bubbles sitting calmly around
her face", which is a perfectly good static design.

The same rule applies to the entrance animations: author the resting CSS as the *finished*
visible state and confine the hidden start state to the motion-enabled context. Do not use
`animation-fill-mode: both` with a delay on a rule whose 0% keyframe is `opacity: 0`.

The burst rings are the one exception — they legitimately rest hidden, because a pop is
inherently transient. But that only works because the steady bubbles carry the design.

---

## Geometry

### The bubble field

A positioned container over the avatar, `pointer-events: none`, `aria-hidden`:

```
position: absolute;
top: -38px; right: -38px; bottom: -8px; left: -38px;
```

The bleed is deliberately asymmetric. **The bottom is only 8px** — the lockup group starts
just 24px below the avatar row, so a symmetric `-38px` bleed lets a low bubble land on the
"S" of the wordmark. Constrain the field; don't nudge individual bubbles.

Bubbles are positioned with `left`/`top` as a percentage of this field and centred with
`translate(-50%, -50%)`.

### The eight bubbles

| # | x % | y % | size px | delay s | duration s | tint | rim |
|---|---|---|---|---|---|---|---|
| 1 | 6 | 24 | 26 | 0.8 | 4.2 | `#BFDCE8` | `#9FC6D6` |
| 2 | 86 | 14 | 34 | 1.5 | 5.0 | `#CFE3EC` | `#A8CCDA` |
| 3 | 96 | 48 | 19 | 2.4 | 3.8 | `#D8D2EE` | `#B3A9DC` |
| 4 | 78 | 80 | 28 | 1.1 | 4.6 | `#C7E2E0` | `#9CC8C4` |
| 5 | 14 | 84 | 21 | 3.0 | 4.0 | `#D8D2EE` | `#B3A9DC` |
| 6 | 1 | 62 | 31 | 2.0 | 5.4 | `#BFDCE8` | `#9FC6D6` |
| 7 | 48 | −3 | 17 | 3.5 | 3.6 | `#CFE3EC` | `#A8CCDA` |
| 8 | 62 | 4 | 14 | 4.1 | 3.4 | `#C7E2E0` | `#9CC8C4` |

Three constraints behind that table, if you ever re-space them:

- **Sizes, delays and durations are all mutually different.** Uniform timing makes eight
  bubbles pulse as one object, which reads as a loading spinner rather than soap.
- **Nothing above y ≈ 85%** — below that and a bubble reaches the wordmark.
- **Distributed around the face, not evenly on a ring.** Two clustered near the top right,
  one alone at the left edge; the irregularity is what makes it feel incidental.

---

## Artwork

### Bubble

`viewBox="0 0 40 40"`, rendered at the size in the table.

| Layer | Shape | Fill / stroke |
|---|---|---|
| Body | `circle` cx 20 cy 20 r 17.5 | fill = tint at `fill-opacity: .55`, stroke = rim at 2.2px |
| Main highlight | `ellipse` cx 14 cy 13.5 rx 5 ry 3.6, `rotate(-28 14 13.5)` | `#FFFFFF` at `.85` |
| Small highlight | `circle` cx 26.5 cy 25.5 r 2 | `#FFFFFF` at `.5` |

Two highlights, upper-left large and lower-right small, are what make a flat circle read
as a bubble. A single highlight reads as a button.

### Burst

`viewBox="0 0 60 60"`, rendered at **1.5×** its bubble's size, same `left`/`top`.

| Layer | Shape | Fill / stroke |
|---|---|---|
| Ring | `circle` cx 30 cy 30 r 16, `stroke-dasharray: "5 7"`, `stroke-linecap: round` | stroke = rim at 2.4px, no fill |
| Droplets | `circle` at (30,8) r 2.6 · (52,30) r 2.2 · (30,52) r 2.6 · (8,30) r 2.2 | fill = rim |

The dashes plus four droplets read as a pop. A solid expanding ring reads as a ripple.

### Halo

A radial-gradient circle behind the avatar, inside the same relative wrapper:

```
position: absolute; left: -26px; top: -26px;
width: 204px; height: 204px; border-radius: 204px;
background: radial-gradient(circle, rgba(196,222,232,.55) 0%, rgba(196,222,232,0) 68%);
opacity: .3;   /* resting state */
```

---

## Animation

### Keyframes

```css
@keyframes bb-float {
  0%,100% { opacity:1; transform:translate(-50%,-50%) scale(1) }
  52%     { opacity:1; transform:translate(-50%,calc(-50% - 16px)) scale(1.05) }
  64%     { opacity:1; transform:translate(-50%,calc(-50% - 20px)) scale(1.24) }
  70%     { opacity:0; transform:translate(-50%,calc(-50% - 22px)) scale(.3) }
  80%     { opacity:0; transform:translate(-50%,calc(-50% + 8px)) scale(.4) }
  92%     { opacity:1; transform:translate(-50%,-50%) scale(1) }
}

@keyframes bb-burst {
  0%,62%   { opacity:0;   transform:translate(-50%,calc(-50% - 18px)) scale(.35) }
  70%      { opacity:.95; transform:translate(-50%,calc(-50% - 20px)) scale(1) }
  82%,100% { opacity:0;   transform:translate(-50%,calc(-50% - 30px)) scale(1.5) }
}

@keyframes bb-halo {
  0%,100% { opacity:.3; transform:scale(1) }
  50%     { opacity:.6; transform:scale(1.05) }
}
```

Reading `bb-float`: rest → drift up 16px while swelling slightly (52%) → swell hard to
1.24 at the top of the drift, the "about to go" beat (64%) → vanish at 70% → stay gone,
sinking back below rest (80%) → fade in at rest and hold (92% → 100%).

`bb-burst` fires its ring at 70% — the exact frame the bubble disappears. Both share the
bubble's `duration` and `delay`, which is what keeps them locked together.

### Application

```css
@media (prefers-reduced-motion: no-preference) {
  [data-anim="bubble"] { animation: bb-float var(--dur) ease-in-out var(--delay) infinite }
  [data-anim="burst"]  { animation: bb-burst var(--dur) ease-out     var(--delay) infinite }
  [data-anim="halo"]   { animation: bb-halo  3.4s      ease-in-out   1s          infinite }
}
```

Per-bubble timings are passed as CSS custom properties on each element, so one rule serves
all eight. Note the different easings: `ease-in-out` for the drift, `ease-out` for the burst.

### Entrance (only if not already present)

```css
@keyframes bb-pop  { 0%{opacity:0;transform:scale(.86)} 60%{opacity:1;transform:scale(1.03)} 100%{opacity:1;transform:scale(1)} }
@keyframes bb-rise { 0%{opacity:0;transform:translateY(14px)} 100%{opacity:1;transform:translateY(0)} }
@keyframes bb-fade { 0%{opacity:0} 100%{opacity:1} }
```

| Element | Animation | Duration | Delay | Easing |
|---|---|---|---|---|
| Bottle background layer | `bb-fade` | .7s | .15s | ease-out |
| Avatar | `bb-pop` | .68s | 0 | `cubic-bezier(.34,1.32,.64,1)` |
| Lockup | `bb-rise` | .6s | .34s | ease-out |
| Copy | `bb-rise` | .6s | .46s | ease-out |
| Actions | `bb-rise` | .6s | .58s | ease-out |

Same media-query guard, same resting-state rule. Two structural notes:

- The avatar's overshoot easing (`1.32`) is what gives the pop its bounce — a plain
  `ease-out` reads as a fade.
- **Apply the actions' entrance transform to an inner wrapper, not to the group that owns
  the bottom padding.** The screen is `overflow: hidden`; if the padded group itself holds
  `translateY(14px)` at rest, its bottom edge lands 14px past the frame and the CTA gets
  clipped.

---

## If the target is React Native

RN has no CSS keyframes. Use `react-native-reanimated`:

- One `useSharedValue` progress per bubble, driven by
  `withRepeat(withTiming(1, {duration}), -1)` after a `withDelay(delay)`.
- Map progress → `opacity` / `translateY` / `scale` with `interpolate`, using the keyframe
  percentages above as the input range (e.g. `[0, .52, .64, .70, .80, .92, 1]`).
- **Initial `useSharedValue` must be the resting visible state**, so a first frame before
  the animation starts shows bubbles rather than nothing.
- Honour `AccessibilityInfo.isReduceMotionEnabled()` — when true, skip starting the loops
  entirely and leave the resting state in place.
- Bubbles and bursts are SVG: use `react-native-svg` with the shape tables above.
- The halo's radial gradient needs `<RadialGradient>` from `react-native-svg`, or a
  pre-rendered PNG.

## Files

| File | What it is |
|---|---|
| `bubble-motion.html` | Live reference. Toggle button shows the resting state. |
| `assets/avatar-round.png` | The existing avatar — included only so the reference renders. **Already in the codebase; do not re-add.** |

Source of truth in the design project: `Skintel Welcome Bubbles.dc.html`.

There is also a sparkle variant (`Skintel Welcome Sparkle.dc.html`) using gold and lilac
four-point stars instead of bubbles, same structure. Not part of this handoff — ask if you
want it packaged.
