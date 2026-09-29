# for.me design system (v7)

The rules every screen follows. Written from the v7 hand-off
("Newest Design Sept 29", 29 September 2026) and the code that now carries it.
The hand-off is intent, not code: values here are the ones in `lib/tokens.ts`
(and its raw-hex mirror `lib/colors.ts`, plus `tailwind.config.js` for
`className`). **Never hardcode a value that has a token.** If a token is
missing for something new, add it there first, with where it was read from.

The one rule above all: **one design per element type.** Change a button, a
row, a pill or a card, and every instance on every screen changes with it.
That is why each element below names the component that draws it — use the
component, don't redraw it.

The Claude Design hand-off decides looks only. Scoring (bands, cutoffs,
weights) is the code's: always read `SCORE_BANDS`, never a number from a mockup.

---

## Colour

Surfaces are flat. A card is just its fill: no border, no hairline around it,
no drop shadow. Only things that float get a shade: sheets and pop-ups, menus
(the filter popover), the tab bar and the 40pt icon circles.

| Token | Value | Use |
|---|---|---|
| `CANVAS` | `#FCFAF7` | page and sheet background |
| `SURFACE` | `#FFFFFF` | cards, list cards, rows, search bars, icon circles |
| `INK` | `#241F1E` | text, icons |
| `MUTED` | `#6B5A54` | secondary text, caps group labels |
| `MUTED_FAINT` | `#8A7870` | brand line, meta |
| `ICON_MUTED` | `#A89890` | search magnifier and placeholder, ⓘ on cards |
| `ROW_CHEVRON` | `#B9A79E` | row chevrons |
| `HAIRLINE` | `#EFE6DA` | dividers between rows inside one card |
| `LINE` | `#E4D3C8` | unchosen chip outline, bubble outline, progress bar track |
| `SEGMENT_TRACK` | `#EFEBE6` | a light segmented control's track |
| `LINK` | `#9C6350` | text actions ("Clear all", "Try again", "Edit"), menu icons |
| `BUTTON.primary` | `#BA765F`, pressed `#A5654F` | the one filled action colour |
| `BUTTON.disabled` | `#D9C9BE` | every disabled button |
| `BUTTON.destructive` | `#A8453A` | delete label, "Report a mistake" |
| `DESTRUCTIVE_OUTLINE` | `#E9C2BD` / `#FDF5F2` / `#85322B` | the soft red "Delete" of a confirm pair, the swipe bin |
| `CHOSEN` | fill `#F3E5DA`, border terracotta | anything chosen: chips, quiz tiles, the finder summary, chat bubbles |
| `STAR_ON` | `#CF9E3E` | a starred ingredient |
| `ROW_PRESSED` | `#F7F0E6` | a white row or link card while pressed |
| `SCRIM` | `rgba(36,31,30,.32)` | behind sheets and pop-ups |
| `CAMERA_STAGE` | `#1C1816` | the scanner's dark stage (the only dark surface) |

**Colour means something.** Terracotta is for actions and the brand only. Green
is good, orange is watch or fair, red is avoid or poor, brown-grey is unknown.
Home is the one place with decorative tints (`HOME_CARD_FILL`, `HOME_TILE`);
elsewhere a tint is a verdict.

### Verdicts

`VERDICT.high | medium | low` and `VERDICT_NEUTRAL`, each with four roles:

| Role | Good | Watch | Avoid | Unknown | Use |
|---|---|---|---|---|---|
| `solid` | `#4A7A54` | `#B8672F` | `#A8453A` | `#6B5A54` | rings, dots, bars |
| `deep` | `#33593F` | `#8A4B22` | `#85322B` | `#6B5A54` | words, filled verdict pill |
| `tint` | `#E0EADB` | `#F6E2CF` | `#F4DBD5` | `#F1EAE4` | a score ring's track, a band label's fill |
| `wash` | `#F5F8F2` | `#FDF7F1` | `#FCF4F2` | `#F8F6F4` | the light card behind a reason or risk |

Excellent (`EXCELLENT`) is a deeper green, `#33593F`, on Good's tint, so the best
products stand apart. `scoreColours(verdict)` picks the right set; never pick
by hand.

Routine's morning and evening tints are `ROUTINE_TIME` (honey by day, dusk
plum at night).

## Type

SF Pro (the system font) for everything, except:

- **Playfair Display 500** (`DISPLAY_FONT`) for the one big title per screen and
  the score number inside the big ring.
