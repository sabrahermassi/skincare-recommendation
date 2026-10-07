import { Platform } from "react-native";

import { COLORS } from "./colors";

import type { Verdict } from "./matching";

/**
 * THE DESIGN TOKENS — the single source of truth for colour.
 *
 * Every screen imports from here. Nothing re-declares a hex locally: that was
 * the phased-migration compromise while half the app still ran on the old
 * lilac system (`lib/colors.ts`), and it meant a contrast fix had to be made
 * in twenty-one files instead of one. It doesn't any more.
 *
 * `lib/colors.ts` still exists and still owns the *old* system. The screens
 * that have not been converted (the safety pill, the ingredient-rung ramp)
 * read from it. Do not merge the two: they are different systems, and the
 * seam between them is deliberate until the last screen crosses over.
 *
 * Contrast figures below are measured against CANVAS unless stated.
 */

// ── Surfaces ────────────────────────────────────────────────────────────────

/**
 * The page ground on every screen — onboarding, the quiz and Saved included,
 * with no screen-specific cream or background picture. v7 design (29
 * September 2026) tones the cream down to a touch: `#FCFAF7`, read off the
 * hand-off; it replaced the owner's `#FDF9F0`, which replaced the FOR.ME
 * reskin's `#FBF6EE`.
 * Contrast figures below were measured against `#FBF6EE`. `#FDF9F0` is
 * slightly lighter, so a darker colour's ratio against it is the same or a
 * little higher, and white's (SURFACE) a little lower (computed, not
 * re-measured).
 */
// v9 (read off design_handoff_formee_v9, 1 October 2026): a pale sage page on
// every screen; the product result alone keeps a stone header under a white
// sheet. The comment above is v7's history.
export const CANVAS = "#F8F9F4";

/** `CANVAS` let through: the glass of a fixed header on the sage page (`STONE_GLASS`'s twin; 55% is a judged value). */
export const CANVAS_GLASS = "rgba(248,249,244,0.55)";

/**
 * Raised card fill. White, not a tint of the canvas — a card has to separate
 * from the ground by its own value, and canvas-on-canvas needed a border to
 * do the job the fill should have been doing.
 */
export const SURFACE = "#FFFFFF"; // v9: cards, quiz answers and list rows are white on the sage page

/**
 * Soft stone (v9, read off the hand-off): the product result's header, and a
 * card or panel that sits on a white sheet, where a white card would vanish.
 */
export const STONE = "#F4F2EE";

/**
 * `STONE` let through (owner, 2 October 2026): the wash over the blur on a
 * result's fixed header, thin enough to read as glass (owner: less blurry,
 * more see-through). Inferred: 55% is a judged value, not read off a hand-off.
 */
export const STONE_GLASS = "rgba(244,242,238,0.55)";

/** A sheet or pop-up's own ground (v9): white, whatever the page under it. */
export const SHEET = "#FFFFFF";

/**
 * Plain white, for what v9 keeps white on a white page: a switch's thumb, the
 * filter popover, a pop-up's ring backdrop, and an icon or label drawn on a
 * filled button. Not a card fill — that is {@link SURFACE}.
 */
export const WHITE = "#FFFFFF";

// ── Text ────────────────────────────────────────────────────────────────────

/**
 * Body copy and headings. Warm near-black at 15:1 — the previous #5A342C was
 * a mid-brown at 9.8:1, which passed on paper and read as washed out on a
 * screen, because it sat only a couple of steps from the accents around it.
 */
export const INK = "#2F2C2A"; // v9

/**
 * The dimmed backdrop behind a sheet or pop-up: `INK` at 32% (v7, read off
 * the hand-off), with a light blur behind a pop-up.
 */
export const SCRIM = "rgba(36,31,30,0.32)";

/** A sheet or pop-up's own shade (v7: 0 20 50 at 25%). */
export const SHEET_SHADOW = {
  shadowColor: INK,
  shadowOffset: { width: 0, height: 20 },
  shadowOpacity: 0.25,
  shadowRadius: 50,
  elevation: 20,
} as const;

/** Secondary text, 6.1:1. The old #96605A was close enough to the accent
 *  browns that a muted line and a peach surface read as the same weight. */
export const MUTED = "#524D48"; // v9: 8.35:1 on white, 7.47:1 on SURFACE (computed)

