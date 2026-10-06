# for.me design

The one design document for for.me: the rules every screen follows, with the
values the code actually uses. Rewritten on 7 October 2026 by checking every
claim of the old `design/DESIGN_SYSTEM.md` against the code; that file, with its
v7 and v9 halves, is gone.

**The code is the source of truth. This file describes it.** Where they
disagree, the code wins and this file is wrong: fix the file.

- Colours, type, spacing, radii, shadows: `lib/tokens.ts`.
- Raw hex for props that take a literal colour (`ActivityIndicator.color`,
  `headerTintColor`, SVG `fill`): `lib/colors.ts`.
- Colours and type sizes for `className`: `tailwind.config.js`. These three are
  mirrors; change one, change the others (see "Known gaps"). Almost nothing uses
  a theme class: screens style through inline tokens, and the app's only
  `className`s are `active:opacity-*`, a few layout utilities and `font-display-medium`.
- **Never hardcode a value that has a token.** If a token is missing, add it
  first and say where its value was read from or how it was computed.
- Hand-off folders (`design_handoff_*` and similar) are intent, not code. They
  decide looks only. Scoring (bands, cutoffs, weights) is the code's: read
  `SCORE_BANDS`, never a number from a mockup.
- iOS is the only release target. The app is light only: `app.json` sets
  `userInterfaceStyle` to `light`, and there are no dark variants.

**The one rule above all: one design per element type.** Change a button, a row,
a pill or a card and every instance on every screen changes with it. Each
element below names the component that draws it. Use the component, do not
redraw it.

---

## Colour

Surfaces are flat. A card is just its fill: no border and no drop shadow. Only
things that float get a shade (sheets, pop-ups, the filter popover, the tab bar,
the 40pt icon circles).

### Surfaces

| Token | Value | Use |
|---|---|---|
| `CANVAS` | `#F8F9F4` | every page: pale sage |
| `SURFACE` | `#FFFFFF` | cards, answer rows, list rows, search bar, icon circles |
| `STONE` | `#F4F2EE` | the product result's header; a card sitting on a white sheet |
| `SHEET` | `#FFFFFF` | sheets, pop-ups, the result's sheet |
| `CANVAS_GLASS` / `STONE_GLASS` | the above at 55% | the frosted fixed header (`GlassHeader`) |
| `TAB_BAR_GLASS` | white at 86% | the floating tab bar |
| `SCRIM` | `rgba(36,31,30,.32)` | behind sheets and pop-ups |
| `CAMERA_STAGE` | `#1C1816` | the scanner's dark stage, the only dark surface |
| `RISK_FILL` / `RISK_LINE` | `#F7F6F4` / `#E7E3DE` | the two-risk box on Ingredients |

### Text and lines

| Token | Value | Use |
|---|---|---|
| `INK` | `#2F2C2A` | text, icons |
| `MUTED` | `#524D48` | secondary text, group labels (8.35:1 on white) |
| `MUTED_FAINT` | `#5E5954` | brand line, meta (6.9:1) |
| `TAB_INACTIVE` | `#5E5954` | unselected tab icons and names |
| `PLACEHOLDER` | `#7A746E` | input placeholder |
| `ICON_MUTED` | `#ADA7A1` | search magnifier, decorative icons |
| `ROW_CHEVRON` | `#B9A79E` | row chevrons |
| `HAIRLINE` / `LINE` | `#E3DFDA` | dividers inside a card, unchosen outlines |
| `DIVIDER` | `#ECE8E3` | 0.5pt line between rows on a white page |

### Actions and selection