- **Caveat 500** only for the person's own notes and Home's Tip of the day.

Three title levels, all Playfair 500 in ink, never a coloured word:

| Level | Size | Where | Component |
|---|---|---|---|
| Large | 30 / 33 | tab roots (Home, School, Saved, Profile), 62pt from the top (`tabRootTop`) | `TabTitle` |
| Page | 24 / 28 | pushed screens, sheets, pop-ups, empty states | `PageTitle` |
| Card | 17 semibold SF | headings inside cards | — |

Body sizes (`TYPE`): caption 13, label and body 15, card 17, title 20, heading
24, large 30, display 34 (the score). Button labels are SF 16 semibold.

## Spacing

Only 4, 8, 12, 16, 24 and 32 (`SPACE.text` 8, `block` 12, `gutter` 16,
`section` 24), plus hairline nudges and safe-area offsets. 16pt page margins
and card padding, 12pt between cards in a group, 24pt between sections.

## Corners

Cards 20 (`CARD_RADIUS`). Step cards and the Home scan card 24. The product
result's white sheet 32, the ingredient box 28. Pop-ups 36 (`FLOAT_RADIUS`),
bottom sheets 38 at the top. Every button, chip, search bar and segmented
control is a full pill.

---

## Buttons — `PrimaryButton`

Every filled or outlined action is **48pt tall**, whatever its width. Only the
width changes (`BUTTON_WIDTH`):

| Width | Use |
|---|---|
| full | actions that move a flow forward: Continue, Show products, Sign in, Turn on the camera |
| 220 (`secondary`) | pop-ups, sheets, empty and error states: See full result, Go to Home, Take the skin quiz |
| 180 (`inCard`) | inside a card: Scan now, Get my match |
| 140 (`pair`) | each of a confirm pair (Keep it / Delete) |

Label SF 16 semibold, white on terracotta; disabled `#D9C9BE` whatever the
variant. No shadow.

**Text actions** are SF 15 semibold in `LINK`, never underlined. A secondary
action is either a text action ("Try again", "Scan another", "Edit") or a list
row. "Clear all" sits in a group header and always asks first.

There is no Cancel or "Not now" on a screen that already has a back arrow, a
close circle or a tab bar, or on a sheet that swipes away.

## Icon circles — `IconCircle`

Back, close, heart, share and star in a nav bar or on a sheet: a 40pt white
circle with a soft shade, the icon in ink. Back is an arrow only, never a word.
Hearts and stars inside list rows stay plain. Heart on = filled red, star on =
filled ochre. The top row of every pushed screen is `ScreenHeader`.

## Segmented controls — `SegmentedSwitch`

One height everywhere: a 40pt pill track, 3pt padding, a pill thumb that
springs across. `tone="light"` on the page (Saved's tabs, Skin match |
Ingredients), `tone="dark"` over the camera (Barcode | Ingredient list), or a
whole `SwitchLook` for the routine's morning and evening colours.

## Chips — `ProfilePickers`

38pt pills, SF 15. Chosen: `CHOSEN` fill and a 1.5pt terracotta outline;
otherwise a 1.5pt `LINE` outline on the page colour. Used by Skin profile and
the finder.

## Search bar — `SearchBar`

A 44pt pure white pill, no border or shade, grey magnifier and placeholder,
17pt text, a clear cross. On a pushed screen a back circle sits to its left.

## Filter — `FilterDropdown`

"Filter: **All** ⌄" in a group header. It opens a white popover sized to its
longest option (radius 14), 44pt rows, the chosen row on `MENU_CHOSEN` with a
tick. Tapping outside closes it.

---

## Lists

### Product row — `ProductListRow`

Its own white card, 76pt minimum, radius 20: the 52pt bottle straight on the
card (never a well or tile behind it), the name in 15 semibold over a 13pt
line (brand, or brand · type, or brand · why), the small score ring, then the
heart (and a chevron where the row opens a result list). 12pt between cards.
Search, Saved, History and the finder's results all use it.

### Score ring beside a product — `ScorePill`

26pt, 2pt ring in the band's colour, the number 11pt bold in its text colour,
no fill. The big 96pt ring (`ScoreRing`) is only on the product result and
the scanner's found pop-up, always with its `VerdictPill` ("Good match ⓘ",
which opens How scoring works).

### Verdict marker — `VerdictMarker`