/**
 * Third-level text — meta lines, timestamps, "/100" suffixes, and the brand
 * eyebrow on every product row.
 *
 * Alpha is 0.88, not the 0.65 this used to be, because all of that is text
 * carrying information rather than decoration: WCAG 2.2 SC 1.4.3 asks 4.5:1
 * and 0.65 measured 2.95:1 on SURFACE and 2.85:1 on CANVAS — the brand name,
 * which is how someone confirms they are looking at the right bottle, was
 * the first thing to disappear in bright light. 0.88 computes to 4.88:1 on
 * SURFACE and 4.61:1 on CANVAS; 0.85 clears white but not CANVAS, so it is
 * the cream ground that sets the floor here.
 *
 * Still visibly lighter than MUTED (6.07:1), so the three-level hierarchy
 * survives.
 *
 * v7 (29 September 2026) makes it the design's brand/meta grey, `#8A7870`,
 * read off the hand-off: 4.20:1 on SURFACE, 4.03:1 on CANVAS (computed) —
 * under 4.5:1, so it is for the 13pt brand line and meta, never body text.
 */
export const MUTED_FAINT = "#5E5954"; // v9 meta: 6.9:1 on white (computed)

/**
 * Unselected tab-bar icons. #9A8880 computes to 3.14:1 on CANVAS (WCAG 2.2
 * SC 1.4.11 asks 3:1 of a control's icon) and 4.8:1 against INK. The selected
 * tab is INK, and MUTED sat only 2.5:1 from it — two dark browns — which is why
 * the selected tab was hard to pick out. Computed, not read off a mockup.
 */
export const TAB_INACTIVE = "#5E5954"; // v9

/** The pill behind the current tab in the tab bar (v9, read off the hand-off). */
export const TAB_PILL = "#EEF1E7";

/** The current tab's icon, and every terracotta text link (v7, read off the hand-off). 4.87:1 on SURFACE. */
export const LINK = "#62664B"; // v9 leaf sage, darker: 5.96:1 on white (computed)

/** Grey icons and placeholders: the search magnifier, an info "i" outline (v7). Decorative: 2.78:1 on SURFACE. */
export const ICON_MUTED = "#ADA7A1"; // v9

/** A text field's placeholder (v9, read off the hand-off): 4.13:1 on SURFACE (computed) — a hint, not content. */
export const PLACEHOLDER = "#7A746E";

/** The track behind a segmented control's sliding thumb (v7). */
export const SEGMENT_TRACK = "#E8EBDF"; // v9: on the sage page

/**
 * A switch's track as glass (owner, 2 October 2026): ink let through at 7%,
 * so what scrolls behind the switch shows through it, a little darker than
 * the header around it. Over the plain page it lands within a shade of the
 * solid tracks it replaced (computed). 7% is a judged value.
 */
export const SWITCH_TRACK_GLASS = "rgba(47,44,42,0.07)";

/**
 * The floating tab bar as glass (same request): white let through over a
 * light blur. Mostly white (owner: at 62% it could vanish over a white card),
 * so the bar always reads as a white bar and what scrolls under it shows only
 * faintly. 86% is a judged value.
 */
export const TAB_BAR_GLASS = "rgba(255,255,255,0.86)";

/**
 * Every destructive or report action (v9, read off the hand-off): the soft
 * see-through style, a pale red fill with red words and no outline. There are
 * no solid red buttons; the red itself is only an icon or the Poor verdict.
 * `label` on `fill` is 3.9:1 (computed), so it is 15pt semibold or larger.
 */
export const DESTRUCTIVE_OUTLINE = { border: "#FFECE9", fill: "#FFECE9", label: "#CC4F49" } as const;

/**
 * The undo toast over Saved's lists (v9, read off the hand-off): an ink pill,
 * white words. The mockup's "Undo" is a peach, `#F1C9B6`; v9 has no terracotta
 * anywhere, so it takes the pale sage instead (11.97:1 on the ink, computed).
 * Shadow 0 8 20 at 22%.
 */
export const TOAST = {
  fill: INK,
  label: "#FFFFFF",
  action: "#EEEFE7",
  shadow: { shadowColor: INK, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 10 },
} as const;

/** The chosen row in a filter popover (v7, read off the hand-off). */
export const MENU_CHOSEN = "#EEEFE7"; // v9 pale sage

