# Manassa design system

Extracted from the two onboarding handoffs and what actually shipped from them:
`design_handoff_manassa_onboarding` (single welcome screen) and
`design_handoff_manassa_onboarding_3` (three-screen carousel), as implemented in
`app/onboarding/index.tsx`.

**Every new screen builds from this file.** If a screen needs something this file doesn't
cover, add it here first — don't invent one-off styling in the screen itself.

This system coexists with the app's older purple/lilac system (`lib/colors.ts`,
`tailwind.config.js`'s `accent`/`level`/`status` tokens) during the rollout. Screens restyled
under this system use the tokens below; screens not yet restyled keep the old ones. Don't mix
the two within one screen.

---

## Colour

**Every value below lives in `lib/tokens.ts` and nowhere else.** No screen declares a hex.
That was not true until the contrast pass: each converted screen carried its own copy of the
palette as local constants, which was a deliberate compromise while half the app still ran on
the old lilac system — and it meant a one-value contrast fix had to be made in twenty-one
files. Import from the token module; if a value you need isn't there, add it there.

| Token | Hex | Contrast on canvas | Used for |
|---|---|---|---|
| `CANVAS` | `#FBF4EE` | — | screen background — flat, no pattern, no panels |
| `SURFACE` | `#FFFFFF` | — | raised card fill |
| `INK` | `#241F1E` | 15:1 | headlines, body copy, button text, active progress dots |
| `MUTED` | `#6B5A54` | 6.0:1 | secondary copy, plain-text secondary actions |
| `MUTED_FAINT` | `rgba(107,90,84,.65)` | — | footnote-scale copy, meta lines, `/100` suffixes |
| `MUTED_SOFT` | `rgba(107,90,84,.45)` | — | chevrons and marks that must not compete with a label |
| `LINE` | `#E4D3C8` | — | hairlines, dividers, unselected borders, inactive dots |
| `CTA` | `#E09070` | 2.3:1 | **the primary button fill, and nothing else** |
| `CTA_PRESSED` | `#C97C58` | — | primary button's pressed state |
| `SELECTED` | `#F9E7DC` | — | selected-control fill — every chip, card and tab in the app |
| `SELECTED_STRONG` | `#F5DCCC` | — | selected surface that needs to sit above `SELECTED` |
| `RADIUS_SELECTOR` | `14px` | — | corner radius for every selectable control |
| `INK_TINT` | `rgba(36,31,30,.06)` | — | neutral pressed/active wash (not a selection) |
| Button shadow | `rgba(36,31,30,.13)` | — | `0 3px 12px`, under the primary button only |

### The contrast pass, and what it corrected

The first build of this system read as washed out on a screen, and two values were the cause.

**Ink was `#5A342C`** — a mid-brown at 9.8:1. Legible in isolation, but it sat only a couple of
steps from the accent browns around it, so headings, body copy and decorative surfaces all
occupied the same narrow band of value. `#241F1E` is a warm near-black at 15:1: still warm,
no longer competing with its own accents.

**Muted was `#96605A`.** That value was chosen to clear 4.5:1 where the handoff's literal
`#9B665B` measured 4.34:1 — the arithmetic was right and the problem was elsewhere. A muted
brown that close in hue to the peach and rose accents made a secondary line and a decorative
surface read as the same material. `#6B5A54` is a warm grey-brown at 6.0:1: it reads as text,
not as a tint.

**The primary button was the accent peach itself, `#F2BFA6`, at 1.51:1 against the canvas.**
The original rule around it — no border, whitespace as the only boundary — was doing the work
a fill should have been doing, and the button had to be found rather than seen. `CTA`
`#E09070` is 2.3:1 against the canvas and 6.5:1 against its own `#241F1E` label. Everything
else about the button is unchanged: pill, 26px radius, 15px vertical padding, weight 500, one
per screen, still never used for anything but the primary action.

Note the consequence: **`CTA` is no longer the accent peach.** They are two different values
with two different jobs, and `ACCENT.peach` (`#FCD6C6`) is not a button colour.

### Illustration accents