| Token | Value | Use |
|---|---|---|
| `BUTTON.primary` | fill `#767A5C`, pressed `#62664B`, label white | every filled button, tick and progress |
| `BUTTON.secondary` | fill `#EEEFE7`, label `INK` | a less important action |
| `BUTTON.tertiary` | outline `#62664B` | a low-emphasis action |
| `BUTTON.disabled` | `#C9CCB8` | any disabled button |
| `LINK` | `#62664B` | text actions |
| `CHOSEN` | fill `#EEF1E7`, border `BUTTON.primary.fill`, label `INK` | anything chosen: chips, answer rows, a menu row |
| `TAB_PILL` / `MENU_CHOSEN` / `SELECTED` | `#EEF1E7` / `#EEEFE7` / `#EEEFE7` | the current tab, the chosen filter row, a selected control |
| `DESTRUCTIVE_OUTLINE` | fill `#FFECE9`, label `#CC4F49` | every delete, remove and report button: soft, never a solid red |
| `ROW_PRESSED` | `#EFEDE9` | a white row while pressed |
| `STAR_ON` | `#CF9E3E` | a starred ingredient |
| `TOAST` | fill `INK`, label white, action `#EEEFE7` | the undo toast |

### Verdicts

`VERDICT.high | medium | low` and `VERDICT_NEUTRAL`, each with `solid` (rings,
dots, bars), `tint`, `deep` (the verdict word, and the fill of a verdict pill),
`wash` (the card behind a reason) and `halo`. `scoreColours(verdict)` picks the
right set; never pick by hand.

| Band | Words | `solid` | `deep` | `tint` / `wash` |
|---|---|---|---|---|
| Excellent (`EXCELLENT`) | Excellent match | `#6B7A40` | `#6B7A40` | `#EEF1E7` |
| Good (`high`) | Good match | `#8A9A5B` | `#8A9A5B` | `#EEF1E7` |
| Fair, Watch (`medium`) | Fair match | `#E78B30` | `#A85A14` | `#FBF1E6` |
| Poor, Avoid (`low`) | Poor match | `#E56B65` | `#CC4F49` | `#FFECE9` |
| Unknown (`VERDICT_NEUTRAL`) | | `MUTED` | `MUTED` | `#F2F1F0` / `#F4F2EE` |

- `WARN` is `VERDICT.medium.deep` (cautions that are not a verdict). `DANGER` is
  `VERDICT.low.deep` (erase my profile, and nothing else).
- **Fair's `deep` is `#A85A14`, not the hand-off's `#C26E1E`.** Computed on 6
  October 2026: the hand-off's read 3.4 to 3.8:1 on white, the page and the
  tint; `#A85A14` reads 5.1:1 on white and 4.55:1 on the tint. White on it as a
  pill is 5.1:1. `__tests__/verdict-contrast.test.ts` holds this.
- **Colour means something.** Green is good, orange is watch or fair, red is
  avoid or poor, grey is unknown. Home is the one place with decorative tints.
  Elsewhere a tint is a verdict.

### Home and routine

| Token | Value | Use |
|---|---|---|
| `HOME_TILE` | scan `#EEF1E7`, actives `#EFEBF1`, start `#F6F0E2` | Home's Scan Any Product and Find Your Actives tiles, and the Start your routine card |
| `HOME_CARD_FILL` | `#EEF1E7` | the no-profile card on a result |
| `HOME_TODAY` | evening wash base `#EBEEF7`, pill `#4A5272`; morning wash base `#FAF3E6`, pill `#D9A24A` | Home's routine card and the skincare tip's note |
| `ROUTINE_SWITCH` | morning thumb `#F7E3B0` (sun yellow), evening thumb `#3C4460` (night blue), step disc `#EEEFE7`, step line `#B5BAA0` | the Morning / Evening switch and the routine's rail |
| `SKIN_NEEDS` | chip line `#E6E2DD`, chosen ink `#4F523C`, sage `#ECEEE2`, note `#F6E4E0`, step ink `#9A5A2E`, warn `#A85A14`, amber `#E7A93C`, mauve `#C9A5B8`, plus ten `family` tints | the Find your actives flow and its story cards |
| `SCANNER_SWITCH` | camera: track white at 14%, thumb `BUTTON.primary.fill`; page: track `SWITCH_TRACK_GLASS` | the Barcode / Ingredient list switch |