/** A starred ingredient's star when on (v7, read off the hand-off). */
export const STAR_ON = "#CF9E3E";

/**
 * The Skincare routine (v9, read off the hand-off): the Morning | Evening
 * switch — a sun-yellow thumb with brown words in the morning, a night-blue
 * thumb with white words in the evening, both on the sage track — the sun's
 * own colour, and a step's numbered disc with the dotted line under it.
 */
export const ROUTINE_SWITCH = {
  morning: { track: SWITCH_TRACK_GLASS, thumb: "#F7E3B0", label: "#524D48", chosenLabel: "#5A4318", thumbShadow: null, fontSize: 15 },
  evening: { track: SWITCH_TRACK_GLASS, thumb: "#3C4460", label: "#524D48", chosenLabel: "#FFFFFF", thumbShadow: null, fontSize: 15 },
  sun: "#C98A26",
  stepFill: "#EEEFE7",
  stepLine: "#B5BAA0",
} as const;

/** Hairline dividers between rows inside a card (v7). */
export const HAIRLINE = "#E3DFDA"; // v9

/** The 0.5pt line between rows on a white page (v9, read off the hand-off): reasons, plan rows, the routine note, the risk box. */
export const DIVIDER = "#ECE8E3";

/** The two-risk box on a result's Ingredients tab, and the line between its rows (v9, read off the hand-off). */
export const RISK_FILL = "#F7F6F4";
export const RISK_LINE = "#E7E3DE";

/** The no-profile teaser's "Good match?" pill and its question mark (v9, read off the hand-off): 5.6:1 with white (computed). */
export const TEASER_INK = "#636F42";

/** An unchosen answer row's outline, and the empty tick circle on it (v9, read off the hand-off). */
export const OPTION_LINE = "#E3DFDA";
export const CHECK_RING = "#D6D2CC";

// ── Lines ───────────────────────────────────────────────────────────────────

/** Hairlines, dividers, unselected control borders, inactive progress dots. */
export const LINE = "#E3DFDA"; // v9

/** The empty avatar's disc behind the see-through picture (v7, read off the hand-off). */
export const AVATAR_FILL = "#ECE8E3"; // v9

// ── Controls ────────────────────────────────────────────────────────────────

/**
 * Selected-control fill — a very light, watery peach.
 *
 * This was ink at 6% alpha, which is a neutral grey wash: correct on paper,
 * and on screen it read as "disabled" rather than "chosen". A warm tint says
 * the same thing in the palette's own voice. Derived from the old call-to-action peach (#E09070) at
 * roughly 12% over the canvas, so selection and the primary action come from
 * one family without a selected chip ever being mistaken for a button — the
 * chip is a pale tint behind an ink border, the button is a saturated fill.
 *
 * INK at 15:1 on this fill, so a selected label is the highest-contrast text
 * on the screen, which is what "chosen" should look like.
 */
export const SELECTED = "#EEEFE7"; // v9 pale sage

/**
 * The product result's no-profile "Is it right for your skin?" card (v7, read
 * off the hand-off), and Home's two Explore tiles (`HOME_TILE.tile`).
 */
export const HOME_CARD_FILL = "#EEF1E7"; // v9 pale sage

/**
 * Home (handoff_home_and_tip): Explore's two square tiles share one tint, the
 * pale sage, and the flat butter "Start your routine" card is the one warm
 * accent. The hand-off gave the second tile a soft lavender (`#EFEBF1`); three
 * tints on three similar cards read as a template (design critique, 7 October
 * 2026), so one family carries the row.
 */
export const HOME_TILE = { tile: HOME_CARD_FILL, start: "#F6F0E2" } as const;

/**
 * Home's routine card and the skincare tip's note (handoff_home_and_tip, read
 * off the hand-off): a watery wash, light blue from 3 pm and butter before.
 * `wash` is two soft corner glows over a base with a white bloom in the
 * middle; `active` fills the active step's pill; `ink` is the note's small
 * label and its reason; `icon` draws the moon or the sun. The other pills are
 * frosted white (`pill`, ringed with `pillRing`).
 */
