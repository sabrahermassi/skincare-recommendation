import { Platform } from "react-native";

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
 * The page ground everywhere — including onboarding and the quiz, whose
 * shells (`components/shell/shared.tsx`) re-export this rather than keeping
 * a second local copy. `#FBF6EE` is the FOR.ME reskin's second, slightly
 * warmer cream — it replaced this file's original `#FDF8F3` and
 * `lib/colors.ts` / `tailwind.config.js`'s older `#FAF7F3` in the same pass,
 * so every screen, old system or new, now shares one background value.
 * Contrast figures below were re-verified against this value.
 */
export const CANVAS = "#FBF6EE";

/**
 * Raised card fill. White, not a tint of the canvas — a card has to separate
 * from the ground by its own value, and canvas-on-canvas needed a border to
 * do the job the fill should have been doing.
 */
export const SURFACE = "#FFFFFF";

// ── Text ────────────────────────────────────────────────────────────────────

/**
 * Body copy and headings. Warm near-black at 15:1 — the previous #5A342C was
 * a mid-brown at 9.8:1, which passed on paper and read as washed out on a
 * screen, because it sat only a couple of steps from the accents around it.
 */
export const INK = "#241F1E";

/** Secondary text, 6.1:1. The old #96605A was close enough to the accent
 *  browns that a muted line and a peach surface read as the same weight. */
export const MUTED = "#6B5A54";

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
 * survives. Marks that are *not* text keep MUTED_SOFT below.
 */
export const MUTED_FAINT = "rgba(107,90,84,0.88)";

/** Chevrons and other non-text marks that must not compete with a label. */
export const MUTED_SOFT = "rgba(107,90,84,0.45)";

/**
 * Unselected tab-bar icons. #9A8880 computes to 3.14:1 on CANVAS (WCAG 2.2
 * SC 1.4.11 asks 3:1 of a control's icon) and 4.8:1 against INK. The selected
 * tab is INK, and MUTED sat only 2.5:1 from it — two dark browns — which is why
 * the selected tab was hard to pick out. Computed, not read off a mockup.
 */
export const TAB_INACTIVE = "#9A8880";

// ── Lines ───────────────────────────────────────────────────────────────────

/** Hairlines, dividers, unselected control borders, inactive progress dots. */
export const LINE = "#E4D3C8";

/** @deprecated Prefer {@link LINE}. Kept because it names the same value in
 *  the control-state code that already reads well as "border, inactive". */
export const BORDER_INACTIVE = LINE;
export const DOT_INACTIVE = LINE;

// ── Primary action ──────────────────────────────────────────────────────────

/**
 * The one call to action per screen.
 *
 * NOT the peach accent — that distinction is the whole point of this pair.
 * The old fill was the accent peach itself at 1.51:1 against the canvas, so
 * the button dissolved into the page and had to be found rather than seen.
 * This is 2.3:1 against the canvas and 6.5:1 against its own label, which is
 * a button you can see and read. Pill shape, 26px radius, weight 500.
 */
export const CTA = "#E09070";
export const CTA_PRESSED = "#C97C58";

/**
 * Selected-control fill — a very light, watery peach.
 *
 * This was ink at 6% alpha, which is a neutral grey wash: correct on paper,
 * and on screen it read as "disabled" rather than "chosen". A warm tint says
 * the same thing in the palette's own voice. Derived from CTA (#E09070) at
 * roughly 12% over the canvas, so selection and the primary action come from
 * one family without a selected chip ever being mistaken for a button — the
 * chip is a pale tint behind an ink border, the button is a saturated fill.
 *
 * INK at 15:1 on this fill, so a selected label is the highest-contrast text
 * on the screen, which is what "chosen" should look like.
 */
export const SELECTED = "#F9E7DC";
/** One step warmer, for a selected surface that needs to sit above SELECTED. */
export const SELECTED_STRONG = "#F5DCCC";

/** Neutral pressed/active wash for controls that are not selections. */
export const INK_TINT = "rgba(36,31,30,0.06)";

/**
 * One shape for every selectable control in the app — chips, option cards,
 * filter pills, segmented tabs. Size varies with the job (a 2-per-row quiz
 * chip is not a filter pill), the corner never does: a screen mixing 999-px
 * pills with 14-px chips reads as two design systems arguing.
 */