`ACCENT.peach` `#FCD6C6`, `ACCENT.blush` `#FCE1DB`, `ACCENT.rose` `#F6CAC9`, `ACCENT.sage`
`#CDD8BE`, `ACCENT.lilac` `#D1B7DA` — **illustration and status colouring only, never a UI
surface.** They live inside the onboarding artwork's soft colour shapes. Don't use them as a
button fill, a card background, or a tinted panel: an earlier revision tried tinted panels
behind the onboarding illustrations and the panel colours competed with the artwork's own
shapes. If a screen seems to need a colour that isn't here, that's a sign to extend this
file's reasoning, not to pick a new hex.

---

## Typography

- **Playfair Display**, weight 500 — headlines only.
- **System sans** (`-apple-system, "SF Pro Text", system-ui`) — everything else.

| Role | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| Onboarding wordmark | 40 | 500 | 1 | −.018em |
| Screen headline (carousel) | 30 | 500 | 1.08 | −.018em |
| Tagline / supporting copy | 15 (single-screen) / 14.5 (carousel) | 400 | 1.5 | — |
| Icon label | 12 | 600 | normal | −.004em |
| Button label | 15 | 500 | normal | — |
| Secondary action / Skip | 13.5 | 500 | normal | — |

Playfair Display 500 is already bundled and loaded in `app/_layout.tsx`
(`PlayfairDisplay_500Medium`) — no new font work needed. Use the exact `fontFamily` string
`"PlayfairDisplay_500Medium"`.

**Extension — quiz question headline** (added here, not one-offed in the quiz screens):
Playfair Display 500, **26px**, `line-height: 1.15` (~30), `letter-spacing: -.018em`, ink.
Smaller than the carousel's 30px hero headline because a quiz question is a full sentence
("What are your main skin concerns?"), not a two-to-three-word beat — 30px pushed longer
questions to a cramped two lines. Sits in a **70px fixed box** (not the carousel's 68px —
recalculated for this size/line-height at up to two lines).

---

## Spacing

- **Horizontal gutter: 24px, everywhere.** No exceptions.
- Gap scale used across both handoffs: **4, 7, 10, 12, 18, 22, 54.**
- Fixed blocks (never auto-height — see "Fixed-height text" below): headline box **68px**,
  supporting-copy box **44px**, illustration block **430px** (3-screen carousel), icon box
  **84px** (single-screen).