export const HOME_TODAY = {
  evening: { wash: { a: "#E4E8F5", b: "#DCE1F2", base: "#EBEEF7" }, active: "#4A5272", ink: "#3C4460", icon: "#3C4460" },
  morning: { wash: { a: "#FAEDE4", b: "#F5E8D0", base: "#FAF3E6" }, active: "#D9A24A", ink: "#5A4318", icon: "#C98A26" },
  pill: "rgba(255,255,255,0.55)",
  pillRing: "rgba(255,255,255,0.85)",
} as const;

/**
 * The rounded blocks of a menu (Profile, Account, the routine screen): grouped
 * cards with dividers — white in v7, the stone card fill in v9. No coloured
 * tiles; colour is saved for Home and the scan moments.
 */
export const MENU_FILL = SURFACE; // v9: soft stone, like every card

/**
 * The product result's list rows (design_handoff_skincare_cards, read off its
 * README): the soft disclosure chevron at a row's end.
 */
export const ROW_CHEVRON = "#B9A79E";

/**
 * The button colours, one set per variant (owner, 27 September 2026): primary
 * for the one main action on a screen, secondary for a less critical one,
 * tertiary as an outline for low-emphasis actions, and one disabled look for
 * all three. Secondary's label is INK, not white: white on its fill is 2.1:1,
 * INK 7.6:1 (computed). The raw values live in `lib/colors.ts`.
 */
export const BUTTON = {
  primary: { fill: COLORS.buttonPrimary, pressed: COLORS.buttonPrimaryPressed, label: COLORS.buttonPrimaryText },
  secondary: { fill: COLORS.buttonSecondary, label: INK },
  tertiary: { border: COLORS.buttonTertiary, label: COLORS.buttonTertiary, borderWidth: 1.5 },
  destructive: { fill: DESTRUCTIVE_OUTLINE.fill, label: DESTRUCTIVE_OUTLINE.label },
  disabled: { fill: COLORS.buttonDisabled, label: WHITE },
} as const;

/**
 * The scanner's Barcode | Ingredient list switch (owner, 2 October 2026): the
 * chosen pill is the main button's sage with its white label. `camera` is
 * over the live camera, `page` on the cream permission screen.
 */
export const SCANNER_SWITCH = {
  camera: { track: "rgba(255,255,255,0.14)", thumb: BUTTON.primary.fill, label: WHITE, chosenLabel: BUTTON.primary.label, thumbShadow: null, fontSize: 15 },
  page: { track: SWITCH_TRACK_GLASS, thumb: BUTTON.primary.fill, label: MUTED, chosenLabel: BUTTON.primary.label, thumbShadow: null, fontSize: 15 },
} as const;

/**
 * A chosen option in any selectable control — quiz cards, skin-profile chips,
 * filter pills: the same look the app always had, a darker outline around a
 * pale fill with ink words, in the primary button's colour rather than the
 * old peach (owner, 27 September 2026). `accent` is that colour for a word or
 * an icon (the Filter's current choice, the quiz tick's disc).
 *
 * v7 (read off the hand-off): fill `#F3E5DA` — the tab bar's current pill
 * too — with a terracotta border, and the terracotta text link for a word.
 */
export const CHOSEN = { fill: "#EEF1E7", border: BUTTON.primary.fill, label: INK, accent: LINK } as const; // v9

/**
 * The corner scale: four steps for every rounded rectangle in the app (7 October
 * 2026, from the design critique: about 20 different radii had grown up, which
 * is what makes screens look assembled). A circle is half its own size and a pill
 * half its own height, so those are computed where they are drawn, not taken from
 * here. A shape nested in another takes the outer radius less the gap between
 * them (the filter popover's rows).
 *
 * - `control` 14: small controls, verdict pills, steppers, chips with corners.
 * - `card` 20: cards, rows, boxes: a product row, a reason, a list group.
 * - `panel` 28: large cards: the routine card, story cards, the ingredient box.
 * - `sheet` 36: pop-ups and sheets, including the product result's white sheet.
 */
export const RADIUS = { control: 14, card: 20, panel: 28, sheet: 36 } as const;

// ── Match verdict ───────────────────────────────────────────────────────────

export type VerdictTone = "high" | "medium" | "low";