export const RADIUS_SELECTOR = 14;

// ── Illustration accents ────────────────────────────────────────────────────

/**
 * Illustration and status only — never a UI surface, and never a button.
 * `peach` here is the *accent* peach and is deliberately not {@link CTA}.
 */
export const ACCENT = {
  peach: "#FCD6C6",
  blush: "#FCE1DB",
  rose: "#F6CAC9",
  sage: "#CDD8BE",
  lilac: "#D1B7DA",
} as const;

// ── Match verdict ───────────────────────────────────────────────────────────

export type VerdictTone = "high" | "medium" | "low";

/**
 * Green / orange / red, pulled warm and desaturated so they belong to this
 * palette rather than to a browser's default alert colours.
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
  { solid: string; tint: string; deep: string; label: string }
> = {
  high: { solid: "#3E7D5A", tint: "#DCEBE0", deep: "#2E5F44", label: "Great match" },
  medium: { solid: "#C2662B", tint: "#FAE3CE", deep: "#8F4A1C", label: "Fair match" },
  low: { solid: "#B23A32", tint: "#F7D9D5", deep: "#8C2A24", label: "Poor match" },
};

/**
 * The unscored case. A formula we could not read is not a bad match — it is
 * an absent one, and giving it a red bar would say something we don't know.
 */
export const VERDICT_NEUTRAL = {
  solid: LINE,
  tint: "#F1EAE4",
  deep: MUTED,
  label: "Can't tell yet",
} as const;

/**
 * `Verdict` carries five values because the MVP's score bands do; `matchTone`
 * carries three because that is how many colours a person can tell apart at a
 * glance. This is the bridge: excellent and good are both a yes, and the
 * number beside the badge is what separates 92 from 78.
 */
export function toneForVerdict(verdict: Verdict): VerdictTone | null {
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

/** The scanner's corner-bracket frame and its measurement caption
 *  (`app/(tabs)/index.tsx`) — a hair warmer than white, read off the mockup
 *  at its own stated measurements. */
export const SCANNER_FRAME = "#FDFCFA";

/** The result screen's two risk-card icon strokes (`components/RiskCards.tsx`) —
 *  a muted sage, independent of each card's own good/watch/avoid tone. */
export const RISK_ICON = "#6D9A7E";

/** The result screen's risk-card titles (`components/RiskCards.tsx`). */
export const RISK_TITLE = "#4C574F";

/** The "Clogging" badge on a pore-clogging ingredient row
 *  (`components/IngredientTabsList.tsx`) — fill and ink. */
export const CLOG_BADGE_TINT = "#FBE2E7";
export const CLOG_BADGE_INK = "#A4526A";

// ── Camera stage ────────────────────────────────────────────────────────────

/**
 * The scanner's full-bleed dark ground, and the only dark surface in the app.
 *
 * A camera stage cannot sit on CANVAS: the viewfinder has to read as a
 * surface you are *inside*, and cream around a live frame reads as a card.
 * This was hand-typed as `#17161B` at three sites and as
 * `rgba(23,22,27,0.55)` at two more — the same colour in five places, which
 * is exactly what this file exists to stop. Pair it with {@link withAlpha}
 * for the translucent chrome rather than re-typing the triplet.
 */
export const CAMERA_STAGE = "#17161B";

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

export const TYPE = {
  caption: 12,
  label: 14,
  body: 16,
  title: 20,
  heading: 24,
  display: 34,
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
 * between a block and the next (text to card, card to card), `gutter` at the
 * screen's sides. A screen lays its blocks in a column with `gap: SPACE.block`
 * instead of each block carrying its own margin.
 */
export const SPACE = { text: 8, block: 16, gutter: 24 } as const;

/** The shade under the raised camera button's bottom edge, so it stands off the bar. */
export const RAISED_SHADOW = {
  shadowColor: INK,
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.32,
  shadowRadius: 4,
  elevation: 8,
} as const;

/** The soft shade under the floating tab bar, so it reads as lying on top of the screen. */
export const FLOATING_SHADOW = {
  shadowColor: INK,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.16,
  shadowRadius: 18,
  elevation: 12,
} as const;

/** A card lifted off the screen: a shade under its bottom edge. */
export const CARD_SHADOW = {
  shadowColor: INK,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.14,
  shadowRadius: 12,
  elevation: 5,
} as const;