Everywhere an ingredient's verdict shows: a 12pt ring with a 3pt stroke in the
verdict colour, then the word in the verdict's text colour, 15pt, under the
name. Never a Good / Watch / Avoid pill.

### Settings lists — `MenuGroup` / `MenuRow`

White grouped cards with hairline dividers, 56pt rows, a terracotta line icon
(optional), a 17pt label, a value in grey, a chevron. `destructive` gives a red
label and no chevron. No coloured tiles.

### Group label — `SectionLabel`

13pt semibold spaced capitals in `MUTED` above a card ("WHAT THE NUMBERS
MEAN", "3 PRODUCTS", "TODAY"). A note under a card is 13pt `MUTED`.

### Saved's three tabs

Saved, History and Ingredients share one layout: a caps group label ("2
products", "Today", "1 starred") with "Clear all" on the first, separate 76pt
cards, swipe left to a bin (`SwipeToDelete`, 88pt, soft red) that asks first
(`ConfirmSheet`), and a line under the list saying so.

---

## Sheets and pop-ups

- **Pop-up** (`BottomSheet` floating, the scanner's `ScanPopup`): 10pt off the
  screen's sides and bottom, radius 36, on the page colour, padding 24/16/24,
  centred. Optional 48pt tinted badge, a Page title, one 15pt `MUTED` line,
  buttons per the button rule, then text actions.
- **Bottom sheet**: top corners 38 with a grabber.
- **Confirm** (`ConfirmSheet`): trash badge, title, line, Keep it (primary) and
  Delete (`DESTRUCTIVE_OUTLINE`), 140pt each.

## Empty states — `EmptyState`

The picture (at most 220, or 280 for the wider scenes), a Page title, one line,
and at most one 220pt button. Illustrations appear only on Home and in empty,
permission and not-found states.

---

## Screens, in short

- **Product result**: header on the page (bottle, brand 15 `MUTED_FAINT`, name
  20 semibold), heart and share circles; the Skin match | Ingredients switch;
  a white sheet (radius 32) overlapping it. Skin match: the big ring
  straddling the sheet's edge, the verdict pill, the explainer, reason cards on
  their verdict wash. Ingredients: two risk cards, then the ingredient box
  (white, radius 28, 1.5pt terracotta outline, Filter All / Watch-outs /
  Avoid / Not recognised, first 5 rows, "N more ingredients"), and a red
  "Report a mistake" once every row shows.
- **Scanner**: the dark stage; close, the Barcode | Ingredient list switch
  (230) and the torch across the top; white corner brackets; a 76pt shutter.
  Found and not-found pop-ups as above.
- **Quiz**: back circle, one 5pt bar per step (terracotta up to this one),
  close circle; the question as a Page title; white tiles two to a row, 124pt,
  a 60pt icon over the name, chosen = `CHOSEN` fill + 2pt terracotta ring;
  the button on its own bar at the foot.
- **Routine**: skin profile card, the tinted Morning | Evening switch, "Steps
  for today", 72pt step cards with a numbered badge in the time's colours and
  the step's bottle faded on the right, dotted connectors between them.

- **Tip of the day** (`TipCard`): a white paper note (radius 4, a three-layer
  soft shade, `TIP_NOTE`) under Home's tiles, a zigzag-cut strip of tape on
  top, "TIP OF THE DAY" and "Tap for another", the tip in Caveat 22. It opens
  on the day's tip; a tap shuffles to another with a wiggle from the tape, a
  spin of the shuffle icon, ochre sparkles and the new tip written in from the
  left. Reduce Motion just swaps the text.
- **Home's scan card** is a pale apricot, `HOME_SCAN_FILL` (`#F9EFE5`).
- **Links out** (Read more on PubChem): a white 56pt card with a terracotta
  line icon, a 17pt name over a 13pt "Opens in your browser" and an
  external-link icon; it opens in the in-app browser (`expo-web-browser`).

## Motion

Sheets rise with Apple's sheet spring; segmented thumbs with the segmented
control's spring. With Reduce Motion on, everything just appears.

## Provenance

v7 values were read off `ForMeV7.dc.html`, `ForMeMoreV7.dc.html`, the README
and `DESIGN_RULES.md` in the hand-off. Where this codebase kept a behaviour the
design dropped (Recently viewed on Search, the photo library button in the
scanner, Google's own sign-in button), the look follows v7 and the behaviour
stays; those are listed in the PR that brought v7 in.