/**
 * Green / orange / red, pulled warm and desaturated so they belong to this
 * palette rather than to a browser's default alert colours. v7 values (29
 * September 2026), read off the hand-off: `solid` is a ring or dot, `deep`
 * its text, `tint` a score's track and a band label's fill, `wash` the light
 * card behind a reason. Every `deep` clears 5:1 on its tint and wash
 * (computed), and Good's `solid` 4.0:1 on its tint.
 *
 * Three roles per tone, and they are not interchangeable:
 *
 *   solid  the 4px bar down a card's leading edge. Carries the verdict when
 *          someone is scanning a list and reading nothing.
 *   tint   the badge fill. Quiet enough to sit on a white card without
 *          becoming the loudest thing in the row.
 *   deep   the badge label on that tint. Every pairing clears 4.5:1.
 *
 * The previous set were muted derivatives of the peach and rose accents,
 * which meant "fair" and "poor" differed by about as much as two neighbouring
 * swatches — legible side by side, indistinguishable one at a time.
 */
export const VERDICT: Record<
  VerdictTone,
  { solid: string; tint: string; deep: string; wash: string; halo: string; label: string }
> = {
  // v9 warm earth (README's band table): solid and deep read off the
  // hand-off; tint is the hue at about 86% white as the README says, and wash
  // and halo are read off the screens where drawn, else computed the same way.
  // Latest v9 round (design_handoff_formee_v9): olive, orange and soft red.
  // One colour per band for ring, dot and pill; `deep` is the verdict word.
  // Fair's `deep` is darker than the hand-off's `#C26E1E` (computed, 6 October
  // 2026 critique): that read 3.4-3.8:1 on white, the tint and the page, under
  // the 4.5:1 a 13-15pt word needs ("Watch", "Moderate", "In a routine"), and
  // white on it as a pill was no better. `#A85A14` is 5.1:1 on white and 4.55:1
  // on the tint. Good's and Poor's words are still the hand-off's (3.1:1 and
  // 4.39:1 on white): left for the owner, since Good is the brand's olive.
  // Good's word is its ring colour, 3.1:1 on white (computed): the hand-off
  // only sets it at 15pt semibold or larger, or as white on the filled pill.
  high: { solid: "#8A9A5B", tint: "#EEF1E7", deep: "#8A9A5B", wash: "#EEF1E7", halo: "#EEF1E7", label: "Great match" },
  medium: { solid: "#E78B30", tint: "#FBF1E6", deep: "#A85A14", wash: "#FBF1E6", halo: "#FBF1E6", label: "Fair match" },
  low: { solid: "#E56B65", tint: "#FFECE9", deep: "#CC4F49", wash: "#FFECE9", halo: "#FFECE9", label: "Poor match" },
};

/**
 * An Excellent score's ring and number (v7): a deeper green than Good, so the
 * best products stand apart, on Good's tint. Read off the hand-off.
 */
export const EXCELLENT = { solid: "#6B7A40", tint: "#EEF1E7", deep: "#6B7A40", wash: "#EEF1E7" } as const; // v9 dark olive

/** A score's ring, number and tint: Excellent's deeper green, else its tone's. */
export function scoreColours(verdict: Verdict): { solid: string; tint: string; deep: string } {
  if (verdict === "excellent") return EXCELLENT;
  const tone = toneForVerdict(verdict);
  return tone ? VERDICT[tone] : VERDICT_NEUTRAL;
}

/**
 * The unscored case. A formula we could not read is not a bad match — it is
 * an absent one, and giving it a red bar would say something we don't know.
 */
export const VERDICT_NEUTRAL = {
  solid: MUTED,
  tint: "#F2F1F0",
  deep: MUTED,
  wash: "#F4F2EE",
  halo: "#EAE4DF",
  label: "Can't tell yet",
} as const;

/**
 * `Verdict` carries five values because the MVP's score bands do; `matchTone`
 * carries three because that is how many colours a person can tell apart at a
 * glance. This is the bridge: excellent and good are both a yes, and the
 * number beside the badge is what separates 92 from 78.
 */
function toneForVerdict(verdict: Verdict): VerdictTone | null {
  if (verdict === "excellent" || verdict === "good") return "high";
  if (verdict === "fair") return "medium";
  if (verdict === "poor") return "low";
  return null; // "unknown" — use VERDICT_NEUTRAL
}