- Bottom padding under the action row: **32px** (plus safe-area inset on device).
- Top padding above the first element: **54px** (3-screen carousel's Skip row) or an elastic
  spacer with a **20px floor** (single-screen's spacer A) — plus safe-area inset on device.

---

## Screen skeleton

Both onboarding screens are a single full-screen column (`flex-direction: column`,
`background: #FBF4EE`) built from **elastic spacers with explicit weights**, not equal
`flex:1` spacers and not auto-margins:

| Screen | Spacer weights | Resolves to (375×812) |
|---|---|---|
| Single-screen welcome | 1 : 1.4 (above : below the text group) | ~80px : ~104-112px |
| Three-screen carousel | 1.9 : 1 (above : below the text group) | ~41px : ~21px |

**The asymmetry is the point, not an accident.** More air goes above the text group than
below it in the single-screen layout (the CTA sits close to what it belongs to); the carousel
inverts the ratio because its text group sits much lower in the frame already. **Don't equalize
the weights** — an earlier revision used three equal spacers and opened a ~170px void that read
as a layout bug.

**Any text that can wrap sits in a fixed-height box.** This is a hard rule, not per-screen
advice: if a headline or supporting line might be one line on one screen/state and two lines
on another, give it a fixed-height container (68px for a headline-scale line, 44px for a
body-scale line — adjust for the actual font size/line-height, but keep it fixed) and center
or top-align the text inside it. Without this, elements below the text — dots, buttons —
land at a different y depending on how the text happens to wrap, and visibly jump between
screens or states. This bit the carousel in exactly this way during design (screen 2's
headline and screen 3's copy each wrap to two lines while their siblings don't).

When giving a fixed-height text box an actual width in React Native, use an explicit width
(e.g. the screen width minus the gutters) rather than relying on a flex parent's
`alignItems:"center"` to both shrink-wrap *and* wrap the text correctly — RN's flexbox doesn't
reliably guarantee both at once the way CSS does. See `app/onboarding/index.tsx`'s carousel
`Page` component for the pattern.

### Quiz skeleton (extension)

Pushed routes (not a swipeable carousel), so the skeleton is a fixed header + scroll body +
fixed footer rather than elastic spacers — the elastic-spacer pattern above is for a single
screenful of centered content, and a quiz step's content (a chip grid) can run longer than
one screen on a small device. `components/QuizScreen.tsx` implements this:

```
Back (top-left, 44×44) ······················ Step dots (top-right, one per quiz step)
Headline (70px fixed box, 26px Playfair)
Subtitle (44px fixed box, muted, optional)
Content (flexible — scrolls if it needs to)
Primary button (min-height 52, peach, shadow) — pinned to the bottom, 24px gutter
```

Back always goes to the previous step (`router.back()`) — never exits the flow, matching the
carousel's own back-behavior rule.

---

## Buttons

**Size interactive elements with `min-height` plus flex-centering. Never vertical padding.**
With `line-height: normal`, the content box is font-derived, so equal padding produces
*unequal* heights across different font sizes — the exact bug this system's own handoffs hit
twice: a 13.5px secondary link landed at 33.6px from the same padding that gave a button 48 or
52px, under the 44px minimum either way.

- **44px minimum on every interactive element**, everywhere in this system.
- **Primary button**: fill `CTA` `#E09070`, text `INK` `#241F1E`, `border-radius: 26` (pill),
  `min-height: 52`, `font-size: 15 / weight 500`. No border. Full width inside the 24px
  gutter. The 3-screen carousel additionally gives it `box-shadow: 0 3px 12px
  rgba(36,31,30,.13)` — include this shadow on any new primary button.
- **Secondary action**: plain text, `color: MUTED` (or `INK` if it needs more weight than
  muted allows), no background, no border, no radius. `min-height: 44`, flex-centered.
- **One primary action per screen.** Every additional action is a secondary (plain text) or,
  where the screen already has an established icon-button pattern (e.g. save/compare on the
  product screen), a clearly secondary control — never a second peach fill.
- Press state (not specified by either handoff, but consistent across both implementations):
  primary darkens to `CTA_PRESSED` `#C97C58`; secondary drops to 60% opacity. No border or shadow change on
  press. Implement with local `useState` + `onPressIn`/`onPressOut` feeding a **plain style
  object** — never `style={({pressed}) => ({...})}` on `Pressable`. That function-valued shape
  trips NativeWind's prop interop on this project and silently drops every style in it; it's
  what made the very first onboarding button invisible.

  **Exception**: the scanner (`app/(tabs)/index.tsx`) keeps its own pre-existing
  `active:opacity-90`-style feedback on its peach buttons instead of the darken technique —
  every other control already on that dark stage (the mode switcher, "Try another", etc.) uses
  opacity-based press feedback, and introducing one darken-based button among many
  opacity-based ones on the same screen would be its own inconsistency. Use the darken
  technique on new screens; don't retrofit the scanner.
- **A forward/back button pair reads left-to-right, like the flow it controls.** The
  ingredient detail screen's footer (`app/ingredient/[inci].tsx`) originally put "Next
  ingredient" (primary, `CTA`) on the left and "Back to list" (secondary, outline) on the
  right — the reverse of what every other back/forward pair in the OS does, which made the
  two easy to hit by mistake. Back/secondary goes left, forward/primary goes right.

---

## Selectable chip (extension)

Neither handoff draws a multi-select control — added here for the quiz, and now the pattern
every other selector in the app follows.

- **Unselected**: border `LINE` (1px), fill `CANVAS`, text `MUTED`, left-aligned.
- **Selected**: border `INK` (1.5px), fill `SELECTED`, text `INK`, left-aligned.
- `border-radius: RADIUS_SELECTOR` (14px) on every instance — a filter pill, a segmented tab
  and a quiz chip used to draw three different corners (999px, 24px, 14px) across the app,
  which read as three separate design systems making the same kind of decision differently.
  One radius everywhere; only the size (height, padding, grid vs. wrap) changes per screen.
- `min-height: 44` (the system's universal interactive-element minimum), flex-centered
  vertically, text left-aligned per the concerns-screen spec rather than centered — a row of
  short single-word/short-phrase options reads faster left-aligned than centered, especially
  once two chips sit side by side in a grid.
- Two per row, equal width (`flex: 1` each column), consistent gap (8-10px) matching the
  existing `CHIP_ROW` convention.

**Selection was ink at 6% opacity** (`rgba(36,31,30,.06)`, kept as `INK_TINT` for genuinely
neutral pressed states) — correct as an accessible fill, and on screen it read as a *disabled*
control rather than a chosen one, since a grey wash carries no signal of its own. `SELECTED`
(`#F9E7DC`) is `CTA` diluted to a watery tint over the canvas: peach stays reserved for the
one primary button (unchanged rule), but "chosen" now speaks in the same warm family as
"go," rather than in institutional grey. `INK` on this fill still clears 15:1 — the highest
text contrast on the screen, which is what a chosen option should look like.

## Progress dots

From the 3-screen carousel, reused wherever a multi-step flow needs a position indicator
(e.g. the quiz, in place of `StepProgress`'s numbered-circle rail):

- Row, `gap: 7`.
- Active: `20 × 6`, `border-radius: 3`, fill `INK`.
- Inactive: `6 × 6`, `border-radius: 6`, fill `DOT_INACTIVE`.

---

## Animation

Optional — neither handoff requires it, and the current onboarding screen ships static (see
`app/onboarding/index.tsx`'s module doc comment: an animated build of that same screen caused
a native crash in Expo Go, undiagnosed, and was parked static-for-now).

If a screen wants an entrance: **400ms ease-out fade with a 12px upward drift**
(`translateY(12) → 0`, `opacity 0 → 1`), staggered per element in reading order. Use exact
cubic-beziers matching the CSS keyframes, not Reanimated's named-preset approximations:

```ts
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);
```

Resting state must be the finished, visible state — an element's animated value should start
already correct (`useSharedValue(reducedMotion ? 1 : 0)`) so a screen with reduced motion on,
or a screenshot mid-animation, never shows a blank/hidden intermediate state.

---

## Match verdict

Semantic status colour, like the ingredient-rung good/watch/avoid ramp — not a decorative
accent, and never peach, which stays CTA-only. A match score needs a colour a shopper can
scan a list by, and green/orange/red is the one vocabulary that needs no legend.

Pulled warm and desaturated so they belong to this palette rather than to a browser's default
alert colours. **Three roles per tone, and they are not interchangeable:**

| Tone | `solid` | `tint` | `deep` | Label |
|---|---|---|---|---|
| `high` | `#3E7D5A` | `#DCEBE0` | `#2E5F44` | Great match |
| `medium` | `#C2662B` | `#FAE3CE` | `#8F4A1C` | Fair match |
| `low` | `#B23A32` | `#F7D9D5` | `#8C2A24` | Poor match |
| neutral | `LINE` | `#F1EAE4` | `MUTED` | Can't tell yet |

- **`solid`** — the 4px bar down a card's leading edge. Carries the verdict when someone is
  thumbing a list and reading nothing.
- **`tint`** — the badge fill. Quiet enough to sit on a white card without becoming the
  loudest thing in the row.
- **`deep`** — the badge label on that tint, weight 600. Every pairing clears 4.5:1.

**These replaced an earlier set** (`#3F7D5F` / `#A66339` / `#B04A3F`) that were muted
derivatives of the peach and rose accents. The arithmetic was fine and each was individually
legible, but "fair" and "poor" differed by about as much as two neighbouring swatches — you
could tell them apart side by side and not one at a time, which is the only way anyone
actually reads them.

### How a product row applies them

The verdict is carried **twice, at two reading speeds** — this is the pattern, not an
embellishment:

1. A **4px `solid` bar** full-bleed down the card's leading edge. It is the only element
   allowed to touch a card's edges; the card sets `overflow: hidden` so the bar clips to the
   corner radius rather than squaring off against it.
2. A **`tint` badge with `deep` text**, weight 600, pill — which spells the verdict out once
   you stop on the row.

Card fill stays `SURFACE` (white) with a `LINE` hairline. Applies to `components/ProductRow.tsx`
(Browse) and both lists on `app/(tabs)/saved.tsx`.

**Saved and History differ deliberately.** A saved row is re-scored live and carries both bar
and badge. A history row carries only the bar, tinted by the score the entry held *when it was
logged* — a log that rewrites its own past entries is worse than no log, so the snapshot gets
a colour but never a live badge.

### Everywhere else a verdict appears

All of these read `VERDICT` from `lib/tokens.ts`; none carries its own copy:

| Surface | Treatment |
|---|---|
| `app/product/[id].tsx` | verdict panel — `tint` background, `solid` border, `deep` text |
| `components/ScoreRing.tsx` | ring track is `tint`, fill is `solid` |
| `app/(tabs)/compare.tsx` | match row value in `deep` (rest of that screen is still on the old system) |
| `components/MatchBadge.tsx` | unused today, but reads the tokens so it can't drift |

**The five score bands collapse onto three tones.** `Verdict` has five values because the
MVP's `SCORE_BANDS` do; there are three colours because that is how many a person can tell
apart at a glance. `toneForVerdict()` in `lib/tokens.ts` is the bridge: excellent and good are
both a yes and share the green — the number beside the badge is what separates 92 from 78 —
fair is orange, poor is red, and unknown takes the neutral set rather than a colour, because
a formula we could not read is an absent verdict, not a bad one.

`WARN` (the flagged-ingredient count on a row's meta line) is `VERDICT.medium.deep`, and
`DANGER` (destructive actions only) is `VERDICT.low.deep` — one orange and one red in the
app, not three of each.

---

## Profile-screen chip (extension)

`app/(tabs)/profile.tsx`'s own `ProfileChip` — same border/fill/ink language as the quiz's
`QuizChip` (selected = 1.5px `INK` border + `SELECTED` fill + ink text; unselected =
1px `LINE` border + canvas fill + muted text; `RADIUS_SELECTOR` corner, same as everywhere
else), but **auto-width and wrap-flowed**, not a fixed 48%-of-row grid. The quiz's 2-per-row
grid assumes a small, fixed option count; the profile screen edits a variable number of
options per section (4 skin types, up to 8 concerns), where forcing every chip to half the
row width leaves short labels ("Oily") stretched and long ones ("Fine lines and wrinkles")
cramped. `CHIP_ROW` (`flexDirection: row, flexWrap: wrap, gap: 8`) plus content-sized chips
is the right technique here — same visual system, different layout math for a different
content shape.

**Section order**: skin concerns, skin type, sensitivity, pregnancy/breastfeeding — the
order the quiz itself asks them in.

**`area` (face/body) is gone from the whole app, not just this screen** — the data model
(`SkinProfile`, `Product`), the store (persisted version bumped to v6, migrated away), the
API layer (`data/api.ts` no longer selects or filters on it), and Browse's type-filter chips
(one unified list, not a face set and a body set). It never fed scoring — `matchProduct` has
never read it — and the one thing it did do split the browse list by a distinction that has
nothing to do with whether a formula suits a skin profile, which is the whole premise of the
app. A body lotion is not disqualified from being judged on its ingredients by being a body
lotion. The `products` table's `area` column is untouched in the database and the OBF
importer still writes it — this was a client-side removal, not a schema migration.

The old shared `components/Chip.tsx` has no remaining consumers after this — Browse and
Profile were its only two call sites. Left in place as dead code, same reasoning as
`MatchBadge.tsx` above.

---

## Provenance

| Source | What it covers |
|---|---|
| `design_handoff_manassa_onboarding/README.md` | Single-screen welcome: layout, tokens, the 33.6px button-padding bug, the peach/muted accessibility findings |
| `design_handoff_manassa_onboarding_animated/README.md` | The same screen's (parked) animation system — entrance stagger, ambient loop timings, transform-origin math |
| `design_handoff_manassa_onboarding_3/README.md` | Three-screen carousel: fixed-height boxes, 1.9:1 spacers, progress dots, per-illustration sizing rules |
| `app/onboarding/index.tsx` | What actually shipped — the static carousel implementation this file's rules are checked against |