---

## Type

Everything is the system font (SF Pro) except these, loaded in `app/_layout.tsx`:

| Face | Token | Where |
|---|---|---|
| PT Serif Bold, upright | `DISPLAY_FONT` | one big title per screen, ingredient names, the score number, the onboarding headline |
| Kalam Bold / Regular | `HAND_FONT_BOLD` / `HAND_FONT` | Home's "Hi there!" (34), the skincare tip, Find your actives' notes |
| Figtree SemiBold | `MENU_FONT` | the soft profile menu's row names |
| Caveat Medium | `NOTE_FONT` | a person's own notes; loaded after first paint (`lib/note-font.ts`) |
| Montserrat Light / Regular | none | the quiz shell's Skip (`components/shell/shared.tsx`) |

`TYPE` scale: caption 13, label 15, body 15, card 17, title 20, heading 24,
large 30, display 34 (the score). Title levels, all PT Serif in ink, never a
coloured word:

| Level | Size / line | Where | Component |
|---|---|---|---|
| Large | 30 / 33 | tab roots (Home, School, Saved, Profile), 62pt from the top | `TabTitle` |
| Page | 24 / 28 | pushed screens, sheets, pop-ups, empty states | `PageTitle` |
| Card | 17 semibold system | headings inside cards | none |

Button labels are 17 semibold (`TYPE.card`), the same step as a card heading. Text
actions are 15 semibold in `LINK`, never underlined. A group label (`SectionLabel`) is 13 semibold, capitals, 0.78
letter-spacing, in `MUTED`.

**Larger text** (`FONT_SCALE`, applied in `components/Text.tsx`): display 1.3,
UI 1.5, reading text 3.6, icons beside reading text 2. The onboarding intro caps
its headline and copy at 1.3 on purpose (an accepted trade-off, noted in
`OnboardingShell`).

Write sizes as `TYPE.*`, never as bare numbers. The scale has no 12, 14, 16, 18 or
19: those sat within a point of a step and were folded into it on 7 October 2026.
Exceptions are sized to a fixed shape and stay literal: the number inside the 30pt
`ScorePill` and the 96pt ring, the "i" on the verdict pill, the 11pt day chip's
letter on the routine, and the "!" mark in the scanner's announcement.

**Orphans.** A heading or short line never ends on a single word: pass it through
`noOrphan` (`lib/text.ts`), which joins the last two words with a non-breaking
space. It is used on page and quiz titles, empty states, confirm sheets and the
result's title and summary.

## Spacing

`SPACE` (`lib/tokens.ts`): text 8, block 12, gutter 16, section 24; 32 appears in
a few layouts. 16pt page margins and card padding, 12pt between cards in a group,
24pt between sections. Write these as `SPACE.*` in `gap`, `padding` and `margin`,
never as bare numbers. Minimum tap target `TOUCH_TARGET`: 44 on iOS (48 on
Android).

## Corners

Four steps for every rounded rectangle (`RADIUS` in `lib/tokens.ts`). Never
write a radius number for a card, box, control or sheet.

| Step | Radius | Use |
|---|---|---|
| `RADIUS.control` | 14 | small controls: verdict pills, steppers, the filter popover, the note editor |
| `RADIUS.card` | 20 | cards, rows and boxes: product rows, menu groups, answer rows, reason boxes, the risk box (`CARD_RADIUS` is this step) |
| `RADIUS.panel` | 28 | large cards: the Home routine card and its skeleton, story cards, the card deck, the ingredient box (1.5pt outline in `BUTTON.primary.fill`), toasts |
| `RADIUS.sheet` | 36 | pop-ups and sheets: floating sheets (10pt off the sides and bottom), a bottom sheet's top corners, the result's white sheet (rising 16 over the header) |

- A **circle** is half its size and a **pill** half its height; compute them where
  they are drawn (`size / 2`). Every button, chip, search bar and segmented
  control is a full pill.