/**
 * The word shown for a verdict, everywhere one is shown.
 *
 * Keyed by `Verdict`, not by tone, because the tone collapse above is about
 * *colour* — it exists so a person is not asked to tell four greens apart.
 * The label has no such limit, and collapsing it too made a list row and the
 * product screen disagree out loud: an 89 read "Great match" in Browse (via
 * `VERDICT[tone].label`) and "Good match" on its own screen. Same product,
 * same score, two words. One map, read by both, is what stops that.
 *
 * It also restores what the badge is for. On a list sorted by score, every
 * row from 75 up carried the identical "Great match" — constant exactly
 * where the user is choosing between them.
 *
 * The wording is the MVP's locked wording, not a paraphrase: the bands are a
 * product decision the user reads the same way every time, so "Fair match"
 * rather than the older "Worth a look".
 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  excellent: "Excellent match",
  good: "Good match",
  fair: "Fair match",
  poor: "Poor match",
  unknown: VERDICT_NEUTRAL.label,
};

/** Warning text that is not a verdict: flagged-ingredient counts, cautions. */
export const WARN = VERDICT.medium.deep;

/** Destructive actions — "erase my profile", and nothing else. */
export const DANGER = VERDICT.low.deep;

// ── One-off screen accents ──────────────────────────────────────────────────
// Repeated raw hex that had no name anywhere — extracted here rather than
// left inline, per this file's own header. Values are unchanged from what
// each screen already drew; this only gives them a name and a single place
// to change from.

/** The scanner's corner-bracket frame: plain white in v7 (read off the
 *  hand-off, 29 September 2026). */
export const SCANNER_FRAME = "#FFFFFF";

// ── Camera stage ────────────────────────────────────────────────────────────

/**
 * The scanner's full-bleed dark ground, and the only dark surface in the app.
 *
 * A camera stage cannot sit on CANVAS: the viewfinder has to read as a
 * surface you are *inside*, and cream around a live frame reads as a card.
 * v7's warm near-black, read off the hand-off (29 September 2026). It
 * was hand-typed as `#17161B` at three sites and as
 * `rgba(23,22,27,0.55)` at two more — the same colour in five places, which
 * is exactly what this file exists to stop. Pair it with {@link withAlpha}
 * for the translucent chrome rather than re-typing the triplet.
 */
export const CAMERA_STAGE = "#1C1816";

/**
 * The type scale, as raw numbers.
 *
 * The mirror of `tailwind.config.js`'s `fontSize` block, and the reasoning for
 * the six steps lives there rather than being restated here. Keep the two in
 * sync — the same standing rule the palette carries.
 *
 * A mirror rather than a migration to `className` on purpose. Most text in this
 * app is styled with an inline `fontSize`, and moving all ~130 of them to
 * utilities would be betting that NativeWind's emitted CSS survives
 * react-native-web's style compiler. That bet has already been lost once in
 * this codebase, with `fontFamily` — see the long note in
 * `components/Text.tsx` about every screen rendering its body copy in Times
 * New Roman. Numbers are safe where a family was not, but there is no reason
 * to find out the hard way a second time.
 *
 * Migrate a screen at a time. Both mechanisms are valid throughout, so nothing
 * is half-broken in between:
 *
 *   fontSize: 13        ->  fontSize: TYPE.body
 *   className="text-[11.5px]"  ->  className="text-caption"
 */
/**
 * The minimum height of anything tappable.
 *
 * Platform-split on purpose, because the two guidelines disagree and neither
 * is "the" number: Apple's HIG asks for 44pt, Material for 48dp. Shipping 44
 * everywhere is the common shortcut and leaves every Android control 4dp short
 * of its own platform's floor — invisible on the reviewer's iPhone, real on the
 * device it is wrong on.
 *
 * Web is a third answer again (WCAG 2.2 SC 2.5.8 is 24 CSS px, with
 * exceptions), and `react-native-web` reports as neither iOS nor Android, so it
 * falls to the `default` branch. 44 there is well above the requirement and
 * matches what a phone-shaped layout wants anyway.
 */
export const TOUCH_TARGET = Platform.select({ ios: 44, android: 48, default: 44 }) as number;

/** The floating tab bar's height (v7: 56pt). A segmented control is 44pt (`SWITCH_HEIGHT`). */
export const CAPSULE_HEIGHT = 56;

/**
 * v7 (29 September 2026, read off the hand-off): SF 13 captions and meta, 15
 * body and list names, 17 labels and card headings, 20 a product name or the
 * ingredient box's header; the display face only for a screen's one title (24 on a
 * pushed screen, 30 on a tab root) and the score (34).
 */
export const TYPE = {
  caption: 13,
  label: 15,
  body: 15,
  card: 17,
  title: 20,
  heading: 24,
  large: 30,
  display: 34,
} as const;

/**
 * The one display face (v9, design_handoff_formee_v9): PT Serif Bold, upright,
 * for a screen's title, an ingredient's name and the score. Everything else
 * is the system font. (v9's first round drew Instrument Serif and DM Sans,
 * which read too small on a phone; the owner went back to v7's Playfair on
 * 1 October 2026, and the hand-off then settled on PT Serif.)
 */
export const DISPLAY_FONT = "PTSerif_700Bold";

/**
 * The Profile menu's row names (owner, 2 October 2026, after a reference
 * screenshot): a rounder geometric sans, semibold. Figtree is the closest
 * match found to the reference, not a confirmed identification.
 */
export const MENU_FONT = "Figtree_600SemiBold";

/** A card's corners: `RADIUS.card`. Every card, white or tinted, is its fill alone: no border, no shadow. Kept by name because many files import it. */
export const CARD_RADIUS = RADIUS.card;

/**
 * How far iOS Larger Text / Android font size may grow text (#314). The
 * accessibility sizes scale text about 3×, which no fixed layout here
 * survives, so text grows up to these multiples and stops:
 * - `display`: the display-face headings, already the largest text.
 * - `ui`: everything else — reading text, labels, chips, buttons, badges.
 *   One ceiling for both keeps a paragraph from outgrowing its own heading.
 * - `reading`: inside a `ReadingScale` (#334) — the reading part of the
 *   product, ingredient and label-result screens — body text may grow this
 *   far, which is above iOS's largest size (about 3.57×), so it never stops.
 *   Larger text there stops at the size body text reaches
 *   (`TYPE.body × reading`), so a heading ends level with its paragraphs
 *   rather than three times their size, and never below them.
 * - `icon`: how far an icon beside reading text grows with it (#334) — a
 *   chevron, a tick, the score ring. Far enough to stay visible next to
 *   large words, not so far that it takes their width.
 * Applied in `components/Text.tsx`; see `docs/decisions.md`.
 */
export const FONT_SCALE = {
  display: 1.3,
  ui: 1.5,
  reading: 3.6,
  icon: 2,
} as const;

/**
 * The handwritten face for a journal note (#229), and nothing else — the
 * mirror of `tailwind.config.js`'s `fontFamily.note`. Whether a given note
 * actually gets it is `lib/note-font.ts`'s call, never a component's.
 */
export const NOTE_FONT = "Caveat_500Medium";

/**
 * Tip of the day (v7 update, 29 September 2026, read off the hand-off): a
 * white paper note on Home — the one place tape is allowed. Handwriting at
 * 22/1.25 with room for two lines, small paper corners, a three-layer soft
 * shade that makes it read as paper, the strip of tape across its top, and
 * the ochre sparkles of a shuffle.
 */
export const TIP_NOTE = {
  fontSize: 22,
  lineHeight: 27.5,
  minHeight: 56,
  radius: 4,
  tape: "rgba(214,196,170,0.6)",
  shadow: "0 1px 1px rgba(36,31,30,0.10), 0 4px 8px rgba(36,31,30,0.08), 0 12px 20px rgba(36,31,30,0.06)",
  sparkle: STAR_ON,
} as const;

/**
 * A token color at partial opacity, as an `rgba()` string — for translucent
 * overlays a plain hex can't express (light-on-dark camera chrome, a pressed
 * wash) without hand-typing the same RGB triplet at every call site. Derives
 * from the token itself, so a token's hex value changing — CANVAS already
 * has once — doesn't leave stale hand-typed copies scattered across screens.
 */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Vertical rhythm for a content screen: `text` between lines of text, `block`
 * between cards in a group, `section` between sections, `gutter` at the
 * screen's sides. v7 allows only 4, 8, 12, 16, 24 and 32.
 */
export const SPACE = { text: 8, block: 12, section: 24, gutter: 16 } as const;