- A shape nested in another takes the outer radius less the gap between them
  (the filter popover's options: `RADIUS.control` less 4pt of padding).
- Not on the scale, on purpose: chat bubbles (a small tail corner), the corner
  brackets' curve in the scanner, progress bars and dots a few points tall.

## Shadows

Cards have none (`CARD_SHADOW` is empty). Floating things: `SHEET_SHADOW`
(sheets and pop-ups), `FLOATING_SHADOW` (tab bar, menus), `RAISED_SHADOW` (the
scan button), `ICON_SHADOW` (icon circles), `MENU_SHADOW` (filter popover). The
segmented thumb has its own two-layer lift.

---

## Components

### Buttons: `PrimaryButton`

Every filled or outlined action is **48pt tall** (`BUTTON_HEIGHT`) and a full
pill, whatever its width (`BUTTON_WIDTH`):

| Width | Use |
|---|---|
| full | actions that move a flow forward: Continue, Show products, Sign in |
| 220 (`secondary`) | pop-ups, sheets, empty and error states |
| 180 (`inCard`) | inside a card: Get my match |
| 140 (`pair`) | each of a confirm pair (Keep it / Delete) |

Label 17 semibold, white on `BUTTON.primary.fill`. No shadow. Pressing shrinks
it slightly. There is no Cancel or "Not now" on a screen that already has a
back arrow, a close circle or a tab bar, or on a sheet that swipes away. The
onboarding intro's button is its own flat 56pt pill (`OnboardingShell`).

### Headers

- **`ScreenHeader`** is the top row of every pushed screen: a 40pt back circle
  (`IconCircle`) under the status bar, an optional centred 17 semibold title (at
  most 170 wide), and right-hand circles (heart, share, star). A screen that
  slid up over another closes with an X on the right instead
  (`StoryAwareHeader`).
- **`IconCircle`**: a 40pt white circle with `ICON_SHADOW`, the icon in ink.
  Back is an arrow only, never a word. Heart on is filled red (`VERDICT.low.solid`),
  star on is filled ochre.
- **`GlassHeader`**: a fixed top on glass for the product result and Find your
  actives. What scrolls up passes behind it, blurred (12); a 24pt soft edge fades
  in once scrolled. A deliberate owner decision (2 October 2026).
- Two header patterns exist today: the inline title with a back circle (the
  result, Find your actives), and a large left title below a title-less
  `ScreenHeader` (Routine, Account, Support, Privacy).

### Controls

- **`SegmentedSwitch`**: one height everywhere, **44pt**, 3pt padding, a pill
  thumb that springs across. `tone` light (Saved's tabs, Skin match |
  Ingredients), dark (over the camera), or a full `SwitchLook` (Morning |
  Evening).
- **Chips** (`ProfilePickers`): 38pt pills, 15pt, 8pt gap. Chosen: `CHOSEN`
  fill and a 1.5pt outline; otherwise a 1.5pt `LINE` outline.
- **Answer rows** (`QuizOptionCard`): full width, white, `RADIUS.card` corners, minimum
  56pt (72pt with a description), the name 17 semibold, a 24pt round tick at
  the end. No two-per-row tiles.
- **Search bar** (`SearchBar`): a 44pt white pill, no border, 17pt text, a clear
  cross.
- **Filter** (`FilterDropdown`): "Filter: **All** ⌄" in a group header; opens a
  white popover (`RADIUS.control`) with 44pt rows and the chosen row on `MENU_CHOSEN`.

### Lists and rows

- **Product row** (`ProductListRow`): a white card, 76pt minimum, `RADIUS.card`;
  a 52pt bottle straight on the card, the name 15 semibold over a 13pt line, the
  small score ring, the heart. 12pt between cards. Search, Saved, History and
  the finder's results all use it.
- **Score beside a product** (`ScorePill`): a 30pt ring, 2pt in the band's
  `solid`, the number 12 bold in `deep`, no fill. A safety shield sits beside it
  when the EU notice applies.
- **Big score** (`ScoreRing` in `components/result/`): a 96pt ring on a 108pt
  white disc, over the result sheet's edge. Under it the verdict pill
  (`VerdictLink`): 40pt minimum, `RADIUS.control`, 17 semibold white on the band's
  `deep`, with an "i"; it opens How scoring works.
- **Verdict marker** (`VerdictMarker`, `VerdictDot`): an 8pt dot in a 4pt halo,
  then the word in `deep`, 15pt. Never a Good / Watch / Avoid pill.
- **Settings lists** (`MenuRows`): white grouped cards, 56pt rows, a 17pt label,
  a grey value, a chevron. `destructive` gives a red label and no chevron.
- **Group label** (`SectionLabel`): see Type.
- **Saved's three tabs** share one layout: a group label with "Clear all" on the
  first, separate 76pt cards, swipe left to an 88pt soft-red bin
  (`SwipeToDelete`) that asks first (`ConfirmSheet`).

### Sheets and pop-ups

- **Pop-up** (`BottomSheet` floating, `ScanPopup`, `SheetScreen`): 10pt off the
  sides and bottom, `RADIUS.sheet`, on the page colour, over a dimmed, lightly blurred
  screen. Rises in 280ms, leaves in 220ms. Optional badge, a Page title, one 15pt
  `MUTED` line, buttons per the button rule. Cards inside a sheet are `STONE`.
- **Bottom sheet**: top corners `RADIUS.sheet`, with a grabber.
- **Confirm** (`ConfirmSheet`): a title, a line, Keep it (primary) and Delete
  (`DESTRUCTIVE_OUTLINE`), 140pt each.
- **How scoring works** and the **ingredient sheet** are floating sheets
  (`SheetScreen`). **Toasts** are `TopToast` (Find your actives) and the undo
  toast (`TOAST`).

### Empty states: `EmptyState`

The picture (220 wide, or the full width for a wide scene), a Page title, one
line, and at most one 220pt button. Illustrations appear only on Home, in empty,
permission and not-found states, onboarding, loading, and the Find your actives
story.

### Other shared pieces

`SafetyShield` (the EU safety notice's mark, behind a flag), `ReferenceLink`
(a source link with an open icon), `ReportMistakeLink`, `SaveHeart` (44pt tap
area), `ProductThumbnail`, `ProductNote`, `FirstPageMoment`, `BuildingRoutine`,
`DottedLine`, `Sparkles`, `PopOnToggle`, `ScreenReaderAnnouncer`.

---

## Screens

**Navigation.** Five tab slots on a floating 56pt capsule: Home, School, a raised
68pt Scan button (22pt lift, opens the scanner as a full-screen modal; not a
tab), Saved, Profile. Pushed screens use `ScreenHeader`. Quiz, Find your actives,
the scanner, How scoring works and the ingredient sheet slide up.

- **Onboarding** (`app/onboarding`, `components/shell/OnboardingShell`): three
  screens, one persistent shell. Headline 36 PT Serif (first line in the accent
  colour), 18pt copy, a 56pt pill. Swipe or Continue; only the words slide, the
  pictures crossfade; Skip, dots and the button stay put. The dots read as one
  element, "Page n of 3", and each new headline is announced.
- **Home**: "Hi there!" in Kalam bold 34; the top card is Start your routine
  until there is one, then today's routine (`RoutineCard`, 212pt, `RADIUS.panel`);
  an Explore row of two tiles (Scan Any Product, Find Your Actives); the
  skincare tip as an envelope that opens into a note. While the routine builds,
  `HomeSkeleton` shows grey shapes in the same room.
- **Product result** (`app/product/[id]`, `components/result/ResultTabs`): the
  header (bottle, brand 15 `MUTED_FAINT`, name 17 semibold, type 13 `MUTED`) and
  the Skin match | Ingredients switch on `STONE`, fixed on glass; the result is a
  white sheet (`RADIUS.sheet`) rising over it.
  - *Skin match:* the score ring on the sheet's edge, the verdict pill, a title
    and one line (with "N things to watch below" when a good match carries
    warnings), then reason boxes (`RADIUS.card`, on the verdict's `wash`, a dot, the
    bold name and a sentence), grouped by colour: 8pt between boxes in a group, a
    section between groups, a small label ("Working for you", "Worth watching")
    once there are both, and the first box a size larger. At most six boxes; on a good match up to two
    orange ones always keep their place; boxes that say the same sentence merge.
  - *Ingredients:* the two-risk box, then the ingredient box.
  - A tab opens at its top.
- **Ingredient box** (`IngredientsCard`): white, 1.5pt sage outline, 28pt
  corners; rows worst first; a chevron only on rows that open; "N more, no
  concerns" on a filled button; the footnote and Report a mistake inside.
- **Scanner**: the dark stage; close, the Barcode | Ingredient list switch and
  the torch across the top; white corner brackets; a shutter and a photo-library
  button in the ingredient mode. Found and not-found pop-ups as above.
- **Quiz** (`QuizFrame`): back circle, "Question 2 of 4" centred, close circle,
  over a thin line that fills; the question as a Page title; answer rows; the
  button on its own bar at the foot, disabled until a choice is made.
- **Find your actives** (`app/journey`, `app/journey-story`): one scrolling
  screen of questions (chips and answer cards), a pinned "Show what helps"
  button, then a deck of cards that opens a story of tappable cards.
- **Routine**: skin profile card, the tinted Morning | Evening switch, the day
  strip, numbered discs on a dotted rail beside white step cards.
- **Saved, School, Profile**: Large titles; Saved uses its three tabs; School is
  a chat with prompt chips and a search bar; Profile is settings lists.
- **Account, Support, Privacy, Skin profile, sign-in**: lists and plain text on
  `CANVAS`; the sign-in sheet is a floating sheet.

## Motion and accessibility

- Sheets rise on a cubic ease and the segmented thumb springs. Everything
  checks Reduce Motion (`lib/reduce-motion.ts`): with it on, things just appear
  (no slide, zero-length animations).
- Tap targets follow `TOUCH_TARGET` (44). One known exception: `ReferenceLink`
  is 36pt tall. Icon buttons carry a spoken label.
- Contrast ratios are noted beside tokens in `lib/tokens.ts`. Below 4.5:1
  today: Good's word 3.1, Poor's word 4.39, and the white label on
  `BUTTON.primary.fill` 4.46 (see Known gaps).

## Known gaps

- **Good's word is 3.1:1, Poor's is 4.39:1 on white, and the white label on the
  sage button is 4.46:1**, all under 4.5:1 for small text. They are the
  hand-off's colours; Good is the brand olive. Left for the owner.
- **Colour lives in three files** (`tokens.ts`, `colors.ts`, `tailwind.config.js`)
  and is kept in step by hand.
- **About 40 font sizes are written inline** rather than from `TYPE`.
- **The app icon is a terracotta heart** while the interface is sage and olive.
- **Two header patterns** (see Headers) and the result's glass header, whose text
  shows through the tab pills while scrolling, are known and deliberate or
  undecided, not accidents.
- **Find your actives does not read the quiz's sensitivity and pregnancy
  answers**, so it can say "skipped" after a quiz.

## Provenance

The v7 hand-off ("Newest Design Sept 29", 29 September 2026) and v9
(`design_handoff_formee_v9`, 1 October 2026) set the looks; the October 3 hand-off
set Find your actives; `handoff_home_and_tip` set Home and the tip. Fair's orange
was darkened on 6 October 2026 after the design critique. Where the code kept a
behaviour the design dropped (the photo library button in the scanner, Google's
own sign-in button), the look follows the hand-off and the behaviour stays.