/**
 * The heavy shadow under the camera button, so it reads as sitting on top of the
 * tab bar rather than being part of it: pushed well below the button, dark, and
 * spread wide enough to fall across the bar's surface.
 */
export const RAISED_SHADOW = {
  shadowColor: INK,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.24,
  shadowRadius: 14,
  elevation: 16,
} as const;

/** The soft shade under something floating: the tab bar, a sheet, a menu (v7: 0 8 18 at 12%). */
export const FLOATING_SHADOW = {
  shadowColor: INK,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.12,
  shadowRadius: 18,
  elevation: 12,
} as const;

/** A 40pt icon circle's shade: back, close, heart, share, star (v7: 0 2 10 at 10%). */
export const ICON_SHADOW = {
  shadowColor: INK,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 10,
  elevation: 3,
} as const;

/** A popover menu's shade: the filter (v7: 0 12 32 at 18%). */
export const MENU_SHADOW = {
  shadowColor: INK,
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.18,
  shadowRadius: 32,
  elevation: 12,
} as const;

/**
 * A card's shade — none in v7: a card is its fill alone. Kept as a name so
 * every card still spreads it, and one place decides.
 */
export const CARD_SHADOW = {} as const;

/**
 * Skin needs (design_handoff "october 3d", BHA Story Preview, read off the
 * hand-off unless marked): the questions' chips, the carousel's family cards,
 * the story's cards, its sheets and toast.
 */
export const SKIN_NEEDS = {
  /** A chip's outline, a story's progress bar not reached yet, an empty day on a calendar. */
  line: "#E6E2DD",
  /** A chosen chip's label, and a pale sage pill's (the goal, the strength scale, a second button). */
  chosenInk: "#4F523C",
  /** The pale sage of the goal chip, the strength scale and a second button. */
  sage: "#ECEEE2",
  /** A white pill's text and a pager dot not current. */
  dotOff: "#DDD6D0",
  /** "How often do I use it?"'s note card. */
  note: "#F6E4E0",
  /** "Later" on the calendar: a dashed ring. */
  later: "#A9AD92",
  /** "When do I use it?": the morning tile, its word and sun; the evening tile and its line. */
  morning: { fill: "#F7EED8", ink: "#5A4318", sun: "#C98A26", sunFill: "#E7A93C" },
  evening: { fill: "#3C4460", line: "#D3D6E2" },
  /** The active's own step on the rail, and the "New" badge: a deep apricot on the family's tint. */
  stepInk: "#9A5A2E",
  /** The strength scale's "more", struck through. */
  over: { fill: "#F3ECE3", ink: "#A8968A" },
  /** "Avoid pairing with"'s handwriting. Same as WARN. */
  warn: "#A85A14",
  /** Active nights on the routine's days, and the new active on the clash calendar. */
  amber: "#E7A93C",
  /** The active already in the routine, on the clash calendar. */
  mauve: "#C9A5B8",
  /** The step-count switch's track on "Let's start your routine". */
  track: "#EFEBE6",
  /** The carousel card's shade (0 10 30, a warm brown at 16%). */
  cardShadow: { shadowColor: "#A66C46", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 30, elevation: 6 },
  /** The toast's shade (0 10 30 at 18%). */
  toastShadow: { shadowColor: INK, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 30, elevation: 10 },
  /** Each family's card tint, the same on the carousel and on the story's rail. */
  family: {
    exfoliants: "#FBEBDD",
    retinoids: "#F6E9E2",
    brighteners: "#FAEBD3",
    "acne-oil": "#ECEEE2",
    calming: "#EEF1E7",
    hydrators: "#E9EEF0",
    barrier: "#F7EBE7",
    antioxidants: "#E9EEDF",
    peptides: "#F6E6E6",
    uv: "#F8F1E1",
  },
  /** The six dashes under "6 quick cards" (#E2C4AC on the apricot card): ink at 14%, so they show on every tint (inferred). */
  dash: "rgba(47,44,42,0.14)",
} as const;

/** Handwritten notes on Skin needs' pictures, and the skincare tip's text (hand-off: Kalam). */
export const HAND_FONT = "Kalam_400Regular";
/** Home's "Hi there!" (handoff_home_and_tip: Kalam 700 34). */
export const HAND_FONT_BOLD = "Kalam_700Bold";
